const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  start: {
    type: String, // Heure de début de la plage de dispo (HH:mm)
    required: true
  },
  end: {
    type: String, // Heure de fin de la plage de dispo (HH:mm)
    required: true
  },
  bookedSlots: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookedSlot'
    }
  ]
}, { timestamps: true });

// Évite les doublons par jour et par expert même en cas d'appels concurrents
availabilitySchema.index({ expertId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Availability', availabilitySchema);