const jwt = require('jsonwebtoken');
const User = require('../models/users.model');
const Expert = require('../models/experts.model');

module.exports = async function (req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  console.log(token, "token");
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  console.log(process.env.JWT_SECRET, "process.env.JWT_SECRET");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // On tente d'abord utilisateur
    let user = await User.findById(decoded.id);
    if (user) {
      req.user = user;
      req.authRole = decoded.role || 'user';
      return next();
    }
    // Puis expert
    const expert = await Expert.findById(decoded.id);
    if (expert) {
      req.expert = expert;
      req.authRole = decoded.role || 'expert';
      return next();
    }
    return res.status(401).json({ message: 'Compte non trouvé' });
  } catch (err) {
    return res.status(403).json({ message: 'Token invalide' });
  }
};
