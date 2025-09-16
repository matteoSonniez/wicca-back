const bcrypt = require("bcrypt");
const signJwt = require("../utils/signJwt");
const Expert = require("../models/experts.model");
const Specialty = require('../models/specialties.model');
const Availability = require('../models/availabilities.model');
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

// PATCH /api/experts/:id/availability
exports.updateAvailabilityWindow = async (req, res) => {
  try {
    const { id } = req.params;
    const { availabilityStart, availabilityEnd } = req.body || {};
    if (!availabilityStart || !availabilityEnd) {
      return res.status(400).json({ message: "availabilityStart et availabilityEnd sont requis (format HH:MM)" });
    }
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(availabilityStart) || !timeRegex.test(availabilityEnd)) {
      return res.status(400).json({ message: "Format invalide. Utilisez HH:MM" });
    }
    const expert = await Expert.findByIdAndUpdate(
      id,
      { availabilityStart, availabilityEnd },
      { new: true }
    );
    if (!expert) return res.status(404).json({ message: "Expert non trouvé" });

    // Met à jour les documents Availability à partir d'aujourd'hui pour refléter la nouvelle plage
    const todayStr = new Date().toISOString().slice(0, 10);
    await Availability.updateMany(
      { expertId: id, date: { $gte: todayStr } },
      { $set: {} }
    );

    res.status(200).json({ message: "Disponibilités mises à jour", expert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/experts/:id/weekly-schedule
exports.updateWeeklySchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { weeklySchedule } = req.body || {};
    if (!weeklySchedule || typeof weeklySchedule !== 'object') {
      return res.status(400).json({ message: "weeklySchedule requis" });
    }
    const keys = ['mon','tue','wed','thu','fri','sat','sun'];
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const k of keys) {
      const arr = Array.isArray(weeklySchedule[k]) ? weeklySchedule[k] : [];
      for (const r of arr) {
        if (!timeRegex.test(r.start || '') || !timeRegex.test(r.end || '')) {
          return res.status(400).json({ message: `Plage invalide pour ${k} (format HH:MM)` });
        }
        if ((r.start || '') >= (r.end || '')) {
          return res.status(400).json({ message: `start doit être < end pour ${k}` });
        }
      }
    }
    const expert = await Expert.findByIdAndUpdate(
      id,
      { weeklySchedule },
      { new: true }
    );
    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });

    // Propager aux 14 prochains jours
    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(today.getDate() + 14);
    const updates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const day = d.getDay(); // 0=Sun..6=Sat
      const key = ['sun','mon','tue','wed','thu','fri','sat'][day];
      const ranges = (weeklySchedule[key] || []).map(r => ({ start: r.start, end: r.end }));
      if (ranges.length === 0) {
        // Supprime la disponibilité si elle existe pour ce jour
        updates.push(Availability.deleteOne({ expertId: id, date: dateStr }));
      } else {
        updates.push(Availability.findOneAndUpdate(
          { expertId: id, date: dateStr },
          { $set: { ranges } },
          { new: true, upsert: true }
        ));
      }
    }
    // Supprimer toute disponibilité hors fenêtre
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const yyyyH = horizon.getFullYear();
    const mmH = String(horizon.getMonth() + 1).padStart(2, '0');
    const ddH = String(horizon.getDate()).padStart(2, '0');
    const horizonEndStr = `${yyyyH}-${mmH}-${ddH}`;
    updates.push(Availability.deleteMany({ expertId: id, $or: [ { date: { $lt: todayStr } }, { date: { $gt: horizonEndStr } } ] }));
    await Promise.all(updates);

    res.status(200).json({ message: 'Planning hebdomadaire mis à jour', expert });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    const parsedPage = parseInt((req.body && req.body.page) ?? req.query.page, 10);
    const parsedLimit = parseInt((req.body && req.body.limit) ?? req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : null;
    if (!specialtyId) {
      return res.status(400).json({ message: "L'ID de la spécialité est requis." });
    }
    const query = {
      'specialties.specialty': specialtyId
    };
    if (adressrdv) {
      query.adressrdv = { $regex: adressrdv, $options: 'i' };
    }
    const total = await Expert.countDocuments(query);
    const skip = limit ? (page - 1) * limit : 0;
    const experts = await Expert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate([
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]);
    const expertsWithNote = experts.map(e => {
      const obj = e.toObject();
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });
    if (!limit) {
      return res.status(200).json(expertsWithNote);
    }
    return res.status(200).json({
      results: expertsWithNote,
      total,
      page,
      limit,
      hasMore: skip + expertsWithNote.length < total
    });
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
      langues, // tableau de langues à filtrer
      includeHistogram // optionnel: renvoyer la distribution des prix sur l'ensemble du résultat filtré
    } = req.body;
    const parsedPage = parseInt((req.body && req.body.page) ?? req.query.page, 10);
    const parsedLimit = parseInt((req.body && req.body.limit) ?? req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : null;

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
    // Filtres langues directement en Mongo (AND logique sur les langues demandées)
    if (langues && Array.isArray(langues) && langues.length > 0) {
      if (langues.includes('français')) query.francais = true;
      if (langues.includes('anglais')) query.anglais = true;
      if (langues.includes('roumain')) query.roumain = true;
      if (langues.includes('allemand')) query.allemand = true;
      if (langues.includes('italien')) query.italien = true;
      if (langues.includes('espagnol')) query.espagnol = true;
    }

    // Filtre prix en Mongo: prix_minute * duree ∈ [minPrice, maxPrice] -> prix_minute ∈ [minPrice/d, maxPrice/d]
    if (minPrice !== undefined || maxPrice !== undefined || duree !== undefined) {
      const d = (duree || 30);
      const priceClause = {};
      if (minPrice !== undefined) priceClause.$gte = Math.ceil(minPrice / d);
      if (maxPrice !== undefined) priceClause.$lte = Math.floor(maxPrice / d);
      if (Object.keys(priceClause).length > 0) {
        query.prix_minute = priceClause;
      }
    }

    // Compte total après filtres Mongo (hors disponibilité)
    const totalAfterBasicFilters = await Expert.countDocuments(query);

    // Pagination DB
    const skip = limit ? (page - 1) * limit : 0;
    let expertsPage = await Expert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate([{ path: 'specialties.specialty' }]);

    // Récupération des dispos + application du filtre de disponibilité SUR LA PAGE COURANTE uniquement
    const dForAvail = duree || 30;
    let expertsWithAvail = await Promise.all(
      expertsPage.map(async expert => {
        const availabilities = await getAvailabilitiesForExpert(expert._id, dForAvail);
        return {
          ...expert.toObject(),
          availabilities,
          noteMoyenneSur100: getNoteMoyenneSur100(expert.notes)
        };
      })
    );

    if (disponibilite) {
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);
      expertsWithAvail = expertsWithAvail.filter(exp => {
        const avails = exp.availabilities || [];
        if (disponibilite === 'immediat') {
          return avails.some(day => day.slots.some(slot => {
            const slotDate = new Date(`${day.date}T${slot.start}`);
            return slotDate >= now && slotDate <= twoHoursLater;
          }));
        }
        if (disponibilite === 'aujourdhui') {
          return avails.some(day => day.date.slice(0, 10) === todayStr && day.slots.length > 0);
        }
        if (disponibilite === 'troisjours') {
          return avails.some(day => {
            const dayDate = new Date(day.date);
            return dayDate >= now && dayDate <= threeDaysLater && day.slots.length > 0;
          });
        }
        return true;
      });
    }

    // Construction optionnelle de l'histogramme (distribution des prix) sur TOUT l'ensemble filtré
    let priceData = undefined;
    let totalForResponse = totalAfterBasicFilters; // par défaut: total sans filtre de disponibilité
    if (includeHistogram) {
      // Récupère tous les experts correspondant aux filtres de base (sans pagination)
      const allMatchingBasic = await Expert.find(query).select({ _id: 1, prix_minute: 1 });

      const dForAvailAll = duree || 30;
      let allMatching = allMatchingBasic;

      // Si un filtre de disponibilité est demandé, on l'applique sur l'ensemble
      if (disponibilite) {
        const now = new Date();
        const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const todayStr = now.toISOString().slice(0, 10);

        const filtered = await Promise.all(
          allMatchingBasic.map(async (exp) => {
            const avails = await getAvailabilitiesForExpert(exp._id, dForAvailAll);
            let match = true;
            if (disponibilite === 'immediat') {
              match = avails.some(day => day.slots.some(slot => {
                const slotDate = new Date(`${day.date}T${slot.start}`);
                return slotDate >= now && slotDate <= twoHoursLater;
              }));
            } else if (disponibilite === 'aujourdhui') {
              match = avails.some(day => day.date.slice(0, 10) === todayStr && day.slots.length > 0);
            } else if (disponibilite === 'troisjours') {
              match = avails.some(day => {
                const dayDate = new Date(day.date);
                return dayDate >= now && dayDate <= threeDaysLater && day.slots.length > 0;
              });
            }
            return match ? exp : null;
          })
        );
        allMatching = filtered.filter(Boolean);
        totalForResponse = allMatching.length;
      } else {
        totalForResponse = allMatchingBasic.length;
      }

      // Construit la liste des prix à la minute pour laisser le front calculer selon la durée choisie
      const pricePerMinute = allMatching
        .map(e => (typeof e.prix_minute === 'number' ? e.prix_minute : null))
        .filter(p => typeof p === 'number' && !isNaN(p));

      priceData = { pricePerMinute };
    }

    if (!limit) {
      // Retourne directement la liste complète (sans pagination)
      return res.status(200).json(priceData ? { results: expertsWithAvail, priceData } : expertsWithAvail);
    }

    return res.status(200).json({
      results: expertsWithAvail,
      total: totalForResponse,
      page,
      limit,
      hasMore: skip + (limit || 0) < totalForResponse,
      ...(priceData ? { priceData } : {})
    });
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



// Récupérer une liste d'experts (par défaut: 15 premiers, les plus récents)
exports.getExperts = async (req, res) => {
  try {
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 15;

    const experts = await Expert.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate([
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]);

    const payload = experts.map(e => {
      const obj = e.toObject();
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });

    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des experts", error: error.message });
  }
};