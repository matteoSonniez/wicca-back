const Availability = require('../models/availabilities.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');
const User = require('../models/users.model');
const ExpertModel = require('../models/experts.model');

// Ajouter ou mettre à jour la disponibilité journalière d'un expert

// Réserver un créneau pour un expert à une date précise
module.exports.bookSlot = async (req, res) => {
  try {
    const { expertId, date, start, duration, specialty } = req.body;
    if (!expertId || !date || !start || !duration || !specialty) {
      return res.status(400).json({ message: "expertId, date, start, duration et specialty sont requis" });
    }
    // Récupérer la disponibilité du jour
    const availability = await Availability.findOne({ expertId, date });
    if (!availability) {
      return res.status(404).json({ message: "Disponibilité non trouvée pour ce jour" });
    }
    // Récupérer l'expert pour calculer le prix
    const expert = await ExpertModel.findById(expertId).select({ prix_minute: 1 });
    if (!expert) {
      return res.status(404).json({ message: "Expert introuvable" });
    }
    const computedPrice = Number(duration) * Number(expert.prix_minute || 0);
    // Calculer l'heure de fin
    const [startHour, startMinute] = start.split(":").map(Number);
    const startDate = new Date(`1970-01-01T${start}:00Z`);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const end = endDate.toISOString().substr(11, 5); // format HH:mm
    // Vérifier que le créneau est dans au moins une des plages de disponibilité (ranges)
    const ranges = Array.isArray(availability.ranges) ? availability.ranges : [];
    const isInside = ranges.some(r => start >= r.start && end <= r.end);
    if (!isInside) {
      return res.status(400).json({ message: "Le créneau demandé est hors des plages de disponibilité de l'expert." });
    }
    // Vérifier les conflits avec les créneaux déjà réservés (sauf ceux annulés ou expirés)
    const now = new Date();
    for (const slotId of availability.bookedSlots) {
      const slot = await BookedSlot.findById(slotId);
      if (!slot) continue; // slot supprimé (TTL) ou introuvable
      if (slot.cancel) continue; // annulé
      const isActiveHold = !slot.paid && slot.holdExpiresAt && slot.holdExpiresAt > now;
      const blocks = slot.paid || isActiveHold;
      if (!blocks) continue; // hold expiré -> ne bloque pas
      // Si le créneau demandé chevauche un slot bloquant
      if (!(end <= slot.start || start >= slot.end)) {
        return res.status(400).json({ message: `Conflit avec un créneau déjà réservé de ${slot.start} à ${slot.end}` });
      }
    }
    console.log(req.user, "req.user");
    // Ajouter le créneau réservé
    // Créer un hold temporaire qui expirera automatiquement si pas payé
    const HOLD_MINUTES = 2;
    const newSlot = new BookedSlot({
      start,
      end,
      date: new Date(date),
      expert: expertId,
      client: req.user ? req.user._id : null, // Nécessite que l'utilisateur soit authentifié
      ended: false,
      cancel: false,
      paid: false,
      holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
      specialty,
      price: computedPrice
    });
    await newSlot.save();
    availability.bookedSlots.push(newSlot._id);
    await availability.save();
    // Ajouter la référence du créneau au user connecté (si présent)
    if (req.user && req.user._id) {
      try {
        await User.findByIdAndUpdate(
          req.user._id,
          { $addToSet: { rdv: newSlot._id } },
          { new: false }
        );
      } catch (e) {
        // On log seulement; la réservation reste valide même si l'update user échoue
        console.warn('Impossible d\'ajouter le rdv au user:', e?.message);
      }
    }
    // Ajouter la référence du créneau à l'expert concerné
    try {
      await ExpertModel.findByIdAndUpdate(
        expertId,
        { $addToSet: { rdv: newSlot._id } },
        { new: false }
      );
    } catch (e) {
      console.warn('Impossible d\'ajouter le rdv à l\'expert:', e?.message);
    }
    res.status(201).json({ message: "Créneau réservé avec succès", slot: newSlot });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la réservation du créneau", error: error.message });
  }
};

// Récupérer les créneaux disponibles pour les 14 prochains jours
module.exports.getAvailableSlots = async (req, res) => {
  try {
    const { expertId } = req.params;
    const duration = parseInt(req.query.duration, 10);
    if (!expertId || !duration) {
      return res.status(400).json({ message: "expertId et duration sont requis" });
    }
    const { getAvailabilitiesForExpert } = require('../utils/availabilities');
    const result = await getAvailabilitiesForExpert(expertId, duration);
    return res.status(200).json({ availabilities: result });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la récupération des créneaux disponibles", error: error.message });
  }
};

// Supprimer un créneau réservé (bookedSlot)
module.exports.deleteBookedSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    if (!slotId) {
      return res.status(400).json({ message: "slotId requis" });
    }
    // Trouver le slot à supprimer
    const slot = await BookedSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: "Créneau réservé non trouvé" });
    }
    // Retirer la référence dans la disponibilité du jour
    await Availability.updateOne(
      { expertId: slot.expert, date: slot.date.toISOString().slice(0, 10) },
      { $pull: { bookedSlots: slot._id } }
    );
    // Supprimer le slot
    await BookedSlot.deleteOne({ _id: slotId });
    res.status(200).json({ message: "Créneau réservé supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression du créneau réservé", error: error.message });
  }
};

// Mettre à jour les ranges d'une availability par date
module.exports.updateAvailabilityRanges = async (req, res) => {
  try {
    const { expertId, date } = req.params;
    const { ranges } = req.body || {};
    if (!expertId || !date) return res.status(400).json({ message: 'expertId et date requis' });
    if (!Array.isArray(ranges)) return res.status(400).json({ message: 'ranges doit être un tableau' });
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const r of ranges) {
      if (!timeRegex.test(r.start || '') || !timeRegex.test(r.end || '')) {
        return res.status(400).json({ message: 'Format HH:MM requis pour start/end' });
      }
      if ((r.start || '') >= (r.end || '')) {
        return res.status(400).json({ message: 'start doit être < end' });
      }
    }
    if (ranges.length === 0) {
      await Availability.deleteOne({ expertId, date });
      return res.status(200).json({ message: 'Disponibilité supprimée' });
    }
    const updated = await Availability.findOneAndUpdate(
      { expertId, date },
      { $set: { ranges } },
      { new: true, upsert: true }
    );
    res.status(200).json({ message: 'Disponibilité mise à jour', availability: updated });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour des disponibilités', error: error.message });
  }
};

// module.exports = { bookSlot, getAvailableSlots, deleteBookedSlot };
