const mongoose = require('mongoose');

const subSpecialtySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  specialty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Specialty',
    required: true
  }
});

module.exports = mongoose.model('SubSpecialty', subSpecialtySchema); 