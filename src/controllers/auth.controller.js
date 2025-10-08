const bcrypt = require("bcrypt");
const User = require("../models/users.model");
const Expert = require("../models/experts.model");
const SignupVerification = require("../models/signupVerification.model");
const { sendVerificationCodeEmail, sendWelcomeEmail, sendExpertWelcomeEmail } = require("../utils/mailer");
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

// POST /auth/signup/request-code
// Body: { role: 'user'|'expert', email, firstName, lastName, password, ...autres champs }
exports.requestSignupCode = async (req, res) => {
  try {
    const { role, email } = req.body || {};
    if (!role || !['user','expert'].includes(role)) {
      return res.status(400).json({ message: 'role invalide' });
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'email requis' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    // refuser si déjà existant
    const exists = role === 'user'
      ? await User.findOne({ email: normalizedEmail })
      : await Expert.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    // Générer code 6 chiffres
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const payload = { ...req.body, email: normalizedEmail };
    // upsert sur (email, role)
    await SignupVerification.findOneAndUpdate(
      { email: normalizedEmail, role },
      { code, payload, attempts: 0, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // envoyer email
    await sendVerificationCodeEmail({
      to: normalizedEmail,
      firstName: payload.firstName,
      role,
      code
    });

    return res.status(200).json({ message: 'Code envoyé' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de l’envoi du code', error: error.message });
  }
}

// POST /auth/signup/verify
// Body: { role: 'user'|'expert', email, code }
exports.verifySignupCode = async (req, res) => {
  try {
    const { role, email, code } = req.body || {};
    if (!role || !['user','expert'].includes(role)) {
      return res.status(400).json({ message: 'role invalide' });
    }
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !code) {
      return res.status(400).json({ message: 'email et code requis' });
    }

    const verif = await SignupVerification.findOne({ email: normalizedEmail, role });
    if (!verif) return res.status(404).json({ message: 'Demande introuvable' });
    if (verif.expiresAt && verif.expiresAt < new Date()) {
      await SignupVerification.deleteOne({ _id: verif._id });
      return res.status(410).json({ message: 'Code expiré, veuillez renvoyer un code' });
    }
    if (String(code) !== String(verif.code)) {
      verif.attempts = (verif.attempts || 0) + 1;
      await verif.save();
      return res.status(400).json({ message: 'Code invalide' });
    }

    const data = verif.payload || {};
    // sécurité: normaliser email
    data.email = normalizedEmail;

    // Créer compte selon role
    if (role === 'user') {
      const user = new User({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        phone: data.phone
      });
      await user.save();
      // Email de bienvenue (asynchrone, non bloquant)
      sendWelcomeEmail({ to: user.email, firstName: user.firstName })
        .catch((e) => console.warn('Erreur envoi email bienvenue user:', e && e.message ? e.message : e));
      await SignupVerification.deleteOne({ _id: verif._id });
      const token = signJwt({ id: user._id, email: user.email, role: 'user' });
      return res.status(201).json({ message: 'Utilisateur créé', user, token });
    } else {
      const expert = new Expert({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        adressrdv: data.adressrdv,
        specialties: data.specialties,
        francais: !!data.francais,
        anglais: !!data.anglais,
        roumain: !!data.roumain,
        allemand: !!data.allemand,
        italien: !!data.italien,
        espagnol: !!data.espagnol
      });
      await expert.save();
      // Email de bienvenue expert (asynchrone, non bloquant)
      sendExpertWelcomeEmail({ to: expert.email, firstName: expert.firstName })
        .catch((e) => console.warn('Erreur envoi email bienvenue expert:', e && e.message ? e.message : e));
      await SignupVerification.deleteOne({ _id: verif._id });
      const token = signJwt({ id: expert._id, email: expert.email, role: 'expert' });
      return res.status(201).json({ message: 'Expert créé', expert, token });
    }
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    return res.status(500).json({ message: 'Erreur lors de la vérification', error: error.message });
  }
}
