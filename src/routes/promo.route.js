const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const PromoCode = require('../models/promoCode.model');

// Validation d'un code promo (type single/multi)
router.post('/validate', auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ valid: false, message: 'Code promo requis' });
    }
    const normalized = code.trim().toUpperCase();
    const now = new Date();
    const found = await PromoCode.findOne({ code: normalized, active: true });
    if (!found) return res.status(404).json({ valid: false, message: 'Code promo introuvable ou inactif' });

    const withinStart = !found.validFrom || found.validFrom <= now;
    const withinEnd = !found.validTo || found.validTo >= now;
    if (!withinStart || !withinEnd) {
      return res.status(400).json({ valid: false, message: 'Code promo expiré ou non disponible' });
    }

    if (found.type === 'single') {
      // usage unique global: invalide si déjà utilisé
      if (found.usedGlobal === true) {
        return res.status(400).json({ valid: false, message: 'Code déjà utilisé' });
      }
      // invalide s'il est temporairement réservé par un autre créneau
      const reservedValid = !!found.reservedUntil && found.reservedUntil > now;
      if (reservedValid) {
        return res.status(400).json({ valid: false, message: "Code en cours d'utilisation, réessayez plus tard" });
      }
      return res.status(200).json({
        valid: true,
        code: found.code,
        percentOff: Number(found.percentOff || 0),
        type: found.type
      });
    }

    if (found.type === 'multi') {
      // multi: une seule fois par utilisateur
      const userId = req.user && req.user._id ? String(req.user._id) : null;
      if (!userId) return res.status(401).json({ valid: false, message: 'Authentification requise' });
      const already = (found.usedBy || []).some(u => String(u.user) === userId);
      if (already) {
        return res.status(400).json({ valid: false, message: 'Vous avez déjà utilisé ce code' });
      }
      return res.status(200).json({
        valid: true,
        code: found.code,
        percentOff: Number(found.percentOff || 0),
        type: found.type
      });
    }

    return res.status(400).json({ valid: false, message: 'Type de code promo invalide' });
  } catch (e) {
    return res.status(500).json({ valid: false, message: e?.message || 'Erreur serveur' });
  }
});

// CRUD promo déplacé vers /api/admin/promos

module.exports = router;
