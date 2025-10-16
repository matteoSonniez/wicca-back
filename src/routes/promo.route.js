const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const PromoCode = require('../models/promoCode.model');

// Validation simple d'un code promo
router.post('/validate', auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ valid: false, message: 'Code promo requis' });
    }
    const normalized = code.trim().toUpperCase();
    const now = new Date();
    const found = await PromoCode.findOne({ code: normalized, active: true, used: { $ne: true } });
    if (!found) return res.status(404).json({ valid: false, message: 'Code promo invalide' });

    const withinStart = !found.validFrom || found.validFrom <= now;
    const withinEnd = !found.validTo || found.validTo >= now;
    if (!withinStart || !withinEnd) {
      return res.status(400).json({ valid: false, message: 'Code promo expiré ou non disponible' });
    }

    return res.status(200).json({
      valid: true,
      code: found.code,
      percentOff: Number(found.percentOff || 0),
      singleUse: !!found.singleUse
    });
  } catch (e) {
    return res.status(500).json({ valid: false, message: e?.message || 'Erreur serveur' });
  }
});

// CRUD promo déplacé vers /api/admin/promos

module.exports = router;


