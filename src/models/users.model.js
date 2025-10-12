const mongoose = require('mongoose');
const bcrypt = require("bcrypt");

const userSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: false,
    default: ''
  },
  password: {
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
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert'
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

// Index unique déjà défini via le champ { unique: true } sur email

userSchema.pre('save', function (next) {
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

module.exports = mongoose.model('User', userSchema); 