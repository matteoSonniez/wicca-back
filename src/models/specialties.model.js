const mongoose = require('mongoose');

const specialtySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  subSpecialties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubSpecialty'
  }]
});

module.exports = mongoose.model('Specialty', specialtySchema);
