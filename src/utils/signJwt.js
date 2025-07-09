const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'wicca_secret';

function signJwt(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

module.exports = signJwt; 