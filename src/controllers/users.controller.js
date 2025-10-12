const bcrypt = require("bcrypt");
const User = require("../models/users.model");
const signJwt = require("../utils/signJwt");
const { sendWelcomeEmail } = require("../utils/mailer");

exports.createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, password, email, phone } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const user = new User({ firstName, lastName, password, email: normalizedEmail, phone });
    await user.save();
    // Envoi d'un email de bienvenue asynchrone (non bloquant pour la réponse API)
    sendWelcomeEmail({ to: user.email, firstName: user.firstName })
      .catch((e) => console.warn('Erreur envoi email bienvenue:', e?.message));
    const token = signJwt({ id: user._id, email: user.email, role: 'user' });
    res.status(201).json({ message: "Utilisateur créé avec succès", user, token });
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur lors de la création de l'utilisateur", error: error.message });
  }
}

exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }
    const token = signJwt({ id: user._id, email: user.email });
    res.status(200).json({ message: "Connexion réussie", user, token });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la connexion", error: error.message });
  }
}

exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Utilisateur non authentifié" });
    }
    res.status(200).json(req.user);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération de l'utilisateur", error: error.message });
  }
} 

// GET /api/users/favorites
exports.getFavorites = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Utilisateur non authentifié' });
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      model: 'Expert',
      populate: [
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]
    });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ favorites: user.favorites || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des favoris', error: error.message });
  }
}

// POST /api/users/favorites/:expertId (toggle add)
exports.addFavorite = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Utilisateur non authentifié' });
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const exists = (user.favorites || []).some(id => String(id) === String(expertId));
    if (!exists) {
      user.favorites = [...(user.favorites || []), expertId];
      await user.save();
    }
    const populated = await User.findById(user._id).populate({ path: 'favorites', model: 'Expert' });
    res.status(200).json({ message: 'Ajouté aux favoris', favorites: populated.favorites });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de l\'ajout du favori', error: error.message });
  }
}

// DELETE /api/users/favorites/:expertId
exports.removeFavorite = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Utilisateur non authentifié' });
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.favorites = (user.favorites || []).filter(id => String(id) !== String(expertId));
    await user.save();
    const populated = await User.findById(user._id).populate({ path: 'favorites', model: 'Expert' });
    res.status(200).json({ message: 'Retiré des favoris', favorites: populated.favorites });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression du favori', error: error.message });
  }
}

// PATCH /api/users/me — met à jour les informations de l'utilisateur authentifié
exports.updateMe = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }
    const allowed = ['firstName', 'lastName', 'email', 'phone'];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        update[k] = req.body[k];
      }
    }
    if (typeof update.email === 'string') {
      update.email = update.email.trim().toLowerCase();
    }
    // Changement de mot de passe: requiert oldPassword + newPassword
    const { oldPassword, newPassword } = req.body || {};
    const wantsPasswordChange = typeof newPassword === 'string' && newPassword.length > 0;
    if (wantsPasswordChange) {
      if (typeof oldPassword !== 'string' || oldPassword.length === 0) {
        return res.status(400).json({ message: 'Ancien mot de passe requis' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
      }
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
      const ok = await bcrypt.compare(oldPassword, user.password);
      if (!ok) {
        return res.status(401).json({ message: 'Ancien mot de passe incorrect' });
      }
      // Appliquer les autres mises à jour éventuelles
      if (typeof update.firstName === 'string') user.firstName = update.firstName;
      if (typeof update.lastName === 'string') user.lastName = update.lastName;
      if (typeof update.email === 'string') user.email = update.email;
      if (typeof update.phone === 'string') user.phone = update.phone;
      // Déclenchera le pre('save') pour hash du mot de passe
      user.password = newPassword;
      await user.save();
      const safe = user.toObject();
      delete safe.password;
      return res.status(200).json({ message: 'Profil mis à jour', user: safe });
    }
    // Sinon update direct sans toucher au mot de passe
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true, context: 'query' });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const safe = user.toObject();
    delete safe.password;
    return res.status(200).json({ message: 'Profil mis à jour', user: safe });
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    return res.status(500).json({ message: "Erreur lors de la mise à jour de l'utilisateur", error: error.message });
  }
}