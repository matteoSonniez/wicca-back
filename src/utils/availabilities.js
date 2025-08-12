const Availability = require('../models/availabilities.model');
const Expert = require('../models/experts.model');

async function getAvailabilitiesForExpert(expertId, duration) {
  if (!expertId || !duration) return [];
  const expert = await Expert.findById(expertId);
  if (!expert) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // 1) Nettoyage des dates passées
  await Availability.deleteMany({ expertId, date: { $lt: todayStr } });

  // 2) Déduplication stricte par date si des doublons existent déjà
  const duplicates = await Availability.aggregate([
    { $match: { expertId: expert._id } },
    { $group: { _id: { date: "$date" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  for (const d of duplicates) {
    const ids = d.ids;
    const keepId = ids[0];
    const toDelete = ids.slice(1);
    if (toDelete.length) {
      await Availability.deleteMany({ _id: { $in: toDelete } });
    }
  }

  // 3) Lire les dispos actuelles à partir d'aujourd'hui
  let availabilities = await Availability.find({
    expertId,
    date: { $gte: todayStr }
  }).sort({ date: 1 }).populate('bookedSlots');

  // 4) Compléter jusqu'à 14 jours manquants (upsert, évite doublons)
  if (availabilities.length < 14) {
    const existingDates = new Set(availabilities.map(a => a.date));
    let startDate = availabilities.length > 0 ? new Date(availabilities[availabilities.length - 1].date) : today;
    for (let i = availabilities.length; i < 14; i++) {
      let dateToAdd;
      if (i === availabilities.length && availabilities.length === 0) {
        dateToAdd = new Date(startDate);
      } else {
        dateToAdd = new Date(startDate);
        dateToAdd.setDate(startDate.getDate() + 1);
        startDate = new Date(dateToAdd);
      }
      const yyyy = dateToAdd.getFullYear();
      const mm = String(dateToAdd.getMonth() + 1).padStart(2, '0');
      const dd = String(dateToAdd.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      if (!existingDates.has(dateStr)) {
        const newAvail = await Availability.findOneAndUpdate(
          { expertId, date: dateStr },
          {
            $setOnInsert: {
              expertId,
              date: dateStr,
              start: expert.availabilityStart,
              end: expert.availabilityEnd,
              bookedSlots: []
            }
          },
          { new: true, upsert: true }
        );
        existingDates.add(dateStr);
        availabilities.push(newAvail);
      }
    }
    // Re-lecture propre et limitée à 14
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
    let [h, m] = avail.start.split(":").map(Number);
    const [endH, endM] = avail.end.split(":").map(Number);
    const endMinutes = endH * 60 + endM;
    let current = h * 60 + m;
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
      if (avail.date !== todayStr || current >= nowMinutes) {
        const startH = Math.floor(current / 60);
        const startM = current % 60;
        const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
        const endSlot = current + duration;
        const endHSlot = Math.floor(endSlot / 60);
        const endMSlot = endSlot % 60;
        const endStr = `${String(endHSlot).padStart(2, '0')}:${String(endMSlot).padStart(2, '0')}`;
        const startMin = toMinutes(startStr);
        const endMin = toMinutes(endStr);
        const now = new Date();
        const conflict = (avail.bookedSlots || [])
          .filter(slot => !!slot && !slot.cancel)
          .some(slot => {
            const isActiveHold = !slot.paid && slot.holdExpiresAt && new Date(slot.holdExpiresAt) > now;
            const blocks = slot.paid || isActiveHold;
            if (!blocks) return false;
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
  return result;
}

module.exports = { getAvailabilitiesForExpert };
