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
  specialties: [{
    specialty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Specialty'
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
