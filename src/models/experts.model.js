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
  adressrdv: {
    type: String,
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
