module.exports = function adminOnly(req, res, next) {
  try {
    // Autorise uniquement les USERS admin (pas les experts sauf s'ils ont isAdmin dans leur modèle user, ce qui n'est pas le cas)
    if (req.user && req.user.isAdmin === true) {
      return next();
    }
    return res.status(403).json({ message: 'Accès admin requis' });
  } catch (e) {
    return res.status(403).json({ message: 'Accès admin requis' });
  }
};


