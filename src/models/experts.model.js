const mongoose = require('mongoose');
const bcrypt = require("bcrypt");

const expertSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  password: {
    type: String,
    required: true
  },
  siret: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  photoUrl: {
    type: String,
    default: ''
  },
  photoPublicId: {
    type: String,
    default: ''
  },
  avatard: {
    type: String,
    default: null
  },
  // prix_minute: {
  //   type: Number,
  //   required: true
  // },
  // visio: {
  //   type: Boolean,
  //   required: true
  // },
  // onsite: {
  //   type: Boolean,
  //   required: true
  // },
  adressrdv: {
    postalCode: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    addressLine: { type: String, trim: true, default: '' }
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
  delayTime: {
    type: Number,
    default: 0,
    enum: [0, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55, 60]
  },
  // availabilityStart: {
  //   type: String, // Format: "09:00"
  //   required: true
  // },
  // availabilityEnd: {
  //   type: String, // Format: "17:00"
  //   required: true
  // },
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
    description: {
      type: String,
      trim: true,
      default: ''
    },
    visio: {
      type: Boolean,
      default: false
    },
    onsite: {
      type: Boolean,
      default: false
    },
    // Délai minimum avant le premier créneau proposé pour cette spécialité (en minutes)
    delayTime: {
      type: Number,
      enum: [0, 15, 30, 60, 120, 180, 360, 720, 1440, 2880],
      default: 0
    },
    prix_15min: {
      type: Number,
      min: 0,
      default: null
    },
    prix_30min: {
      type: Number,
      min: 0,
      default: null
    },
    prix_45min: {
      type: Number,
      min: 0,
      default: null
    },
    prix_60min: {
      type: Number,
      min: 0,
      default: null
    },
    prix_90min: {
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
  }],
  // Stripe Connect
  stripeAccountId: {
    type: String,
    default: ''
  },
  chargesEnabled: {
    type: Boolean,
    default: false
  },
  payoutsEnabled: {
    type: Boolean,
    default: false
  },
  // Acceptation des CGU Experts
  termsAccepted: {
    type: Boolean,
    default: false
  },
  termsAcceptedAt: {
    type: Date,
    default: null
  },
  termsVersion: {
    type: String,
    default: ''
  },
  isValidate: {
    type: Boolean,
    default: false
  }
},
  {
    timestamps: true
  }
)

// Champs de réinitialisation de mot de passe
expertSchema.add({
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null }
});

// Rendre les réponses JSON et Object rétro-compatibles:
// - Inclure `adressrdv` sous forme de chaîne jointe "addressLine, postalCode, city"
// - Conserver l'objet complet sous `adressrdvObj`
const toTransport = (doc, ret) => {
  const a = ret && ret.adressrdv;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    ret.adressrdvObj = { ...a };
    const parts = [a.addressLine, a.postalCode, a.city].filter(Boolean);
    ret.adressrdv = parts.join(', ');
  }
  return ret;
};

expertSchema.set('toJSON', { virtuals: true, transform: toTransport });
expertSchema.set('toObject', { virtuals: true, transform: toTransport });

// Index unique déjà défini via le champ { unique: true } sur email

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
