exports.createCheckoutSession = async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  try {
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
      metadata: metadata || {}
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

  console.log('Type d\'événement Stripe reçu :', event.type);
  // Traiter les événements pertinents
  if (event.type === 'checkout.session.completed') {
    // Paiement réussi
    console.log("payement réussi");
    const session = event.data.object;
    console.log("session.metadata :", session.metadata); // <--- tu dois voir ton bookedSlotId ici
    const bookedSlotId = session.metadata?.bookedSlotId;
    if (bookedSlotId) {
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(
        bookedSlotId,
        { $set: { cancel: false, paid: true }, $unset: { holdExpiresAt: 1 } }
      );
    }
  } else if (
    event.type === 'checkout.session.expired' ||
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.async_payment_expired'
  ) {
    // Paiement échoué ou session expirée
    console.log("payement échoué");
    const session = event.data.object;
    // console.log("session.metadata :", session.metadata); // <--- ici aussi
    const bookedSlotId = session.metadata?.bookedSlotId;
    if (bookedSlotId) {
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(bookedSlotId, { cancel: true, paid: false });
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    console.log('Paiement échoué via payment_intent.payment_failed');
    const paymentIntent = event.data.object;
    // console.log("paymentIntent.metadata :", paymentIntent.metadata); // <--- tu dois voir ton bookedSlotId ici aussi
    const bookedSlotId = paymentIntent.metadata?.bookedSlotId;
    if (bookedSlotId) {
      console.log("bookedSlotId", bookedSlotId);
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(bookedSlotId, { cancel: true, paid: false });
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
