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
  birthdate: {
    type: Date,
  },
  acquisitionSource: {
    type: String,
    enum: [
      'Sur Instagram',
      'Sur TikTok',
      'En cherchant sur Google',
      'Par un expert Wicca',
      'Par un(e) ami(e) ou le bouche-à-oreille',
      'En voyant un article / une publication en ligne',
      'Via une publicité (Meta ou Google)',
      'Grâce à un code promo ou un jeu concours',
      'Autre'
    ],
  },
  acquisitionSourceOther: {
    type: String,
    trim: true,
    default: ''
  },
  isAdmin: {
    type: Boolean,
    default: false
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

// Champs de réinitialisation de mot de passe
userSchema.add({
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null }
});

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