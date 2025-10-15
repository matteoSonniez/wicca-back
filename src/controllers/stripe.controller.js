exports.createCheckoutSession = async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  try {
    console.log("createCheckoutSession");
    const { amount, currency, success_url, cancel_url, metadata } = req.body;
    const baseAmount = Math.round(Number(amount || 0));
    const currencyNorm = String(currency || 'eur').toLowerCase();
    const fixedSurchargeCents = currencyNorm === 'eur' ? 30 : 0; // +0,30€ pour EUR

    // Prépare le routage des fonds (destination charges) si l'expert a un compte Connect
    const BookedSlot = require('../models/bookedSlot.model');
    const Expert = require('../models/experts.model');

    let connectedAccountId = null;
    let applicationFeeAmount = null;
    let bookedSlotDoc = null;

    // Tente de retrouver l'expert via le bookedSlotId (recommandé)
    const bookedSlotId = metadata?.bookedSlotId;
    if (bookedSlotId) {
      bookedSlotDoc = await BookedSlot.findById(bookedSlotId).populate('expert');
      if (bookedSlotDoc && bookedSlotDoc.expert && bookedSlotDoc.expert.stripeAccountId) {
        connectedAccountId = bookedSlotDoc.expert.stripeAccountId;
      }
    }

    // Commission dynamique: 30% si premier RDV payé entre ce client et cet expert, sinon 10%
    let feePercent = 10;
    try {
      if (bookedSlotDoc) {
        const expertIdForFee = (bookedSlotDoc.expert && (bookedSlotDoc.expert._id || bookedSlotDoc.expert)) || null;
        const clientIdForFee = bookedSlotDoc.client || null;
        if (expertIdForFee && clientIdForFee) {
          const previousPaid = await BookedSlot.exists({
            expert: expertIdForFee,
            client: clientIdForFee,
            paid: true,
            cancel: { $ne: true }
          });
          feePercent = previousPaid ? 10 : 30;
        }
      }
    } catch (_) {
      feePercent = 10;
    }
    // Commission de base (10% ou 30%) calculée sur le montant de base, puis on ajoute 0,30€ à NOS frais (pas à l'expert)
    const baseFeeAmount = Math.round(baseAmount * (feePercent / 100));
    const totalAmountCents = baseAmount + fixedSurchargeCents; // Montant payé par le client
    applicationFeeAmount = baseFeeAmount + (fixedSurchargeCents); // Nous gardons la commission + 0,30€

    const paymentIntentData = {
      metadata: metadata || {},
      capture_method: 'manual'
    };
    // Ajoute la commission + surcharge pour traçabilité
    try {
      paymentIntentData.metadata = Object.assign({}, paymentIntentData.metadata, {
        feePercent: String(feePercent),
        baseAmountCents: String(baseAmount),
        fixedSurchargeCents: String(fixedSurchargeCents),
        feeAmountCents: String(applicationFeeAmount),
        totalAmountCents: String(totalAmountCents)
      });
    } catch (_) {}

    if (connectedAccountId) {
      // En destination charge, l'application fee inclut la commission + 0,30€
      paymentIntentData.application_fee_amount = applicationFeeAmount || 0;
      paymentIntentData.transfer_data = { destination: connectedAccountId };
      paymentIntentData.on_behalf_of = connectedAccountId;
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const successUrlFinal = success_url || `${baseUrl}/mon_rdv?success=1`;
    const cancelUrlFinal = cancel_url || `${baseUrl}/mon_rdv?success=0`;

    const sessionMetadata = (() => {
      try {
        return Object.assign({}, metadata || {}, {
          feePercent: String(feePercent),
          baseAmountCents: String(baseAmount),
          fixedSurchargeCents: String(fixedSurchargeCents),
          totalAmountCents: String(totalAmountCents)
        });
      } catch (_) {
        return metadata || {};
      }
    })();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency || 'eur',
          product_data: { name: 'Consultation' },
          unit_amount: totalAmountCents,
        },
        quantity: 1,
      }],
      success_url: successUrlFinal,
      cancel_url: cancelUrlFinal,
      customer_email: req.user?.email,
      metadata: sessionMetadata,
      payment_intent_data: paymentIntentData
    });
    // Sauvegarder l'id de session Stripe sur le slot
    if (bookedSlotId && session?.id) {
      try { await BookedSlot.findByIdAndUpdate(bookedSlotId, { $set: { stripeSessionId: session.id } }); } catch (_) {}
    }

    // Planifier une expiration programmée côté serveur à la fin du hold (in-memory)
    try {
      if (bookedSlotId) {
        const slot = await BookedSlot.findById(bookedSlotId).select('holdExpiresAt');
        if (slot?.holdExpiresAt instanceof Date) {
          const delayMs = slot.holdExpiresAt.getTime() - Date.now();
          if (delayMs > 0) {
            setTimeout(async () => {
              try {
                await stripe.checkout.sessions.expire(session.id);
              } catch (_) {}
            }, delayMs);
          }
        }
      }
    } catch (_) {}
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Webhook Stripe
exports.webhook = async (req, res) => {
  // console.log("webhook");
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // console.log("payement ok", process.env.STRIPE_WEBHOOK_SECRET);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    // console.error('Erreur Stripe webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Gestion des événements Stripe
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    // Paiement confirmé mais capture manuelle -> status requires_capture
    const session = event.data.object;
    const bookedSlotId = session.metadata?.bookedSlotId;
    const paymentIntentId = session.payment_intent;
    if (bookedSlotId && paymentIntentId) {
      const BookedSlot = require('../models/bookedSlot.model');
      // Calculer PROCHAIN mercredi 12:30 (jamais dans le passé)
      const now = new Date();
      let schedule = new Date(now);
      const day = now.getDay(); // 0=dimanche..1=lundi..6=samedi
      const desiredDay = 3; // mercredi
      let daysAhead = (desiredDay - day + 7) % 7; // 0..6
      schedule.setDate(now.getDate() + daysAhead);
      schedule.setHours(12, 30, 0, 0);
      if (schedule <= now) {
        // si on est déjà mercredi 12:30 passé, bascule mercredi prochain
        schedule.setDate(schedule.getDate() + 7);
      }

      // S'assurer que la capture est APRES le RDV (date/heure du rendez-vous)
      try {
        const slot = await BookedSlot.findById(bookedSlotId).select('date start');
        if (slot && slot.date) {
          const rdvDateTime = new Date(slot.date);
          try {
            const [hh, mm] = String(slot.start || '00:00').split(':').map(Number);
            rdvDateTime.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
          } catch (_) {}

          if (schedule <= rdvDateTime) {
            // Recalcule: premier mercredi 12:30 STRICTEMENT après la date/heure du RDV
            const base = new Date(rdvDateTime);
            const baseDay = base.getDay(); // 0..6
            let da = (3 - baseDay + 7) % 7; // vers mercredi
            base.setDate(base.getDate() + da);
            base.setHours(12, 30, 0, 0);
            if (base <= rdvDateTime) {
              base.setDate(base.getDate() + 7);
            }
            schedule = base;
          }
        }
      } catch (_) {}
      await BookedSlot.findByIdAndUpdate(
        bookedSlotId,
        {
          $set: {
            authorized: true,
            paymentIntentId: String(paymentIntentId),
            authorizedAt: new Date(),
            captureScheduledFor: schedule
          },
          $unset: { holdExpiresAt: 1 }
        }
      );
    }
  } else if (event.type === 'payment_intent.succeeded') {
    // Capture réussie (manuelle ou auto)
    const paymentIntent = event.data.object;
    const bookedSlotId = paymentIntent.metadata?.bookedSlotId;
    if (bookedSlotId) {
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(
        bookedSlotId,
        { $set: { paid: true, capturedAt: new Date(), authorized: false }, $unset: { holdExpiresAt: 1 } }
      );
    }
  } else if (event.type === 'payment_intent.canceled') {
    // Autorisation annulée côté Stripe (expiration ou cancel)
    const paymentIntent = event.data.object;
    const bookedSlotId = paymentIntent.metadata?.bookedSlotId;
    if (bookedSlotId) {
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(
        bookedSlotId,
        { $set: { authorized: false }, $unset: { paymentIntentId: 1, captureScheduledFor: 1 } }
      );
    }
  } else if (event.type === 'account.updated') {
    // Synchronise les flags Connect sur le modèle Expert
    try {
      const Expert = require('../models/experts.model');
      const account = event.data.object;
      if (account && account.id) {
        await Expert.findOneAndUpdate(
          { stripeAccountId: account.id },
          {
            chargesEnabled: !!account.charges_enabled,
            payoutsEnabled: !!account.payouts_enabled
          }
        );
      }
    } catch (_) {}
  }

  res.status(200).json({ received: true });
};

