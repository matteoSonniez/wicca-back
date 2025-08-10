exports.createCheckoutSession = async (req, res) => {
  console.log("Appel de createCheckoutSession, body reçu :", req.body);
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  try {
    const { amount, currency, success_url, cancel_url, metadata } = req.body;
    console.log("metadata", req.body.metadata);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency || 'eur',
          product_data: {
            name: 'Consultation',
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: success_url || 'http://localhost:3000/mon_rdv?success=1',
      cancel_url: cancel_url || 'http://localhost:3000/mon_rdv?success=0',
      customer_email: req.user?.email,
      metadata: metadata || {}, // Pour la session elle-même (utile pour checkout.session.completed)
      payment_intent_data: {
        metadata: metadata || {} // Pour que le PaymentIntent ait aussi le bookedSlotId
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Webhook Stripe
exports.webhook = async (req, res) => {
  console.log("webhook");
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  console.log("payement ok", process.env.STRIPE_WEBHOOK_SECRET);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Erreur Stripe webhook:', err.message);
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
      await BookedSlot.findByIdAndUpdate(bookedSlotId, { cancel: false });
    }
  } else if (
    event.type === 'checkout.session.expired' ||
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.async_payment_expired'
  ) {
    // Paiement échoué ou session expirée
    console.log("payement échoué");
    const session = event.data.object;
    console.log("session.metadata :", session.metadata); // <--- ici aussi
    const bookedSlotId = session.metadata?.bookedSlotId;
    if (bookedSlotId) {
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(bookedSlotId, { cancel: true });
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    console.log('Paiement échoué via payment_intent.payment_failed');
    const paymentIntent = event.data.object;
    console.log("paymentIntent.metadata :", paymentIntent.metadata); // <--- tu dois voir ton bookedSlotId ici aussi
    const bookedSlotId = paymentIntent.metadata?.bookedSlotId;
    if (bookedSlotId) {
      console.log("bookedSlotId", bookedSlotId);
      const BookedSlot = require('../models/bookedSlot.model');
      await BookedSlot.findByIdAndUpdate(bookedSlotId, { cancel: true });
    }
  }

  res.status(200).json({ received: true });
};
