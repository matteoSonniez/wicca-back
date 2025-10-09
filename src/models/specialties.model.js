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
  icon: {
    type: String, // chemin relatif sous public/spe_
    trim: true,
    default: null
  },
  show: {
    type: Boolean,
    default: false
  },
  subSpecialties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubSpecialty'
  }]
});

module.exports = mongoose.model('Specialty', specialtySchema);
