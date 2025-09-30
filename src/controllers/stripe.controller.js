exports.createCheckoutSession = async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  try {
    console.log("createCheckoutSession");
    const { amount, currency, success_url, cancel_url, metadata } = req.body;

    // Prépare le routage des fonds (destination charges) si l'expert a un compte Connect
    const BookedSlot = require('../models/bookedSlot.model');
    const Expert = require('../models/experts.model');

    let connectedAccountId = null;
    let applicationFeeAmount = null;

    // Tente de retrouver l'expert via le bookedSlotId (recommandé)
    const bookedSlotId = metadata?.bookedSlotId;
    if (bookedSlotId) {
      const slot = await BookedSlot.findById(bookedSlotId).populate('expert');
      if (slot && slot.expert && slot.expert.stripeAccountId) {
        connectedAccountId = slot.expert.stripeAccountId;
      }
    }

    // Calcule la commission plateforme (par défaut 15%)
    const feePercent = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT || 45);
    if (Number.isFinite(feePercent) && feePercent >= 0) {
      applicationFeeAmount = Math.round((Number(amount || 0)) * (feePercent / 100));
    }

    const paymentIntentData = {
      metadata: metadata || {},
      capture_method: 'manual'
    };

    if (connectedAccountId) {
      paymentIntentData.application_fee_amount = applicationFeeAmount || 0;
      paymentIntentData.transfer_data = { destination: connectedAccountId };
      paymentIntentData.on_behalf_of = connectedAccountId;
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const successUrlFinal = success_url || `${baseUrl}/mon_rdv?success=1`;
    const cancelUrlFinal = cancel_url || `${baseUrl}/mon_rdv?success=0`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency || 'eur',
          product_data: { name: 'Consultation' },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: successUrlFinal,
      cancel_url: cancelUrlFinal,
      customer_email: req.user?.email,
      metadata: metadata || {},
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
      // Calculer prochain mardi à 13:30 (heure serveur)
      const now = new Date();
      const schedule = new Date(now);
      const day = now.getDay(); // 0=dimanche..1=lundi..2=mardi..6=samedi
      const isTodayTuesday = day === 2;
      const before1330 = (now.getHours() < 13) || (now.getHours() === 13 && now.getMinutes() < 30);
      const daysUntilNextTuesday = isTodayTuesday && before1330 ? 0 : ((9 - day + 7) % 7);
      schedule.setDate(now.getDate() + daysUntilNextTuesday);
      schedule.setHours(13, 30, 0, 0);
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
