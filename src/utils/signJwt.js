const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'wicca_secret';

function signJwt(payload) {
  console.log(process.env.JWT_SECRET, "process.env.JWT_SECRET");
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = signJwt; 