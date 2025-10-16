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
  // Fenêtre d'horizon: aujourd'hui + 29 jours (30 jours au total)
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 29);
  const yyyyH = horizon.getFullYear();
  const mmH = String(horizon.getMonth() + 1).padStart(2, '0');
  const ddH = String(horizon.getDate()).padStart(2, '0');
  const horizonEndStr = `${yyyyH}-${mmH}-${ddH}`;

  // 1) Nettoyage: dates passées ET au-delà de l'horizon
  await Availability.deleteMany({ expertId, $or: [ { date: { $lt: todayStr } }, { date: { $gt: horizonEndStr } } ] });

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

  // 3) Lire les dispos actuelles dans la fenêtre
  let availabilities = await Availability.find({
    expertId,
    date: { $gte: todayStr, $lte: horizonEndStr }
  }).sort({ date: 1 }).populate('bookedSlots');

  // 4) Compléter jusqu'à 29 jours manquants (upsert, évite doublons)
  if (availabilities.length < 30) { // 30 jours incluant aujourd'hui
    const existingDates = new Set(availabilities.map(a => a.date));
    let startDate = availabilities.length > 0 ? new Date(availabilities[availabilities.length - 1].date) : today;
    for (let i = availabilities.length; i < 30; i++) {
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
      // ne pas dépasser l'horizon
      if (dateStr > horizonEndStr) break;
      if (!existingDates.has(dateStr)) {
        // Déterminer la clé de jour pour weeklySchedule
        const day = dateToAdd.getDay(); // 0=Sun..6=Sat
        const key = ['sun','mon','tue','wed','thu','fri','sat'][day];
        const rangesWS = (expert.weeklySchedule && expert.weeklySchedule[key]) ? expert.weeklySchedule[key] : [];
        let ranges = [];
        if (Array.isArray(rangesWS) && rangesWS.length > 0) {
          ranges = rangesWS.map(r => ({ start: r.start, end: r.end }));
        }
        // Si aucune range: ne pas créer d'Availability pour cette date
        if (ranges.length === 0) {
          continue;
        }
        const newAvail = await Availability.findOneAndUpdate(
          { expertId, date: dateStr },
          {
            $setOnInsert: {
              expertId,
              date: dateStr,
              ranges,
              bookedSlots: []
            }
          },
          { new: true, upsert: true }
        );
        existingDates.add(dateStr);
        availabilities.push(newAvail);
      }
    }
    // Re-lecture propre et limitée à 29
    availabilities = await Availability.find({
      expertId,
      date: { $gte: todayStr, $lte: horizonEndStr }
    }).sort({ date: 1 }).limit(30).populate('bookedSlots');
  }
  function toMinutes(str) {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
  }
  const result = availabilities.map(avail => {
    const slots = [];
    // Construire la liste des plages effectives pour la journée
    const effectiveRanges = Array.isArray(avail.ranges) ? avail.ranges : [];
    // Délai entre consultations (minutes)
    const gap = Number(expert.delayTime) || 0;
    let nowMinutes = 0;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    if (avail.date === todayStr) {
      // Appliquer un délai minimal de 10 minutes avant le prochain créneau affiché
      nowMinutes = today.getHours() * 60 + today.getMinutes() + 10;
    }
    // Préparer les fenêtres interdites pour les DÉBUTS de créneau, en fonction des RDV existants + délai
    const now = new Date();
    const blocking = (avail.bookedSlots || [])
      .filter(slot => !!slot && !slot.cancel)
      .filter(slot => {
        const isActiveHold = !slot.paid && slot.holdExpiresAt && new Date(slot.holdExpiresAt) > now;
        const isAuthorized = slot.authorized === true;
        const isScheduledCapture = slot.captureScheduledFor && new Date(slot.captureScheduledFor) > now;
        return (slot.paid === true) || isActiveHold || isAuthorized || isScheduledCapture;
      })
      .map(slot => [toMinutes(slot.start), toMinutes(slot.end)])
      .sort((a, b) => a[0] - b[0]);

    // Interdiction des débuts s dans (slotStart - gap - duration, slotEnd + gap)
    const rawForbidden = blocking.map(([bs, be]) => [Math.max(0, bs - gap - duration), be + gap]);
    // Fusionner les intervalles interdits
    const forbidden = [];
    for (const iv of rawForbidden) {
      if (forbidden.length === 0) { forbidden.push(iv); continue; }
      const last = forbidden[forbidden.length - 1];
      if (iv[0] <= last[1]) {
        last[1] = Math.max(last[1], iv[1]);
      } else {
        forbidden.push(iv);
      }
    }

    for (const range of effectiveRanges) {
      const [h, m] = (range.start || '00:00').split(":").map(Number);
      const [endH, endM] = (range.end || '00:00').split(":").map(Number);
      const endMinutes = endH * 60 + endM;
      let current = h * 60 + m;
      while (current + duration <= endMinutes) {
        if (avail.date !== todayStr || current >= nowMinutes) {
          // Si on est aujourd'hui, respecter le nowMinutes minimal
          if (avail.date === todayStr && current < nowMinutes) {
            current = nowMinutes;
            continue;
          }
          // Si current tombe dans une fenêtre interdite, sauter à la fin de celle-ci
          const blockIv = forbidden.find(([s, e]) => current >= s && current < e);
          if (blockIv) {
            current = blockIv[1];
            continue;
          }
          const startH = Math.floor(current / 60);
          const startM = current % 60;
          const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
          const endSlot = current + duration;
          const endHSlot = Math.floor(endSlot / 60);
          const endMSlot = endSlot % 60;
          const endStr = `${String(endHSlot).padStart(2, '0')}:${String(endMSlot).padStart(2, '0')}`;
          const startMin = toMinutes(startStr);
          const endMin = toMinutes(endStr);
          const conflict = (avail.bookedSlots || [])
            .filter(slot => !!slot && !slot.cancel)
            .some(slot => {
              const isActiveHold = !slot.paid && slot.holdExpiresAt && new Date(slot.holdExpiresAt) > now;
              const isAuthorized = slot.authorized === true; // paiement autorisé (requires_capture)
              const isScheduledCapture = slot.captureScheduledFor && new Date(slot.captureScheduledFor) > now;
              const blocks = (slot.paid === true) || isActiveHold || isAuthorized || isScheduledCapture;
              if (!blocks) return false;
              const slotStartMin = toMinutes(slot.start);
              const slotEndMin = toMinutes(slot.end);
              return (startMin < slotEndMin && endMin > slotStartMin);
            });
          // Les fenêtres interdites gèrent déjà le délai avant/après; on garde le test de conflit par sécurité
          if (!conflict) {
            slots.push({ start: startStr, end: endStr });
          }
        }
        // Incrémente par la durée uniquement; avec saut automatique des fenêtres interdites
        current += duration;
      }
    }
    return {
      date: avail.date,
      slots,
      ranges: Array.isArray(avail.ranges) ? avail.ranges : []
    };
  });
  return result;
}

module.exports = { getAvailabilitiesForExpert };
