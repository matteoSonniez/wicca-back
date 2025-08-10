const bcrypt = require("bcrypt");
const User = require("../models/users.model");
const signJwt = require("../utils/signJwt");

exports.createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, password, email, phone } = req.body;
    const user = new User({ firstName, lastName, password, email, phone });
    await user.save();
    const token = signJwt({ id: user._id, email: user.email, role: 'user' });
    res.status(201).json({ message: "Utilisateur créé avec succès", user, token });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de l'utilisateur", error: error.message });
  }
}

exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
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