const mongoose = require('mongoose');

// Un avis laissé par un client suite à un RDV avec un expert
const reviewSchema = new mongoose.Schema({
  note: {
    type: Number,
    min: 10,
    max: 100,
    required: true
  },
  commentaire: {
    type: String,
    trim: true,
    default: ''
  },
  expert: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true,
    index: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rdv: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookedSlot',
    required: true,
    index: true
  }
}, { timestamps: true });

// Un client ne peut laisser qu'un seul avis par RDV
reviewSchema.index({ client: 1, rdv: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);


