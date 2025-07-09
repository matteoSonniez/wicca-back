const SubSpecialty = require('../models/subspecialties.model');
const Specialty = require('../models/specialties.model');

// Créer une nouvelle sous-spécialité et l'ajouter à la spécialité correspondante
exports.createSubSpecialty = async (req, res) => {
  try {
    const { name, specialty } = req.body;
    // Création de la sous-spécialité
    const subSpecialty = new SubSpecialty({ name, specialty });
    await subSpecialty.save();

    // Ajout de la sous-spécialité à la spécialité
    await Specialty.findByIdAndUpdate(
      specialty,
      { $push: { subSpecialties: subSpecialty._id } },
      { new: true }
    );

    res.status(201).json(subSpecialty);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}; 