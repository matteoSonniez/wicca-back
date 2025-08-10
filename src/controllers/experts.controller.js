const bcrypt = require("bcrypt");
const signJwt = require("../utils/signJwt");
const Expert = require("../models/experts.model");
const Specialty = require('../models/specialties.model');
const { getAvailabilitiesForExpert } = require('../utils/availabilities');

function normalize(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getNoteMoyenneSur100(notes) {
  if (!notes || notes.length === 0) return null;
  const sum = notes.reduce((acc, n) => acc + n, 0);
  const moyenne5 = sum / notes.length;
  return Math.round((moyenne5 / 5) * 100);
}

exports.createExpert = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, adressrdv, specialties, availabilityStart, availabilityEnd, prix_minute, visio, onsite, francais, anglais, roumain, allemand, italien, espagnol } = req.body;
    // specialties doit être un tableau d'objets : [{ specialty, subSpecialties: [] }]
    const expert = new Expert({ firstName, lastName, email, password, adressrdv, specialties, availabilityStart, availabilityEnd, prix_minute, visio, onsite, francais, anglais, roumain, allemand, italien, espagnol });
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
    const expertObj = expert.toObject();
    expertObj.noteMoyenneSur100 = getNoteMoyenneSur100(expertObj.notes);
    res.status(200).json(expertObj);
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
    const expertsWithNote = experts.map(e => {
      const obj = e.toObject();
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });
    res.status(200).json(expertsWithNote);
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
    const expertsWithNote = experts.map(e => {
      const obj = e.toObject();
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });
    res.status(200).json(expertsWithNote);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche d'experts par spécialité", error: error.message });
  }
};

// Recherche d'experts par nom de spécialité
exports.findExpertsBySpecialtyName = async (req, res) => {
  try {
    const { spe_name } = req.body;
    if (!spe_name) {
      return res.status(400).json({ message: "Le nom de la spécialité est requis." });
    }
    // 1. Chercher la spécialité par nom
    const specialties = await Specialty.find();
    const specialty = specialties.find(s =>
      normalize(s.name).toLowerCase().includes(normalize(spe_name).toLowerCase())
    );
    if (!specialty) {
      return res.status(404).json({ message: "Spécialité non trouvée." });
    }
    // 2. Chercher les experts qui ont cette spécialité
    const experts = await Expert.find({ 'specialties.specialty': specialty._id })
      .populate([
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]);
    const expertsWithNote = experts.map(e => {
      const obj = e.toObject();
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });
    res.status(200).json(expertsWithNote);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche d'experts par nom de spécialité", error: error.message });
  }
};

exports.findExpertsWithFilters = async (req, res) => {
  try {
    const {
      specialtyId,
      adressrdv,
      visio,
      onsite,
      minPrice,
      maxPrice,
      duree,
      disponibilite, // "immediat", "aujourdhui", "troisjours", null
      langues // tableau de langues à filtrer
    } = req.body;

    const query = {};

    if (specialtyId) {
      query['specialties.specialty'] = specialtyId;
    }
    if (adressrdv) {
      query.adressrdv = { $regex: adressrdv, $options: 'i' };
    }
    if (visio !== undefined) {
      query.visio = visio;
    }
    if (onsite !== undefined) {
      query.onsite = onsite;
    }
    // On filtre sur le prix_minute * durée
    if (minPrice !== undefined || maxPrice !== undefined) {
      // On ne peut pas faire ce calcul en pur MongoDB, donc on filtre après
    }

    // Récupère les experts
    let experts = await Expert.find(query)
      .populate([
        { path: 'specialties.specialty' }
      ]);

    // Filtrage JS pour les langues
    if (langues && Array.isArray(langues) && langues.length > 0) {
      experts = experts.filter(expert =>
        langues.every(lang => {
          if (lang === "français") return expert.francais === true;
          if (lang === "anglais") return expert.anglais === true;
          if (lang === "roumain") return expert.roumain === true;
          if (lang === "allemand") return expert.allemand === true;
          if (lang === "italien") return expert.italien === true;
          if (lang === "espagnol") return expert.espagnol === true;
          return false;
        })
      );
    }

    // Filtrage JS pour le prix
    if (minPrice !== undefined || maxPrice !== undefined || duree !== undefined) {
      const d = duree || 30;
      experts = experts.filter(expert => {
        const prix = expert.prix_minute * d;
        if (minPrice !== undefined && prix < minPrice) return false;
        if (maxPrice !== undefined && prix > maxPrice) return false;
        return true;
      });
    }

    // Filtrage JS pour la disponibilité (si besoin d'appeler une autre collection ou une fonction)
    if (disponibilite) {
      // Ici il faut que tu aies une fonction utilitaire pour checker la dispo d'un expert
      // Par exemple, getAvailabilities(expert._id, duree) qui retourne les créneaux
      // Tu peux faire un Promise.all pour tous les experts et ne garder que ceux qui matchent la dispo
      // (pseudo-code, à adapter selon ton modèle de dispo)
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);

      // Importe ta fonction getAvailabilities si besoin
      const filtered = [];
      for (const expert of experts) {
        // Appelle ta fonction qui récupère les créneaux pour cet expert
        const availabilities = await getAvailabilitiesForExpert(expert._id, duree || 30); // à adapter
        let isAvailable = false;
        if (disponibilite === "immediat") {
          isAvailable = availabilities.some(day =>
            day.slots.some(slot => {
              const slotDate = new Date(`${day.date}T${slot.start}`);
              return slotDate >= now && slotDate <= twoHoursLater;
            })
          );
        } else if (disponibilite === "aujourdhui") {
          isAvailable = availabilities.some(day =>
            day.date.slice(0, 10) === todayStr && day.slots.length > 0
          );
        } else if (disponibilite === "troisjours") {
          isAvailable = availabilities.some(day => {
            const dayDate = new Date(day.date);
            return dayDate >= now && dayDate <= threeDaysLater && day.slots.length > 0;
          });
        }
        if (disponibilite && isAvailable) filtered.push(expert);
        if (!disponibilite) filtered.push(expert);
      }
      experts = filtered;
    }

    const expertsWithAvail = await Promise.all(
      experts.map(async expert => {
        const availabilities = await getAvailabilitiesForExpert(expert._id, duree || 30);
        // On convertit en objet simple (pour éviter les soucis de toJSON de Mongoose)
        return {
          ...expert.toObject(),
          availabilities,
          noteMoyenneSur100: getNoteMoyenneSur100(expert.notes)
        };
      })
    );

    res.status(200).json(expertsWithAvail);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche d'experts avec filtres", error: error.message });
  }
};

exports.addNoteToExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (![1,2,3,4,5].includes(note)) {
      return res.status(400).json({ message: "La note doit être comprise entre 1 et 5." });
    }
    const expert = await Expert.findByIdAndUpdate(
      id,
      { $push: { notes: note } },
      { new: true }
    );
    if (!expert) {
      return res.status(404).json({ message: "Expert non trouvé" });
    }
    res.status(200).json({ message: "Note ajoutée avec succès", expert });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de l'ajout de la note", error: error.message });
  }
};



