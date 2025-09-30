const User = require('../models/users.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');

// GET /api/rdv/client/:userId
const getClientAppointmentsById = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'userId requis' });

    const user = await User.findById(userId)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'expert', model: 'Expert', select: 'firstName lastName email' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ rdvs: user.rdv || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV client', error: error.message });
  }
};

// GET /api/rdv/client (auth requis)
const getClientAppointmentsMe = async (req, res) => {
  try {
    const me = req.user;
    if (!me || !me._id) return res.status(403).json({ message: 'Réservé aux utilisateurs authentifiés' });

    const user = await User.findById(me._id)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'expert', model: 'Expert', select: 'firstName lastName email' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ rdvs: user.rdv || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV client', error: error.message });
  }
};

// GET /api/rdv/expert/:expertId
const getExpertAppointmentsById = async (req, res) => {
  try {
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });

    const expert = await Expert.findById(expertId)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'client', model: 'User', select: 'firstName lastName email' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });

    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });
    const now = new Date();
    const rdvs = expert.rdv || [];

    // Déterminer les RDV terminés (date + heure de fin passées)
    const idsToMarkEnded = [];
    for (const rdv of rdvs) {
      try {
        const timeString = rdv.end || rdv.start; // fallback sur start si end manquant
        if (!timeString) continue;
        const [hh, mm] = timeString.split(':').map(Number);
        const endDateTime = new Date(rdv.date);
        endDateTime.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
        if (endDateTime <= now && !rdv.ended) {
          idsToMarkEnded.push(rdv._id);
          rdv.ended = true; // refléter immédiatement dans la réponse
        }
      } catch (_) {
        // ignorer un rdv mal formé
      }
    }

    if (idsToMarkEnded.length > 0) {
      await BookedSlot.updateMany({ _id: { $in: idsToMarkEnded } }, { $set: { ended: true } });
    }

    res.json({ rdvs });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV expert', error: error.message });
  }
};

module.exports = { getClientAppointmentsById, getClientAppointmentsMe, getExpertAppointmentsById };


