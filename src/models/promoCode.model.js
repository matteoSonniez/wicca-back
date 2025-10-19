const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true }, // toujours en MAJUSCULES
  percentOff: { type: Number, default: 10, min: 0, max: 100 },
  active: { type: Boolean, default: true },
  validFrom: { type: Date, default: null },
  validTo: { type: Date, default: null },
  description: { type: String, default: '' },
  // Nouveau système: type de code ('single' = usage unique global, 'multi' = multi-usage mais 1x par utilisateur)
  type: { type: String, enum: ['single', 'multi'], default: 'single', index: true },
  // Marqueur usage global (pertinent pour type='single')
  usedGlobal: { type: Boolean, default: false },
  // Historique d'utilisation par utilisateur (sert pour type='multi' et traçabilité générale)
  usedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bookedSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'BookedSlot', default: null },
    at: { type: Date, default: Date.now }
  }],
  // Réservation temporaire pendant le hold Stripe/bookSlot (évite courses à l'usage pour 'single')
  reservedBy: { type: String, default: null }, // bookedSlotId
  reservedUntil: { type: Date, default: null }
}, { timestamps: true });

promoCodeSchema.pre('save', function(next) {
  if (typeof this.code === 'string') {
    this.code = this.code.trim().toUpperCase();
  }
  next();
});

module.exports = mongoose.model('PromoCode', promoCodeSchema);


