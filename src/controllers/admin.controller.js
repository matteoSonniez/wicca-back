// Contrôleur centralisé Admin
const PromoCode = require('../models/promoCode.model');
const Expert = require('../models/experts.model');

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
    const { code, percentOff = 10, active = true, validFrom = null, validTo = null, description = '', singleUse = true } = req.body || {};
    if (!code || String(code).trim().length === 0) return res.status(400).json({ message: 'code requis' });
    const existing = await PromoCode.findOne({ code: String(code).trim().toUpperCase() });
    if (existing) return res.status(409).json({ message: 'Code déjà existant' });
    const created = await PromoCode.create({ code, percentOff, active, validFrom, validTo, description, singleUse });
    return res.status(201).json({ item: created });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.updatePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['code', 'percentOff', 'active', 'validFrom', 'validTo', 'description', 'singleUse'];
    for (const k of allowed) {
      if (k in (req.body || {})) updates[k] = req.body[k];
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

// Placeholders pour futurs endpoints (utilisateurs, etc.)
exports.listUsers = async (req, res) => { return res.status(501).json({ message: 'À implémenter' }); };
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