// ===== Stripe Connect: endpoints pour l'espace expert =====

exports.createOrLinkConnectAccount = async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const Expert = require('../models/experts.model');
    const expert = req.expert;
    if (!expert) return res.status(403).json({ message: 'Réservé aux experts' });

    let accountId = expert.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        email: expert.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        }
      });
      accountId = account.id;
      await Expert.findByIdAndUpdate(expert._id, { stripeAccountId: accountId });
    }

    return res.status(200).json({ stripeAccountId: accountId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createOnboardingLink = async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const expert = req.expert;
    if (!expert) return res.status(403).json({ message: 'Réservé aux experts' });

    const accountId = expert.stripeAccountId;
    if (!accountId) return res.status(400).json({ message: 'Compte Stripe Connect non créé' });

    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const refreshUrl = `${baseUrl}/dashboard/paiement?status=refresh`;
    const returnUrl = `${baseUrl}/dashboard/paiement?status=return`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: refreshUrl,
      return_url: returnUrl
    });
    return res.status(200).json({ url: link.url });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getConnectStatus = async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const Expert = require('../models/experts.model');
    const expert = req.expert;
    if (!expert) return res.status(403).json({ message: 'Réservé aux experts' });

    if (!expert.stripeAccountId) {
      return res.status(200).json({
        hasAccount: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: {}
      });
    }

    const account = await stripe.accounts.retrieve(expert.stripeAccountId);
    // met à jour en base pour cohérence
    await Expert.findByIdAndUpdate(expert._id, {
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled
    });

    return res.status(200).json({
      hasAccount: true,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      requirements: account.requirements || {}
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createConnectLoginLink = async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const expert = req.expert;
    if (!expert) return res.status(403).json({ message: 'Réservé aux experts' });
    if (!expert.stripeAccountId) return res.status(400).json({ message: 'Compte Stripe Connect non créé' });

    const link = await stripe.accounts.createLoginLink(expert.stripeAccountId);
    return res.status(200).json({ url: link.url });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
