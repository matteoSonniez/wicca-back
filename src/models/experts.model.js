const mongoose = require('mongoose');
const bcrypt = require("bcrypt");

const expertSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  prix_minute: {
    type: Number,
    required: true
  },
  visio: {
    type: Boolean,
    required: true
  },
  onsite: {
    type: Boolean,
    required: true
  },
  adressrdv: {
    type: String,
    required: true
  },
  francais: {
    type: Boolean,
    default: false
  },
  anglais: {
    type: Boolean,
    default: false
  },
  roumain: {
    type: Boolean,
    default: false
  },
  allemand: {
    type: Boolean,
    default: false
  },
  italien: {
    type: Boolean,
    default: false
  },
  espagnol: {
    type: Boolean,
    default: false
  },
  availabilityStart: {
    type: String, // Format: "09:00"
    required: true
  },
  availabilityEnd: {
    type: String, // Format: "17:00"
    required: true
  },
  weeklySchedule: {
    mon: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    tue: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    wed: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    thu: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    fri: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    sat: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }],
    sun: [{ start: { type: String, trim: true }, end: { type: String, trim: true } }]
  },
  specialties: [{
    specialty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Specialty'
    },
    prix_minute: {
      type: Number,
      min: 0,
      default: null
    },
    subSpecialties: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubSpecialty'
    }]
  }],
  notes: [{
    type: Number,
    min: 1,
    max: 5
  }],
  rdv: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookedSlot'
  }]
},
  {
    timestamps: true
  }
)

expertSchema.pre('save', function (next) {
  
  if (!this.isModified("password")) {
    return next();
  }

  bcrypt.hash(this.password, 10, (err, hashedPassword) => {
    if (err) {
      console.log(err);
      return next(err);
    }
    this.password = hashedPassword
    next();
  });

})

module.exports = mongoose.model('Expert', expertSchema);
