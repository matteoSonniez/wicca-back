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
  // Email de confirmation envoyé au client
  emailConfirmationSent: {
    type: Boolean,
    default: false
  },
  // Email de notification envoyé à l'expert
  expertNotificationSent: {
    type: Boolean,
    default: false
  },
  // Email de fin de rendez-vous envoyé au client (invitation à laisser un avis)
  emailEndedSent: {
    type: Boolean,
    default: false
  },
  specialty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Specialty',
    required: true
  },
  // Indique si le RDV est en visio (à distance)
  visio: {
    type: Boolean,
    default: false
  },
  // Lieu du RDV en présentiel; null si visio
  lieu: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Note: pas de TTL automatique sur holdExpiresAt pour éviter de supprimer un slot
// avant la réception tardive d'un webhook Stripe. Le nettoyage pourra être fait
// via un job planifié si nécessaire.

module.exports = mongoose.model('BookedSlot', bookedSlotSchema);