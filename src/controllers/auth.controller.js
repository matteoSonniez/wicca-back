const bcrypt = require("bcrypt");
const User = require("../models/users.model");
const Expert = require("../models/experts.model");
const signJwt = require("../utils/signJwt");

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    let type = null;
    if (user) {
      type = 'user';
    } else {
      user = await Expert.findOne({ email });
      if (user) {
        type = 'expert';
      }
    }
    if (!user) {
      return res.status(401).json({ message: "Utilisateur ou expert non trouvé" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }
    const token = signJwt({ id: user._id, email: user.email, role: type });
    res.status(200).json({ message: "Connexion réussie", user, type, token });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la connexion", error: error.message });
  }
}
