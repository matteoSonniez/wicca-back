const mongoose = require('mongoose');

const specialtySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  color: {
    type: String,
    trim: true,
    default: null
  },
  subSpecialties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubSpecialty'
  }]
});

module.exports = mongoose.model('Specialty', specialtySchema);
