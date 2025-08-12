const Availability = require('../models/availabilities.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');

// Ajouter ou mettre à jour la disponibilité journalière d'un expert

// Réserver un créneau pour un expert à une date précise
const bookSlot = async (req, res) => {
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
    // Calculer l'heure de fin
    const [startHour, startMinute] = start.split(":").map(Number);
    const startDate = new Date(`1970-01-01T${start}:00Z`);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const end = endDate.toISOString().substr(11, 5); // format HH:mm
    // Vérifier que le créneau est dans la plage de disponibilité
    if (start < availability.start || end > availability.end) {
      return res.status(400).json({ message: "Le créneau demandé est hors de la plage de disponibilité de l'expert." });
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
      specialty
    });
    await newSlot.save();
    availability.bookedSlots.push(newSlot._id);
    await availability.save();
    res.status(201).json({ message: "Créneau réservé avec succès", slot: newSlot });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la réservation du créneau", error: error.message });
  }
};

// Récupérer les créneaux disponibles pour les 14 prochains jours
const getAvailableSlots = async (req, res) => {
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
const deleteBookedSlot = async (req, res) => {
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

module.exports = { bookSlot, getAvailableSlots, deleteBookedSlot };
