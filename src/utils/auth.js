const jwt = require('jsonwebtoken');
const User = require('../models/users.model');

module.exports = async function (req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  console.log(token, "token");
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  console.log(process.env.JWT_SECRET, "process.env.JWT_SECRET");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    console.log(user, "user");
    if (!user) return res.status(401).json({ message: 'Utilisateur non trouvé' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token invalide' });
  }
};
