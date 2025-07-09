const bcrypt = require("bcrypt");
const signJwt = require("../utils/signJwt");
const Expert = require("../models/experts.model");
const Specialty = require('../models/specialties.model');

exports.createExpert = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, adressrdv, specialties } = req.body;
    // specialties doit être un tableau d'objets : [{ specialty, subSpecialties: [] }]
    const expert = new Expert({ firstName, lastName, email, password, adressrdv, specialties });
    await expert.save();
    const token = signJwt({ id: expert._id, email: expert.email, role: 'expert' });
    res.status(201).json({ message: "Expert créé avec succès", expert, token });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de l'expert", error: error.message });
  }
}

exports.loginExpert = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const expert = await Expert.findOne({ email });
    if (!expert) {
      return res.status(401).json({ message: "Expert non trouvé" });
    }
    const isMatch = await bcrypt.compare(password, expert.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }
    const token = signJwt({ id: expert._id, email: expert.email, role: 'expert' });
    res.status(200).json({ message: "Connexion expert réussie", expert, token });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la connexion expert", error: error.message });
  }
}

exports.getExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await Expert.findById(id)
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties'); // <- Ajoute bien cette ligne
    if (!expert) {
      return res.status(404).json({ message: "Expert non trouvé" });
    }
    res.status(200).json(expert);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération de l'expert", error: error.message });
  }
};

exports.updateExpertSpecialties = async (req, res) => {
  try {
    const { id } = req.params;
    const { specialties } = req.body;
    const expert = await Expert.findByIdAndUpdate(
      id,
      { specialties },
      { new: true }
    )
    .populate([
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    if (!expert) {
      return res.status(404).json({ message: "Expert non trouvé" });
    }
    res.status(200).json({ message: "Spécialités mises à jour", expert });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la mise à jour des spécialités", error: error.message });
  }
};

exports.searchExperts = async (req, res) => {
  try {
    const { search } = req.body;
    if (!search) {
      return res.status(400).json({ message: "Le champ de recherche est requis." });
    }
    const experts = await Expert.find({
      $or: [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ]
    })
    .populate([
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    res.status(200).json(experts);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche d'experts", error: error.message });
  }
};

exports.findExpertsBySpecialty = async (req, res) => {
  try {
    const { specialtyId, adressrdv } = req.body;
    if (!specialtyId) {
      return res.status(400).json({ message: "L'ID de la spécialité est requis." });
    }
    const query = {
      'specialties.specialty': specialtyId
    };
    if (adressrdv) {
      query.adressrdv = { $regex: adressrdv, $options: 'i' };
    }
    const experts = await Expert.find(query)
      .populate([
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]);
    res.status(200).json(experts);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche d'experts par spécialité", error: error.message });
  }
};



