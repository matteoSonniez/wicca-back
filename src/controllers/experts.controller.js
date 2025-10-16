const bcrypt = require("bcrypt");
const signJwt = require("../utils/signJwt");
const Expert = require("../models/experts.model");
const mongoose = require('mongoose');
const Specialty = require('../models/specialties.model');
const Availability = require('../models/availabilities.model');
const { getAvailabilitiesForExpert } = require('../utils/availabilities');
const cloudinary = require('cloudinary').v2;
const { sendExpertWelcomeEmail } = require('../utils/mailer');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function normalize(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Construit une regex tolérante aux accents à partir d'une chaîne utilisateur
function buildDiacriticInsensitivePattern(input) {
  const map = {
    a: "aàáâãäåā",
    c: "cç",
    e: "eèéêëēĕėęě",
    i: "iìíîïīĭįı",
    n: "nñńňŉŋ",
    o: "oòóôõöōŏő",
    u: "uùúûüūŭůűų",
    y: "yỳýÿŷ",
    s: "sśŝşš",
    z: "zźżž",
    g: "gğǵĝğġģ",
    l: "lĺļľł",
    r: "rŕŗř",
    t: "tţť",
  };
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chars = Array.from(input || "");
  let pattern = "";
  for (const ch of chars) {
    const lower = ch.toLowerCase();
    if (map[lower]) {
      const cls = Array.from(map[lower])
        .map((x) => escapeRegex(x))
        .join("");
      pattern += `[${cls}]`;
    } else {
      pattern += escapeRegex(ch);
    }
  }
  return pattern;
}

function getNoteMoyenneSur100(notes) {
  if (!notes || notes.length === 0) return null;
  const sum = notes.reduce((acc, n) => acc + n, 0);
  const moyenne5 = sum / notes.length;
  return Math.round((moyenne5 / 5) * 100);
}

exports.createExpert = async (req, res, next) => {
  try {
    const { firstName, email, password, adressrdv, siret, specialties, francais, anglais, roumain, allemand, italien, espagnol, termsAccepted } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    // Valider acceptation des CGU
    if (termsAccepted !== true) {
      return res.status(400).json({ message: "Vous devez accepter les conditions d’utilisation pour créer un compte expert." });
    }
    // specialties doit être un tableau d'objets : [{ specialty, subSpecialties: [] }]
    const { TERMS_EXPERTS_VERSION } = require('../utils/terms');
    // Normaliser adresse: accepter string (legacy) ou objet { addressLine, postalCode, city }
    let adressObj = null;
    if (adressrdv && typeof adressrdv === 'string') {
      // essayer de parser un format simple "addressLine, postalCode, city"
      const parts = adressrdv.split(',').map(s => s.trim());
      adressObj = {
        addressLine: parts[0] || adressrdv,
        postalCode: parts[1] || '',
        city: parts[2] || ''
      };
    } else if (adressrdv && typeof adressrdv === 'object') {
      adressObj = {
        addressLine: (adressrdv.addressLine || '').trim(),
        postalCode: (adressrdv.postalCode || '').trim(),
        city: (adressrdv.city || '').trim()
      };
    } else {
      adressObj = { addressLine: '', postalCode: '', city: '' };
    }

    const expert = new Expert({
      firstName,
      email: normalizedEmail,
      password,
      adressrdv: adressObj,
      siret: siret || '',
      specialties,
      francais,
      anglais,
      roumain,
      allemand,
      italien,
      espagnol,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_EXPERTS_VERSION
    });
    await expert.save();
    // Envoi d'email de bienvenue expert (asynchrone, non bloquant)
    sendExpertWelcomeEmail({ to: expert.email, firstName: expert.firstName })
      .catch((e) => console.warn('Erreur envoi email bienvenue expert:', e && e.message ? e.message : e));
    const token = signJwt({ id: expert._id, email: expert.email, role: 'expert' });
    res.status(201).json({ message: "Expert créé avec succès", expert, token });
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur lors de la création de l'expert", error: error.message });
  }
}

exports.loginExpert = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const expert = await Expert.findOne({ email: normalizedEmail });
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

// POST /api/experts/photo/signature
exports.getPhotoUploadSignature = async (req, res) => {
  try {
    const { folder = 'wicca/experts', upload_preset = 'wicca_expert_photo' } = req.body || {};
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const paramsToSign = { timestamp, folder, upload_preset };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
    res.status(200).json({
      timestamp,
      folder,
      upload_preset,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      signature
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur signature Cloudinary", error: error.message });
  }
};

// PATCH /api/experts/:id/photo
exports.updateExpertPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photoUrl, photoPublicId } = req.body || {};
    if (!photoUrl || !photoPublicId) {
      return res.status(400).json({ message: 'photoUrl et photoPublicId sont requis' });
    }
    const expert = await Expert.findById(id);
    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });

    // supprimer l'ancienne si présente
    if (expert.photoPublicId && expert.photoPublicId !== photoPublicId) {
      try { await cloudinary.uploader.destroy(expert.photoPublicId); } catch (_) {}
    }

    // Si l'expert téléverse une photo personnalisée, on désactive l'avatar choisi
    expert.photoUrl = photoUrl;
    expert.photoPublicId = photoPublicId;
    expert.avatard = null;
    await expert.save();
    res.status(200).json({ message: 'Photo mise à jour', expert });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la mise à jour de la photo", error: error.message });
  }
};

