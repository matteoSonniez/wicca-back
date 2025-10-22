// Contrôleur centralisé Admin
const PromoCode = require('../models/promoCode.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');
const User = require('../models/users.model');

// ---- PROMOS ----
exports.listPromos = async (req, res) => {
  try {
    const items = await PromoCode.find({}).sort({ createdAt: -1 }).limit(1000);
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.createPromo = async (req, res) => {
  try {
    const { code, percentOff = 10, active = true, validFrom = null, validTo = null, description = '', type = 'single' } = req.body || {};
    if (!code || String(code).trim().length === 0) return res.status(400).json({ message: 'code requis' });
    const existing = await PromoCode.findOne({ code: String(code).trim().toUpperCase() });
    if (existing) return res.status(409).json({ message: 'Code déjà existant' });
    if (!['single','multi'].includes(type)) return res.status(400).json({ message: 'type invalide (single|multi)' });
    const created = await PromoCode.create({ code, percentOff, active, validFrom, validTo, description, type });
    return res.status(201).json({ item: created });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.updatePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['code', 'percentOff', 'active', 'validFrom', 'validTo', 'description', 'type'];
    for (const k of allowed) {
      if (k in (req.body || {})) updates[k] = req.body[k];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      if (!['single','multi'].includes(updates.type)) return res.status(400).json({ message: 'type invalide (single|multi)' });
    }
    const updated = await PromoCode.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Code promo introuvable' });
    return res.status(200).json({ item: updated });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.deletePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PromoCode.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Code promo introuvable' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- UTILISATEURS (Admin) ----
exports.listUsers = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const { q } = req.query || {};
    const filters = {};
    if (q && String(q).trim().length > 0) {
      const regex = new RegExp(String(q).trim(), 'i');
      filters.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const total = await User.countDocuments(filters);
    const items = await User.find(filters)
      .select({ password: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// placeholders pour création/suppression si besoin ultérieur
exports.createUser = async (req, res) => { return res.status(501).json({ message: 'À implémenter' }); };
exports.deleteUser = async (req, res) => { return res.status(501).json({ message: 'À implémenter' }); };

// ---- EXPERTS (Admin) ----
exports.listExperts = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const total = await Expert.countDocuments({});
    const experts = await Expert.find({})
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items: experts, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.getExpertById = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await Expert.findById(id)
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties');
    if (!expert) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ item: expert });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.updateExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'firstName', 'email', 'description', 'francais', 'anglais', 'roumain', 'allemand', 'italien', 'espagnol',
      'delayTime', 'isValidate', 'siret', 'avatard', 'photoUrl', 'photoPublicId',
      // Mise à jour partielle d'adresse
      'adressrdv',
    ];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        update[k] = req.body[k];
      }
    }
    if (typeof update.email === 'string') {
      update.email = update.email.trim().toLowerCase();
    }
    // Normalisation adresse si fournie
    if (Object.prototype.hasOwnProperty.call(update, 'adressrdv')) {
      const val = update.adressrdv;
      if (val && typeof val === 'string') {
        const parts = val.split(',').map(s => s.trim());
        update.adressrdv = { addressLine: parts[0] || val, postalCode: parts[1] || '', city: parts[2] || '' };
      } else if (val && typeof val === 'object') {
        update.adressrdv = {
          addressLine: (val.addressLine || '').trim(),
          postalCode: (val.postalCode || '').trim(),
          city: (val.city || '').trim()
        };
      } else {
        update.adressrdv = { addressLine: '', postalCode: '', city: '' };
      }
    }

    const expert = await Expert.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: 'query' })
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties');
    if (!expert) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ item: expert });
  } catch (e) {
    if (e && e.code === 11000 && e.keyPattern && e.keyPattern.email) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.deleteExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Expert.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};


// ---- RDV (Admin) ----
exports.listAppointments = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.paid === 'true') filters.paid = true;
    if (req.query.paid === 'false') filters.paid = false;
    if (req.query.cancel === 'true') filters.cancel = true;
    if (req.query.cancel === 'false') filters.cancel = false;

    // Optionnel: filtrage par date ISO (YYYY-MM-DD)
    const { from, to } = req.query;
    if (from || to) {
      filters.date = {};
      if (from) filters.date.$gte = new Date(from);
      if (to) filters.date.$lte = new Date(to);
    }

    const total = await BookedSlot.countDocuments(filters);
    const items = await BookedSlot.find(filters)
      .populate({ path: 'expert', model: 'Expert', select: 'firstName email' })
      .populate({ path: 'client', model: 'User', select: 'firstName lastName email' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

