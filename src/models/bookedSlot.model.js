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
  specialty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Specialty',
    required: true
  }
});

module.exports = mongoose.model('BookedSlot', bookedSlotSchema); 