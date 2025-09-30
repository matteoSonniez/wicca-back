const mongoose = require('mongoose');

const bookedSlotSchema = new mongoose.Schema({
  start: {
    type: String, // Format: HH:mm
    required: true
  },
  end: {
    type: String, // Format: HH:mm
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  expert: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ended: {
    type: Boolean,
    default: false
  },
  cancel: {
    type: Boolean,
    default: false
  },
  paid: {
    type: Boolean,
    default: false
  },
  price: {
    type: Number,
    default: 0
  },
  // Id de la Checkout Session Stripe associée (optionnel)
  stripeSessionId: {
    type: String,
    default: null
  },
  // Si défini, le "hold" expirera automatiquement via un TTL index
  holdExpiresAt: {
    type: Date,
    default: null
  },
  // Paiement Stripe (capture différée)
  authorized: {
    type: Boolean,
    default: false
  },
  paymentIntentId: {
    type: String,
    default: null
  },
  authorizedAt: {
    type: Date,
    default: null
  },
  captureScheduledFor: {
    type: Date,
    default: null
  },
  capturedAt: {
    type: Date,
    default: null
  },
  specialty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Specialty',
    required: true
  }
}, { timestamps: true });

// Note: pas de TTL automatique sur holdExpiresAt pour éviter de supprimer un slot
// avant la réception tardive d'un webhook Stripe. Le nettoyage pourra être fait
// via un job planifié si nécessaire.

module.exports = mongoose.model('BookedSlot', bookedSlotSchema);