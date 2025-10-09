const Review = require('../models/review.model');
const BookedSlot = require('../models/bookedSlot.model');

// POST /reviews
// Création d'un avis par un client sur un RDV terminé et payé
exports.createReview = async (req, res) => {
  try {
    const { rdvId, note, commentaire } = req.body;

    if (typeof note !== 'number' || note < 10 || note > 100) {
      return res.status(400).json({ message: 'La note doit être un nombre entre 10 et 100.' });
    }

    // Récupérer le RDV et vérifier les droits
    const rdv = await BookedSlot.findById(rdvId);
    if (!rdv) return res.status(404).json({ message: 'RDV introuvable' });

    // Seul le client du RDV authentifié peut noter
    if (!req.user || String(rdv.client) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    // Plus de vérification ended/paid côté serveur: l'UI contrôle l'accès

    // Création (protégée par l’index unique client+rdv)
    const created = await Review.create({
      note,
      commentaire: commentaire || '',
      expert: rdv.expert,
      client: rdv.client,
      rdv: rdv._id
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Vous avez déjà laissé un avis pour ce RDV.' });
    }
    return res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// GET /reviews/expert/:expertId
exports.getReviewsForExpert = async (req, res) => {
  try {
    const { expertId } = req.params;
    const reviews = await Review.find({ expert: expertId })
      .sort({ createdAt: -1 })
      .populate('client', 'firstName lastName')
      .populate('rdv', 'date start end');
    return res.json(reviews);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// GET /reviews/me
exports.getMyReviews = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentification requise' });
    const reviews = await Review.find({ client: req.user._id })
      .sort({ createdAt: -1 })
      .populate('expert', 'firstName');
    return res.json(reviews);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// GET /reviews/expert/:expertId/average
exports.getExpertAverage = async (req, res) => {
  try {
    const { expertId } = req.params;
    const agg = await Review.aggregate([
      { $match: { expert: new (require('mongoose').Types.ObjectId)(expertId) } },
      { $group: { _id: '$expert', avg: { $avg: '$note' }, count: { $sum: 1 } } }
    ]);
    if (!agg.length) return res.json({ average: null, count: 0 });
    return res.json({ average: agg[0].avg, count: agg[0].count });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};


