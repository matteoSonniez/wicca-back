const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  // Identifiants
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  anonId: { type: String, index: true },
  sessionId: { type: String, index: true },

  // Contexte
  event: { type: String, required: true, index: true },
  path: { type: String, index: true },
  referrer: { type: String },
  userAgent: { type: String },
  ip: { type: String },
  locale: { type: String },
  screen: {
    width: { type: Number },
    height: { type: Number },
    dpr: { type: Number }
  },

  // Données libres
  props: { type: Object, default: {} },
}, {
  timestamps: true
});

// Index combinés pour analyses courantes
analyticsEventSchema.index({ createdAt: -1 });
analyticsEventSchema.index({ event: 1, createdAt: -1 });
analyticsEventSchema.index({ path: 1, createdAt: -1 });
analyticsEventSchema.index({ sessionId: 1, createdAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);


