const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true }, // code en MAJUSCULES
  percentOff: { type: Number, default: 10, min: 0, max: 100 },
  active: { type: Boolean, default: true },
  validFrom: { type: Date, default: null },
  validTo: { type: Date, default: null },
  description: { type: String, default: '' },
  // Usage unique par défaut
  singleUse: { type: Boolean, default: true },
  used: { type: Boolean, default: false },
  // Réservation temporaire pendant le hold Stripe/bookSlot
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


