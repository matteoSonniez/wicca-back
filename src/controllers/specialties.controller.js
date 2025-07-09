const Specialty = require('../models/specialties.model');

// Créer une nouvelle spécialité
exports.createSpecialty = async (req, res) => {
  try {
    const { name } = req.body;
    const specialty = new Specialty({ name });
    await specialty.save();
    res.status(201).json(specialty);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Récupérer toutes les spécialités avec les sous-spécialités peuplées
exports.getAllSpecialties = async (req, res) => {
  try {
    const specialties = await Specialty.find().populate('subSpecialties');
    res.status(200).json(specialties);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.searchSpecialties = async (req, res) => {
  try {
    const { search } = req.body;
    if (!search) {
      return res.status(400).json({ message: "Le champ de recherche est requis." });
    }
    const specialties = await Specialty.find({
      name: { $regex: search, $options: 'i' }
    }).populate('subSpecialties');
    res.status(200).json(specialties);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche de spécialités", error: error.message });
  }
}; 