// DELETE /api/experts/:id/photo
exports.deleteExpertPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await Expert.findById(id);
    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });

    if (expert.photoPublicId) {
      try { await cloudinary.uploader.destroy(expert.photoPublicId); } catch (_) {}
    }

    expert.photoUrl = '';
    expert.photoPublicId = '';
    await expert.save();
    res.status(200).json({ message: 'Photo supprimée', expert });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression de la photo", error: error.message });
  }
};

// PATCH /api/experts/:id
exports.updateExpertProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['firstName','email','adressrdv','description','francais','anglais','roumain','allemand','italien','espagnol','avatard','siret','delayTime'];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        if (k === 'adressrdv') {
          const val = req.body[k];
          if (val && typeof val === 'string') {
            const parts = val.split(',').map(s => s.trim());
            update[k] = { addressLine: parts[0] || val, postalCode: parts[1] || '', city: parts[2] || '' };
          } else if (val && typeof val === 'object') {
            update[k] = {
              addressLine: (val.addressLine || '').trim(),
              postalCode: (val.postalCode || '').trim(),
              city: (val.city || '').trim()
            };
          } else {
            update[k] = { addressLine: '', postalCode: '', city: '' };
          }
        } else {
          update[k] = req.body[k];
        }
      }
    }
    // Validation delayTime si fourni
    if (Object.prototype.hasOwnProperty.call(update, 'delayTime')) {
      const allowedDelay = [0, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55, 60];
      const val = Number(update.delayTime);
      if (!Number.isFinite(val)) {
        return res.status(400).json({ message: 'delayTime doit être un nombre' });
      }
      if (!allowedDelay.includes(val)) {
        return res.status(400).json({ message: 'delayTime invalide. Valeurs autorisées: 0, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55, 60' });
      }
      update.delayTime = val;
    }
    // Normaliser le champ avatard: autoriser string non vide ou null
    if (Object.prototype.hasOwnProperty.call(update, 'avatard')) {
      if (update.avatard === '' || update.avatard === undefined) {
        update.avatard = null;
      } else if (typeof update.avatard !== 'string' && update.avatard !== null) {
        return res.status(400).json({ message: 'avatard doit être une chaîne (nom de fichier) ou null' });
      }
    }
    if (typeof update.email === 'string') {
      update.email = update.email.trim().toLowerCase();
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Aucun champ valide fourni' });
    }
    const expert = await Expert.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: 'query' })
      .populate([
        { path: 'specialties.specialty' },
        { path: 'specialties.subSpecialties' }
      ]);
    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });
    res.status(200).json({ message: 'Profil mis à jour', expert });
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur lors de la mise à jour du profil", error: error.message });
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

    // Propager aux 30 prochains jours
    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(today.getDate() + 29);
    const updates = [];
    for (let i = 0; i < 30; i++) {
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
    // Supprimer toute disponibilité hors fenêtre (au-delà de 30 jours)
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
    const pattern = buildDiacriticInsensitivePattern(String(search).trim());
    const match = {
      isValidate: true,
      $or: [
        { firstName: { $regex: pattern, $options: 'i' } }
      ]
    };
    const totalSearch = await Expert.countDocuments(match);
    const expertsAgg = totalSearch > 0
      ? await Expert.aggregate([
          { $match: match },
          { $sample: { size: Math.min(totalSearch, 200) } } // borne de sécurité
        ])
      : [];
    const experts = await Expert.populate(expertsAgg, [
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    const expertsWithNote = experts.map(e => {
      const obj = typeof e.toObject === 'function' ? e.toObject() : e;
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
    const { specialtyId, adressrdv, excludeIds } = req.body;
    const parsedPage = parseInt((req.body && req.body.page) ?? req.query.page, 10);
    const parsedLimit = parseInt((req.body && req.body.limit) ?? req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : null;
    if (!specialtyId) {
      return res.status(400).json({ message: "L'ID de la spécialité est requis." });
    }
    const query = {
      'specialties.specialty': mongoose.Types.ObjectId.isValid(specialtyId) ? new mongoose.Types.ObjectId(specialtyId) : specialtyId,
      isValidate: true
    };
    if (adressrdv) {
      const regex = { $regex: String(adressrdv), $options: 'i' };
      query.$or = [
        { 'adressrdv': regex }, // fallback anciens documents (string)
        { 'adressrdv.addressLine': regex },
        { 'adressrdv.city': regex },
        { 'adressrdv.postalCode': regex }
      ];
    }
    // Exclure les experts déjà récupérés côté client (sans impacter le total global)
    let excludeObjectIds = [];
    if (Array.isArray(excludeIds) && excludeIds.length > 0) {
      excludeObjectIds = excludeIds
        .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
        .filter(Boolean);
    }
    const total = await Expert.countDocuments(query);
    const skip = limit ? (page - 1) * limit : 0;
    if (total === 0) {
      if (!limit) return res.status(200).json([]);
      return res.status(200).json({ results: [], total: 0, page, limit, hasMore: false });
    }
    // Aléatoire sans doublons: appliquer l'exclusion en amont puis échantillonner
    const matchWithExclusion = excludeObjectIds.length > 0
      ? { $and: [query, { _id: { $nin: excludeObjectIds } }] }
      : query;
    const remainingCount = await Expert.countDocuments(matchWithExclusion);
    const effectiveLimit = limit || remainingCount;
    const expertsAgg = remainingCount > 0
      ? await Expert.aggregate([
          { $match: matchWithExclusion },
          { $sample: { size: Math.min(remainingCount, effectiveLimit) } },
        ])
      : [];
    const experts = await Expert.populate(expertsAgg, [
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    const expertsWithNote = experts.map(e => {
      const obj = typeof e.toObject === 'function' ? e.toObject() : e;
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });
    if (!limit) {
      return res.status(200).json(expertsWithNote);
    }
    return res.status(200).json({
      results: expertsWithNote,
      total, // total global (sans exclusion) pour la pagination côté client
      page,
      limit,
      hasMore: (excludeObjectIds.length + expertsWithNote.length) < total
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
    const matchByName = { 'specialties.specialty': specialty._id, isValidate: true };
    const totalByName = await Expert.countDocuments(matchByName);
    const expertsAgg = totalByName > 0
      ? await Expert.aggregate([
          { $match: matchByName },
          { $sample: { size: totalByName } }
        ])
      : [];
    const experts = await Expert.populate(expertsAgg, [
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    const expertsWithNote = experts.map(e => {
      const obj = typeof e.toObject === 'function' ? e.toObject() : e;
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
      specialtyIds, // nouveau: tableau d'IDs de spécialités
      adressrdv,
      visio,
      onsite,
      minPrice,
      maxPrice,
      duree,
      disponibilite, // "immediat", "aujourdhui", "troisjours", null
      langues, // tableau de langues à filtrer
      includeHistogram, // optionnel: renvoyer la distribution des prix sur l'ensemble du résultat filtré
      excludeIds // nouveau: exclure les ids déjà renvoyés côté client
    } = req.body;
    const parsedPage = parseInt((req.body && req.body.page) ?? req.query.page, 10);
    const parsedLimit = parseInt((req.body && req.body.limit) ?? req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : null;

    const query = {};
    if (adressrdv) {
      const regex = { $regex: String(adressrdv), $options: 'i' };
      query.$or = [
        { 'adressrdv': regex }, // fallback anciens documents (string)
        { 'adressrdv.addressLine': regex },
        { 'adressrdv.city': regex },
        { 'adressrdv.postalCode': regex }
      ];
    }
    // visio/onsite doivent désormais être vérifiés au niveau de specialties (par spécialité)
    // Filtres langues directement en Mongo (AND logique sur les langues demandées)
    if (langues && Array.isArray(langues) && langues.length > 0) {
      if (langues.includes('français')) query.francais = true;
      if (langues.includes('anglais')) query.anglais = true;
      if (langues.includes('roumain')) query.roumain = true;
      if (langues.includes('allemand')) query.allemand = true;
      if (langues.includes('italien')) query.italien = true;
      if (langues.includes('espagnol')) query.espagnol = true;
    }

    // Filtre spécialités + prix par durée (et disponibilité de la durée)
    // Durées supportées et fallback si non fournie
    const allowedDurations = [15, 30, 45, 60, 90];
    const duration = allowedDurations.includes(duree) ? duree : null; // pas de durée par défaut
    const durationPriceKey = duration ? `prix_${duration}min` : null;

    const specialtiesElemMatch = {};
    // Normaliser un éventuel tableau d'IDs de spécialités
    const selectedSpecialtyIds = Array.isArray(specialtyIds) ? specialtyIds.filter(Boolean).map(id => (
      mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
    )) : [];
    if (specialtyId) {
      specialtiesElemMatch.specialty = mongoose.Types.ObjectId.isValid(specialtyId)
        ? new mongoose.Types.ObjectId(specialtyId)
        : specialtyId;
    } else if (selectedSpecialtyIds.length > 0) {
      specialtiesElemMatch.specialty = { $in: selectedSpecialtyIds };
    }
    if (visio !== undefined) {
      specialtiesElemMatch.visio = visio;
    }
    if (onsite !== undefined) {
      specialtiesElemMatch.onsite = onsite;
    }

    // Appliquer la fourchette de prix
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceRange = {};
      if (minPrice !== undefined) priceRange.$gte = Number(minPrice);
      if (maxPrice !== undefined) priceRange.$lte = Number(maxPrice);
      if (durationPriceKey) {
        // Si une durée est fournie, filtrer sur le prix de cette durée
        specialtiesElemMatch[durationPriceKey] = priceRange;
      } else {
        // Sinon, accepter si AU MOINS une des durées a un prix dans l'intervalle
        specialtiesElemMatch.$or = [
          { prix_15min: priceRange },
          { prix_30min: priceRange },
          { prix_45min: priceRange },
          { prix_60min: priceRange },
          { prix_90min: priceRange }
        ];
      }
    } else if (duree !== undefined && durationPriceKey) {
      // Durée explicitement demandée (sans prix): juste exiger que ce prix existe
      specialtiesElemMatch[durationPriceKey] = { $ne: null };
    } else {
      // Aucune durée ni prix fournis: ne pas restreindre sur un prix particulier
      // On laisse uniquement specialtyId/visio/onsite filtrer
    }

    // Injecter l'elemMatch seulement si on a des contraintes sur specialties (durée dispo, prix, mode, ou id de spécialité)
    if (Object.keys(specialtiesElemMatch).length > 0) {
      query.specialties = { $elemMatch: specialtiesElemMatch };
    } else if (specialtyId) {
      // cas limite: specialtyId seul
      query['specialties.specialty'] = mongoose.Types.ObjectId.isValid(specialtyId)
        ? new mongoose.Types.ObjectId(specialtyId)
        : specialtyId;
    } else if (selectedSpecialtyIds.length > 0) {
      // cas limite: liste d'IDs seulement
      query['specialties.specialty'] = { $in: selectedSpecialtyIds };
    }

    // Compte total après filtres Mongo (hors disponibilité)
    // Toujours retourner uniquement les experts validés publiquement
    query.isValidate = true;
    const totalAfterBasicFilters = await Expert.countDocuments(query);

    // Pagination DB
    const skip = limit ? (page - 1) * limit : 0;
    // Aléatoire sans doublons via exclusion côté DB
    const dForAvail = duree || 30;
    if (totalAfterBasicFilters === 0) {
      const empty = [];
      if (!limit) return res.status(200).json(empty);
      return res.status(200).json({ results: empty, total: 0, page, limit, hasMore: false });
    }
    let excludeObjectIds = [];
    if (Array.isArray(excludeIds) && excludeIds.length > 0) {
      excludeObjectIds = excludeIds
        .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
        .filter(Boolean);
    }
    const matchWithExclusion = excludeObjectIds.length > 0
      ? { $and: [query, { _id: { $nin: excludeObjectIds } }] }
      : query;
    const remainingCount = await Expert.countDocuments(matchWithExclusion);
    const effectiveLimit = limit || remainingCount;
    let expertsPage = remainingCount > 0
      ? await Expert.aggregate([
          { $match: matchWithExclusion },
          { $sample: { size: Math.min(remainingCount, effectiveLimit) } },
        ])
      : [];
    expertsPage = await Expert.populate(expertsPage, [{ path: 'specialties.specialty' }]);

    let expertsWithAvail = await Promise.all(
      expertsPage.map(async expert => {
        const availabilities = await getAvailabilitiesForExpert(expert._id, dForAvail);
        const expertObj = typeof expert.toObject === 'function' ? expert.toObject() : expert;
        return {
          ...expertObj,
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
      const allMatchingBasic = await Expert.find(query).select({ _id: 1, specialties: 1 });

    const dForAvailAll = duration || 30;
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

      // Construit la liste des prix à la minute équivalents sur la durée sélectionnée
      // Si specialtyId est fourni, on prend le prix de cette spécialité; sinon, le premier prix dispo pour cette durée
      const pricePerMinute = allMatching.map((doc) => {
        const specs = Array.isArray(doc.specialties) ? doc.specialties : [];
        const key = `prix_${dForAvailAll}min`;
        let price = null;
        if (specialtyId) {
          const match = specs.find(s => String(s.specialty) === String(specialtyId) && typeof s[key] === 'number');
          price = match ? match[key] : null;
        } else if (selectedSpecialtyIds.length > 0) {
          const matchAnySelected = specs.find(s => selectedSpecialtyIds.map(String).includes(String(s.specialty)) && typeof s[key] === 'number');
          price = matchAnySelected ? matchAnySelected[key] : null;
        } else {
          const matchAny = specs.find(s => typeof s[key] === 'number');
          price = matchAny ? matchAny[key] : null;
        }
        if (typeof price === 'number' && !isNaN(price) && price > 0) {
          return price / dForAvailAll; // équivalent prix/minute pour compat front
        }
        return null;
      }).filter(p => typeof p === 'number' && !isNaN(p));

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
      hasMore: (excludeObjectIds.length + (limit || 0)) < totalForResponse,
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

    const totalAll = await Expert.countDocuments({ isValidate: true });
    const size = Math.min(limit, Math.max(0, totalAll));
    const expertsAgg = size > 0
      ? await Expert.aggregate([
          { $match: { isValidate: true } },
          { $sample: { size } }
        ])
      : [];
    const experts = await Expert.populate(expertsAgg, [
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);

    const payload = experts.map(e => {
      const obj = (e && typeof e.toObject === 'function') ? e.toObject() : e;
      obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
      return obj;
    });

    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des experts", error: error.message });
  }
};

// POST /api/experts/find-all (paginé, aléatoire, uniquement isValidate)
exports.findAllExperts = async (req, res) => {
  try {
    const parsedPage = parseInt((req.body && req.body.page) ?? req.query.page, 10);
    const parsedLimit = parseInt((req.body && req.body.limit) ?? req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 10;
    // Support de l'exclusion d'IDs déjà renvoyés côté client pour éviter les doublons sur les pages suivantes
    const rawExcludeIds = Array.isArray(req.body && req.body.excludeIds) ? req.body.excludeIds : [];
    const excludeObjectIds = rawExcludeIds
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
      .filter(Boolean);

    const baseMatch = { isValidate: true };
    const total = await Expert.countDocuments(baseMatch);
    if (total === 0) {
      return res.status(200).json({ results: [], total: 0, page, limit, hasMore: false });
    }

    // Si exclusion demandée, on exclut en amont et on échantillonne uniquement dans le restant
    // Cela évite les doublons entre pages lorsque le front cumule les résultats
    const matchWithExclusion = excludeObjectIds.length > 0
      ? { $and: [baseMatch, { _id: { $nin: excludeObjectIds } }] }
      : baseMatch;

    let expertsAgg;
    if (excludeObjectIds.length > 0) {
      const remainingCount = await Expert.countDocuments(matchWithExclusion);
      const size = Math.min(limit, Math.max(0, remainingCount));
      expertsAgg = size > 0
        ? await Expert.aggregate([
            { $match: matchWithExclusion },
            { $sample: { size } }
          ])
        : [];
    } else {
      // Comportement historique: échantillonner tout puis paginer pour un rendu aléatoire reproductible par page
      expertsAgg = await Expert.aggregate([
        { $match: baseMatch },
        { $sample: { size: total } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);
    }
    const experts = await Expert.populate(expertsAgg, [
      { path: 'specialties.specialty' },
      { path: 'specialties.subSpecialties' }
    ]);
    const allowedDurations = [15, 30, 45, 60, 90];
    const reqDuration = Number((req.body && req.body.duree) ?? req.query.duree);
    const dForAvail = allowedDurations.includes(reqDuration) ? reqDuration : 30;
    const payload = await Promise.all(
      experts.map(async (e) => {
        const obj = (e && typeof e.toObject === 'function') ? e.toObject() : e;
        try {
          const availabilities = await getAvailabilitiesForExpert(obj._id, dForAvail);
          obj.availabilities = availabilities;
        } catch (_) {
          obj.availabilities = [];
        }
        obj.noteMoyenneSur100 = getNoteMoyenneSur100(obj.notes);
        return obj;
      })
    );
    // hasMore: s'il y a exclusion, comparer (excludeIds.length + payload.length) < total pour refléter le fait qu'on a encore des éléments restants
    const excludeCount = Array.isArray(rawExcludeIds) ? rawExcludeIds.length : 0;
    const hasMore = (excludeCount + payload.length) < total && payload.length > 0;
    return res.status(200).json({
      results: payload,
      total,
      page,
      limit,
      hasMore
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération paginée des experts", error: error.message });
  }
};