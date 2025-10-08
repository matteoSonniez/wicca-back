const mongoose = require('mongoose');

const signupVerificationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['user', 'expert'], required: true },
  code: { type: String, required: true },
  payload: { type: Object, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

signupVerificationSchema.index({ email: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('SignupVerification', signupVerificationSchema);


