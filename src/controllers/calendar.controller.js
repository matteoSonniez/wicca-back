const Availability = require('../models/availabilities.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');

// Ajouter ou mettre à jour la disponibilité journalière d'un expert

const add14DaysAvailabilities = async (req, res) => {
  try {
    const { expertId } = req.body;
    if (!expertId) {
      return res.status(400).json({ message: "expertId requis" });
    }
    const expert = await Expert.findById(expertId);
    if (!expert) {
      return res.status(404).json({ message: "Expert non trouvé" });
    }
    const { availabilityStart, availabilityEnd } = expert;
    if (!availabilityStart || !availabilityEnd) {
      return res.status(400).json({ message: "Horaires de disponibilité manquants pour cet expert." });
    }
    const today = new Date();
    const availabilities = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      availabilities.push({
        expertId: expert._id,
        date: dateStr,
        start: availabilityStart,
        end: availabilityEnd,
        bookedSlots: []
      });
    }
    // On évite les doublons : on ne crée que si la date n'existe pas déjà
    const created = [];
    for (const avail of availabilities) {
      const exists = await Availability.findOne({ expertId: avail.expertId, date: avail.date });
      if (!exists) {
        const newAvail = new Availability(avail);
        await newAvail.save();
        created.push(newAvail);
      }
    }
    console.log("haaaaaaaa");
    res.status(201).json({ message: `Disponibilités créées pour les 14 prochains jours`, created });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création des disponibilités", error: error.message });
  }
};

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
    // Vérifier les conflits avec les créneaux déjà réservés (sauf ceux annulés)
    for (const slotId of availability.bookedSlots) {
      const slot = await BookedSlot.findById(slotId);
      if (!slot || slot.cancel) continue;
      // Si le créneau demandé chevauche un slot réservé non annulé
      if (!(end <= slot.start || start >= slot.end)) {
        return res.status(400).json({ message: `Conflit avec un créneau déjà réservé de ${slot.start} à ${slot.end}` });
      }
    }
    console.log(req.user, "req.user");
    // Ajouter le créneau réservé
    const newSlot = new BookedSlot({
      start,
      end,
      date: new Date(date),
      expert: expertId,
      client: req.user ? req.user._id : null, // Nécessite que l'utilisateur soit authentifié
      ended: false,
      cancel: false,
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
    // Récupérer l'expert pour ses horaires de base
    const expert = await require('../models/experts.model').findById(expertId);
    if (!expert) {
      return res.status(404).json({ message: "Expert non trouvé" });
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    // Supprimer les availabilities passées
    await Availability.deleteMany({ expertId, date: { $lt: todayStr } });
    // Récupérer les availabilities existantes à partir d'aujourd'hui
    let availabilities = await Availability.find({
      expertId,
      date: { $gte: todayStr }
    }).sort({ date: 1 }).populate('bookedSlots');
    // Ajouter les jours manquants pour garantir 14 jours
    if (availabilities.length < 14) {
      const existingDates = availabilities.map(a => a.date);
      let startDate = availabilities.length > 0 ? new Date(availabilities[availabilities.length - 1].date) : today;
      for (let i = availabilities.length; i < 14; i++) {
        if (i === availabilities.length && availabilities.length === 0) {
          // Premier jour : aujourd'hui
          var dateToAdd = new Date(startDate);
        } else {
          // Jours suivants
          var dateToAdd = new Date(startDate);
          dateToAdd.setDate(startDate.getDate() + 1);
          startDate = new Date(dateToAdd);
        }
        const yyyy = dateToAdd.getFullYear();
        const mm = String(dateToAdd.getMonth() + 1).padStart(2, '0');
        const dd = String(dateToAdd.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        if (!existingDates.includes(dateStr)) {
          const newAvail = new Availability({
            expertId,
            date: dateStr,
            start: expert.availabilityStart,
            end: expert.availabilityEnd,
            bookedSlots: []
          });
          await newAvail.save();
          availabilities.push(newAvail);
        }
      }
      // Re-trier après ajout
      availabilities = await Availability.find({
        expertId,
        date: { $gte: todayStr }
      }).sort({ date: 1 }).limit(14).populate('bookedSlots');
    }
    function toMinutes(str) {
      const [h, m] = str.split(":").map(Number);
      return h * 60 + m;
    }
    const result = availabilities.map(avail => {
      const slots = [];
      // Générer les créneaux alignés sur la durée demandée
      let [h, m] = avail.start.split(":").map(Number);
      const [endH, endM] = avail.end.split(":").map(Number);
      const endMinutes = endH * 60 + endM;
      let current = h * 60 + m;

      // Si c'est aujourd'hui, on récupère l'heure actuelle en minutes
      let nowMinutes = 0;
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      if (avail.date === todayStr) {
        nowMinutes = today.getHours() * 60 + today.getMinutes();
      }

      while (current + duration <= endMinutes) {
        // On ne propose le créneau que si son start est >= à l'heure actuelle (pour aujourd'hui)
        if (avail.date !== todayStr || current >= nowMinutes) {
          const startH = Math.floor(current / 60);
          const startM = current % 60;
          const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
          // Calculer l'heure de fin
          const endSlot = current + duration;
          const endHSlot = Math.floor(endSlot / 60);
          const endMSlot = endSlot % 60;
          const endStr = `${String(endHSlot).padStart(2, '0')}:${String(endMSlot).padStart(2, '0')}`;
          // Vérifier les conflits (chevauchement strict, conversion en minutes)
          const startMin = toMinutes(startStr);
          const endMin = toMinutes(endStr);
          const conflict = avail.bookedSlots
            .filter(slot => !slot.cancel)
            .some(slot => {
              const slotStartMin = toMinutes(slot.start);
              const slotEndMin = toMinutes(slot.end);
              return (startMin < slotEndMin && endMin > slotStartMin);
            });
          if (!conflict) {
            slots.push({ start: startStr, end: endStr });
          }
        }
        current += duration;
      }
      return {
        date: avail.date,
        slots
      };
    });
    res.status(200).json({ availabilities: result });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des créneaux disponibles", error: error.message });
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

module.exports = { add14DaysAvailabilities, bookSlot, getAvailableSlots, deleteBookedSlot };
