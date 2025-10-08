const BookedSlot = require('../models/bookedSlot.model');

// GET /api/dashboard/rdv/month/:expertId
// Retourne tous les RDV du mois courant (1 -> aujourd'hui) pour un expert
exports.getExpertMonthlyAppointments = async (req, res) => {
  try {
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });

    // Calcul des bornes du mois courant en Europe/Paris
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    // fin = dernier jour du mois courant 23:59:59.999
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = new Date(year, month, lastDay, 23, 59, 59, 999);

    // Filtrer par expert, par date, et exclure les créneaux annulés
    const rdvs = await BookedSlot.find({
      expert: expertId,
      cancel: { $ne: true },
      date: { $gte: start, $lte: end },
    })
      .sort({ date: -1, start: -1 })
      .populate({ path: 'client', model: 'User', select: 'firstName lastName email' })
      .populate({ path: 'expert', model: 'Expert', select: 'firstName lastName email' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name color' });

    return res.status(200).json({ rdvs });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des RDV du mois', error: error.message });
  }
};

// GET /api/dashboard/clients/month/:expertId
// Retourne le nombre de clients uniques sur le mois courant pour un expert
exports.getExpertMonthlyUniqueClientsCount = async (req, res) => {
  try {
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = new Date(year, month, lastDay, 23, 59, 59, 999);

    const rdvs = await BookedSlot.find({
      expert: expertId,
      cancel: { $ne: true },
      date: { $gte: start, $lte: end },
    }).select('client');

    const unique = new Set(
      rdvs
        .map(r => String(r.client))
        .filter(id => !!id && id !== 'null' && id !== 'undefined')
    );

    return res.status(200).json({ uniqueClients: unique.size });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors du comptage des clients du mois', error: error.message });
  }
};

// GET /api/dashboard/revenue/month/:expertId
// Retourne les revenus cumulés jour par jour pour le mois courant et le mois précédent
exports.getExpertMonthlyRevenueCompare = async (req, res) => {
  try {
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Mois courant (1 -> dernier jour)
    const startCurr = new Date(year, month, 1, 0, 0, 0, 0);
    const lastDayCurr = new Date(year, month + 1, 0).getDate();
    const endCurr = new Date(year, month, lastDayCurr, 23, 59, 59, 999);

    // Mois précédent (1 -> dernier jour)
    const prevMonth = month - 1;
    const prevYear = prevMonth < 0 ? year - 1 : year;
    const prevMonthIndex = (prevMonth + 12) % 12;
    const startPrev = new Date(prevYear, prevMonthIndex, 1, 0, 0, 0, 0);
    const lastDayPrev = new Date(prevYear, prevMonthIndex + 1, 0).getDate();
    const endPrev = new Date(prevYear, prevMonthIndex, lastDayPrev, 23, 59, 59, 999);

    const [rdvsCurr, rdvsPrev] = await Promise.all([
      BookedSlot.find({ expert: expertId, cancel: { $ne: true }, date: { $gte: startCurr, $lte: endCurr } }).select('date price'),
      BookedSlot.find({ expert: expertId, cancel: { $ne: true }, date: { $gte: startPrev, $lte: endPrev } }).select('date price'),
    ]);

    function toDailyCumulative(rdvs, y, m, daysInMonth) {
      const daily = Array.from({ length: daysInMonth }, () => 0);
      for (const r of rdvs) {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) continue;
        if (d.getFullYear() !== y || d.getMonth() !== m) continue;
        const day = d.getDate();
        const price = typeof r.price === 'number' ? r.price : Number(r.price || 0) || 0;
        if (day >= 1 && day <= daysInMonth) daily[day - 1] += price;
      }
      let acc = 0;
      return daily.map((val, idx) => {
        acc += val;
        const label = String(idx + 1).padStart(2, '0');
        return { label, value: acc };
      });
    }

    const daysCurr = lastDayCurr;
    const daysPrev = lastDayPrev;
    const dataCurr = toDailyCumulative(rdvsCurr, year, month, daysCurr);
    const dataPrev = toDailyCumulative(rdvsPrev, prevYear, prevMonthIndex, daysPrev);

    const monthLabel = new Date(year, month, 1).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' });
    const prevMonthLabel = new Date(prevYear, prevMonthIndex, 1).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' });

    const currentTotal = dataCurr.length ? dataCurr[dataCurr.length - 1].value : 0;

    return res.status(200).json({ current: dataCurr, previous: dataPrev, monthLabel, prevMonthLabel, currentTotal });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération des revenus', error: error.message });
  }
};


