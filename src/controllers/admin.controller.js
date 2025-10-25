// Contrôleur centralisé Admin
const PromoCode = require('../models/promoCode.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');
const User = require('../models/users.model');
const AnalyticsEvent = require('../models/analyticsEvent.model');

// ---- PROMOS ----
exports.listPromos = async (req, res) => {
  try {
    const items = await PromoCode.find({}).sort({ createdAt: -1 }).limit(1000);
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.createPromo = async (req, res) => {
  try {
    const { code, percentOff = 10, active = true, validFrom = null, validTo = null, description = '', type = 'single' } = req.body || {};
    if (!code || String(code).trim().length === 0) return res.status(400).json({ message: 'code requis' });
    const existing = await PromoCode.findOne({ code: String(code).trim().toUpperCase() });
    if (existing) return res.status(409).json({ message: 'Code déjà existant' });
    if (!['single','multi'].includes(type)) return res.status(400).json({ message: 'type invalide (single|multi)' });
    const created = await PromoCode.create({ code, percentOff, active, validFrom, validTo, description, type });
    return res.status(201).json({ item: created });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.updatePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['code', 'percentOff', 'active', 'validFrom', 'validTo', 'description', 'type'];
    for (const k of allowed) {
      if (k in (req.body || {})) updates[k] = req.body[k];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      if (!['single','multi'].includes(updates.type)) return res.status(400).json({ message: 'type invalide (single|multi)' });
    }
    const updated = await PromoCode.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Code promo introuvable' });
    return res.status(200).json({ item: updated });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.deletePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PromoCode.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Code promo introuvable' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- UTILISATEURS (Admin) ----
exports.listUsers = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const { q } = req.query || {};
    const filters = {};
    if (q && String(q).trim().length > 0) {
      const regex = new RegExp(String(q).trim(), 'i');
      filters.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const total = await User.countDocuments(filters);
    const items = await User.find(filters)
      .select({ password: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// placeholders pour création/suppression si besoin ultérieur
exports.createUser = async (req, res) => { return res.status(501).json({ message: 'À implémenter' }); };
exports.deleteUser = async (req, res) => { return res.status(501).json({ message: 'À implémenter' }); };

// ---- STATS (Admin) ----
exports.acquisitionStats = async (req, res) => {
  try {
    // Regrouper par acquisitionSource, compter, et lister "Autre" détaillé
    const pipeline = [
      {
        $group: {
          _id: {
            source: { $ifNull: ["$acquisitionSource", "Non renseigné"] },
            other: {
              $cond: [{ $eq: ["$acquisitionSource", "Autre"] }, { $ifNull: ["$acquisitionSourceOther", ""] }, null]
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.source": 1 } }
    ];

    const rows = await User.aggregate(pipeline);

    // Construire structure lisible: counts par source + top liste pour "Autre"
    const countsBySource = {};
    const others = {};

    for (const row of rows) {
      const source = row._id?.source || 'Non renseigné';
      const other = row._id?.other;
      if (!countsBySource[source]) countsBySource[source] = 0;
      countsBySource[source] += row.count || 0;
      if (source === 'Autre' && typeof other === 'string') {
        const key = other.trim();
        if (!others[key]) others[key] = 0;
        others[key] += row.count || 0;
      }
    }

    // Générer tableau trié
    const items = Object.entries(countsBySource)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Détails des "Autre"
    const autres = Object.entries(others)
      .map(([label, count]) => ({ label: label || '—', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);

    return res.status(200).json({ items, autres, totalSources: items.length, totalUsers: items.reduce((s, it) => s + it.count, 0) });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- ANALYTICS (Admin) ----
exports.analyticsOverview = async (req, res) => {
  try {
    const now = new Date();
    const days = Math.max(parseInt(req.query.days, 10) || 7, 1);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    // Top pages (pageview)
    const topPages = await AnalyticsEvent.aggregate([
      { $match: { event: 'pageview', createdAt: { $gte: from } } },
      { $group: { _id: '$path', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Top events (hors pageview)
    const topEvents = await AnalyticsEvent.aggregate([
      { $match: { event: { $ne: 'pageview' }, createdAt: { $gte: from } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Série temporelle par jour sur X jours (tous événements)
    const series = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
            d: { $dayOfMonth: '$createdAt' }
          },
          total: { $sum: 1 },
          pageviews: { $sum: { $cond: [{ $eq: ['$event', 'pageview'] }, 1, 0] } }
        }
      },
      { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
    ]);

    // Nombre de paiements échoués sur la période
    const [failedRes] = await AnalyticsEvent.aggregate([
      { $match: { event: 'payment_failed', createdAt: { $gte: from } } },
      { $count: 'count' }
    ]);
    const failedPayments = failedRes ? failedRes.count : 0;

    return res.status(200).json({
      from,
      to: now,
      days,
      topPages: topPages.map(r => ({ path: r._id || '—', count: r.count })),
      topEvents: topEvents.map(r => ({ event: r._id || '—', count: r.count })),
      series: series.map(r => ({
        date: new Date(r._id.y, (r._id.m || 1) - 1, r._id.d),
        total: r.total,
        pageviews: r.pageviews
      })),
      failedPayments
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.analyticsInsights = async (req, res) => {
  try {
    const now = new Date();
    const days = Math.max(parseInt(req.query.days, 10) || 7, 1);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    // Visiteurs uniques (anonId) sur la période (basé sur pageview)
    const [uniqueVisitorsRes] = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview', anonId: { $ne: null } } },
      { $group: { _id: '$anonId' } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const uniqueVisitors = uniqueVisitorsRes ? uniqueVisitorsRes.count : 0;

    // Visiteurs connectés uniques (userId non nul)
    const [loggedVisitorsRes] = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview', userId: { $ne: null } } },
      { $group: { _id: '$userId' } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const uniqueLoggedVisitors = loggedVisitorsRes ? loggedVisitorsRes.count : 0;

    // Sessions (distinct sessionId) sur la période (basé sur pageview)
    const [sessionsRes] = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview', sessionId: { $ne: null } } },
      { $group: { _id: '$sessionId' } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const sessions = sessionsRes ? sessionsRes.count : 0;

    // Pageviews par session et bounce rate (1 seule page vue)
    const pageviewsBySession = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview', sessionId: { $ne: null } } },
      { $group: { _id: '$sessionId', pv: { $sum: 1 } } }
    ]);
    const bounces = pageviewsBySession.filter(s => (s.pv || 0) <= 1).length;
    const avgPagesPerSession = pageviewsBySession.length > 0
      ? pageviewsBySession.reduce((sum, s) => sum + (s.pv || 0), 0) / pageviewsBySession.length
      : 0;

    // Événements par session (tous events)
    const eventsBySession = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, sessionId: { $ne: null } } },
      { $group: { _id: '$sessionId', ev: { $sum: 1 }, firstAt: { $min: '$createdAt' }, lastAt: { $max: '$createdAt' } } }
    ]);
    const avgEventsPerSession = eventsBySession.length > 0
      ? eventsBySession.reduce((sum, s) => sum + (s.ev || 0), 0) / eventsBySession.length
      : 0;

    // Durée moyenne de session (approx: last - first, en secondes, bornée à 30min)
    const avgSessionDurationSec = (() => {
      if (eventsBySession.length === 0) return 0;
      const maxMs = 30 * 60 * 1000; // 30 minutes
      const total = eventsBySession.reduce((sum, s) => {
        const dur = Math.max(0, Math.min(maxMs, (new Date(s.lastAt) - new Date(s.firstAt))));
        return sum + dur;
      }, 0);
      return Math.round(total / eventsBySession.length / 1000);
    })();

    // Répartition mobile/desktop (par visiteur unique = anonId)
    const deviceAgg = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview', anonId: { $ne: null } } },
      { $group: { _id: '$anonId', widthMax: { $max: '$screen.width' }, userAgentSample: { $first: '$userAgent' } } },
      { $project: {
          widthMax: 1,
          isMobileUA: { $regexMatch: { input: { $ifNull: ['$userAgentSample', ''] }, regex: /(Mobile|Android|iPhone|iPod|iPad)/i } }
        }
      },
      { $project: {
          device: {
            $cond: [
              { $or: [ '$isMobileUA', { $lt: [ '$widthMax', 768 ] } ] },
              'mobile',
              'desktop'
            ]
          }
        }
      },
      { $group: { _id: '$device', count: { $sum: 1 } } }
    ]);
    let mobileVisitorsCount = 0;
    let desktopVisitorsCount = 0;
    for (const row of deviceAgg) {
      if (row._id === 'mobile') mobileVisitorsCount = row.count || 0;
      if (row._id === 'desktop') desktopVisitorsCount = row.count || 0;
    }

    // Top référents (basé sur pageview)
    const topReferrersAgg = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: from }, event: 'pageview' } },
      { $group: { _id: { $ifNull: ['$referrer', ''] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);
    const topReferrers = topReferrersAgg.map(r => ({ referrer: r._id && r._id.length ? r._id : 'Direct/None', count: r.count }));

    // Nouveaux vs revenants (basé sur anonId)
    const periodAnonIds = await AnalyticsEvent.distinct('anonId', { createdAt: { $gte: from }, event: 'pageview', anonId: { $ne: null } });
    let newVisitors = 0;
    let returningVisitors = 0;
    if (periodAnonIds.length > 0) {
      const firstSeen = await AnalyticsEvent.aggregate([
        { $match: { anonId: { $in: periodAnonIds } } },
        { $group: { _id: '$anonId', firstSeenAt: { $min: '$createdAt' } } }
      ]);
      for (const row of firstSeen) {
        if (new Date(row.firstSeenAt) >= from) newVisitors += 1; else returningVisitors += 1;
      }
    }

    return res.status(200).json({
      from,
      to: now,
      days,
      visitors: { uniqueVisitors, uniqueLoggedVisitors, newVisitors, returningVisitors },
      sessions: {
        sessions,
        bounces,
        bounceRate: sessions > 0 ? bounces / sessions : 0,
        avgPagesPerSession,
        avgEventsPerSession,
        avgSessionDurationSec
      },
      deviceSplit: { mobile: mobileVisitorsCount, desktop: desktopVisitorsCount },
      topReferrers
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// Funnel conversion principal: vues expert -> cta -> slot -> checkout (authorized) -> payment_succeeded
exports.analyticsFunnel = async (req, res) => {
  try {
    const now = new Date();
    const days = Math.max(parseInt(req.query.days, 10) || 7, 1);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    const AnalyticsEvent = require('../models/analyticsEvent.model');
    const match = { createdAt: { $gte: from } };

    const countByEvent = async (eventName) => {
      const [r] = await AnalyticsEvent.aggregate([
        { $match: Object.assign({}, match, { event: eventName }) },
        { $count: 'count' }
      ]);
      return r ? r.count : 0;
    };

    const expertViewed = await countByEvent('expert_viewed');
    const ctaBook = await countByEvent('cta_book_click');
    const slotSelected = await countByEvent('slot_selected');
    const paymentAuthorized = await countByEvent('payment_authorized');
    const paymentSucceeded = await countByEvent('payment_succeeded');

    // Distinct sessions pour checkout et auth
    // Compte par session Stripe (source de vérité côté back)
    const startedStripe = await AnalyticsEvent.distinct('props.stripeSessionId', {
      createdAt: { $gte: from },
      event: 'checkout_started',
      'props.stripeSessionId': { $ne: null }
    });
    const authStripe = await AnalyticsEvent.distinct('props.stripeSessionId', {
      createdAt: { $gte: from },
      event: 'payment_authorized',
      'props.stripeSessionId': { $ne: null }
    });
    const authSet = new Set(authStripe.map(String));
    let abandonedCheckouts = 0;
    for (const sid of startedStripe) {
      if (!authSet.has(String(sid))) abandonedCheckouts += 1;
    }

    // Taux étape à étape
    const step = (a, b) => (a > 0 ? b / a : 0);

    return res.status(200).json({
      from,
      to: now,
      days,
      counts: {
        expertViewed,
        ctaBook,
        slotSelected,
        paymentAuthorized,
        paymentSucceeded,
        checkoutStartedDistinct: startedStripe.length,
        paymentAuthorizedDistinct: authStripe.length,
        abandonedCheckouts
      },
      rates: {
        view_to_cta: step(expertViewed, ctaBook),
        cta_to_slot: step(ctaBook, slotSelected),
        slot_to_checkout: step(slotSelected, startedStripe.length),
        slot_to_auth: step(slotSelected, paymentAuthorized),
        // Taux de réussite attendu par l'utilisateur: checkouts terminés / checkouts démarrés
        checkout_to_auth: step(startedStripe.length, authStripe.length),
        auth_to_paid: step(paymentAuthorized, paymentSucceeded),
        view_to_paid: step(expertViewed, paymentSucceeded)
      }
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- EXPORT CSV (Admin) ----
exports.analyticsExportCsv = async (req, res) => {
  try {
    const { from, to, event, events, days } = req.query || {};

    let fromDate = null;
    let toDate = null;
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) fromDate = d;
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) toDate = d;
    }
    if (!fromDate && days) {
      const d = new Date();
      const n = Math.max(parseInt(days, 10) || 7, 1);
      d.setDate(d.getDate() - (n - 1));
      d.setHours(0, 0, 0, 0);
      fromDate = d;
    }

    const filters = {};
    if (fromDate || toDate) {
      filters.createdAt = {};
      if (fromDate) filters.createdAt.$gte = fromDate;
      if (toDate) filters.createdAt.$lte = toDate;
    }
    // Filtrage par événements
    let eventsList = null;
    if (typeof events === 'string' && events.trim().length > 0) {
      eventsList = events.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof event === 'string' && event.trim().length > 0) {
      const ev = event.trim();
      if (ev.toLowerCase() === 'payments') {
        eventsList = ['checkout_started', 'payment_authorized', 'payment_succeeded', 'payment_failed'];
      } else {
        filters.event = ev;
      }
    }
    if (Array.isArray(eventsList) && eventsList.length > 0) {
      filters.event = { $in: eventsList };
    }

    const projection = {
      createdAt: 1,
      event: 1,
      userId: 1,
      anonId: 1,
      sessionId: 1,
      path: 1,
      referrer: 1,
      locale: 1,
      userAgent: 1,
      screen: 1,
      ip: 1,
      props: 1,
    };

    const cursor = AnalyticsEvent.find(filters, projection).sort({ createdAt: 1 }).cursor();

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      // Échappe doubles quotes
      const escaped = s.replace(/"/g, '""');
      // Entoure si virgule, guillemet ou retour à la ligne
      if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
      return escaped;
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const startStr = fromDate ? fromDate.toISOString().slice(0, 10) : 'all';
    const endStr = toDate ? toDate.toISOString().slice(0, 10) : 'now';
    const evLabel = Array.isArray(eventsList) && eventsList.length > 0
      ? eventsList.join('-')
      : (typeof event === 'string' && event.trim().length > 0 ? event.trim() : 'all');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${evLabel}-${startStr}-${endStr}.csv"`);

    // En-tête CSV
    const headers = [
      'timestamp', 'event', 'userId', 'anonId', 'sessionId',
      'path', 'referrer', 'locale', 'userAgent', 'screen.width', 'screen.height', 'screen.dpr', 'ip', 'props'
    ];
    res.write(headers.join(',') + '\n');

    for await (const doc of cursor) {
      const sw = doc?.screen?.width ?? '';
      const sh = doc?.screen?.height ?? '';
      const sdpr = doc?.screen?.dpr ?? '';
      let propsStr = '';
      try { propsStr = JSON.stringify(doc?.props || {}); } catch (_) { propsStr = '{}'; }
      const row = [
        escapeCsv(doc?.createdAt?.toISOString?.() || ''),
        escapeCsv(doc?.event || ''),
        escapeCsv(doc?.userId || ''),
        escapeCsv(doc?.anonId || ''),
        escapeCsv(doc?.sessionId || ''),
        escapeCsv(doc?.path || ''),
        escapeCsv(doc?.referrer || ''),
        escapeCsv(doc?.locale || ''),
        escapeCsv(doc?.userAgent || ''),
        escapeCsv(sw),
        escapeCsv(sh),
        escapeCsv(sdpr),
        escapeCsv(doc?.ip || ''),
        escapeCsv(propsStr)
      ];
      res.write(row.join(',') + '\n');
    }

    return res.end();
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- EXITS (Admin) ----
// Calcule les pages de sortie par session à partir du DERNIER pageview par session.
// Ne dépend pas des événements 'page_exit' (souvent manquants selon le navigateur),
// mais dérive robustement la dernière page visitée via l'ordre des 'pageview'.
exports.analyticsExits = async (req, res) => {
  try {
    const now = new Date();
    const days = Math.max(parseInt(req.query.days, 10) || 7, 1);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    // Pipeline de base: dernier pageview par session (sessionId non nul) dans la période
    const basePipeline = [
      { $match: { event: 'pageview', createdAt: { $gte: from }, sessionId: { $ne: null } } },
      { $sort: { sessionId: 1, createdAt: 1 } },
      {
        $group: {
          _id: '$sessionId',
          lastAt: { $last: '$createdAt' },
          lastPath: { $last: '$path' },
          lastReferrer: { $last: { $ifNull: ['$referrer', ''] } }
        }
      }
    ];

    // Top pages de sortie (dernière page par session)
    const topExitPages = await AnalyticsEvent.aggregate([
      ...basePipeline,
      { $group: { _id: '$lastPath', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    // Distribution horaire (0..23) des dernières pages
    const exitHours = await AnalyticsEvent.aggregate([
      ...basePipeline,
      { $group: { _id: { h: { $hour: '$lastAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.h': 1 } }
    ]);

    // Dernière page par referrer (selon le dernier pageview)
    const byReferrer = await AnalyticsEvent.aggregate([
      ...basePipeline,
      { $group: { _id: { path: '$lastPath', referrer: '$lastReferrer' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 }
    ]);

    return res.status(200).json({
      from,
      to: now,
      days,
      topExitPages: topExitPages.map(r => ({ path: r._id || '—', count: r.count })),
      exitHours: exitHours.map(r => ({ hour: r._id?.h ?? 0, count: r.count })),
      byReferrer: byReferrer.map(r => ({ path: r._id?.path || '—', referrer: r._id?.referrer || '', count: r.count }))
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// PURGE ANALYTICS (Admin)
// DELETE /api/admin/analytics?confirm=YES[&from=YYYY-MM-DD&to=YYYY-MM-DD]
exports.analyticsPurge = async (req, res) => {
  try {
    const { confirm, from, to } = req.query || {};
    if (confirm !== 'YES') {
      return res.status(400).json({
        message: "Confirmez la suppression définitive avec ?confirm=YES",
        hint: "Optionnel: borne temporelle ?from=YYYY-MM-DD&to=YYYY-MM-DD"
      });
    }
    const filter = {};
    const dateFilter = {};
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) dateFilter.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) dateFilter.$lte = d;
    }
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

    const result = await require('../models/analyticsEvent.model').deleteMany(filter);
    return res.status(200).json({ ok: true, deleted: result?.deletedCount || 0 });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

// ---- EXPERTS (Admin) ----
exports.listExperts = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const total = await Expert.countDocuments({});
    const experts = await Expert.find({})
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items: experts, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.getExpertById = async (req, res) => {
  try {
    const { id } = req.params;
    const expert = await Expert.findById(id)
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties');
    if (!expert) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ item: expert });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.updateExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'firstName', 'email', 'description', 'francais', 'anglais', 'roumain', 'allemand', 'italien', 'espagnol',
      'delayTime', 'isValidate', 'siret', 'avatard', 'photoUrl', 'photoPublicId',
      // Mise à jour partielle d'adresse
      'adressrdv',
    ];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        update[k] = req.body[k];
      }
    }
    if (typeof update.email === 'string') {
      update.email = update.email.trim().toLowerCase();
    }
    // Normalisation adresse si fournie
    if (Object.prototype.hasOwnProperty.call(update, 'adressrdv')) {
      const val = update.adressrdv;
      if (val && typeof val === 'string') {
        const parts = val.split(',').map(s => s.trim());
        update.adressrdv = { addressLine: parts[0] || val, postalCode: parts[1] || '', city: parts[2] || '' };
      } else if (val && typeof val === 'object') {
        update.adressrdv = {
          addressLine: (val.addressLine || '').trim(),
          postalCode: (val.postalCode || '').trim(),
          city: (val.city || '').trim()
        };
      } else {
        update.adressrdv = { addressLine: '', postalCode: '', city: '' };
      }
    }

    const expert = await Expert.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: 'query' })
      .select({ password: 0 })
      .populate('specialties.specialty')
      .populate('specialties.subSpecialties');
    if (!expert) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ item: expert });
  } catch (e) {
    if (e && e.code === 11000 && e.keyPattern && e.keyPattern.email) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

exports.deleteExpert = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Expert.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Expert introuvable' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};


// ---- RDV (Admin) ----
exports.listAppointments = async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const parsedLimit = parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.paid === 'true') filters.paid = true;
    if (req.query.paid === 'false') filters.paid = false;
    if (req.query.cancel === 'true') filters.cancel = true;
    if (req.query.cancel === 'false') filters.cancel = false;

    // Optionnel: filtrage par date ISO (YYYY-MM-DD)
    const { from, to } = req.query;
    if (from || to) {
      filters.date = {};
      if (from) filters.date.$gte = new Date(from);
      if (to) filters.date.$lte = new Date(to);
    }

    const total = await BookedSlot.countDocuments(filters);
    const items = await BookedSlot.find(filters)
      .populate({ path: 'expert', model: 'Expert', select: 'firstName email' })
      .populate({ path: 'client', model: 'User', select: 'firstName lastName email' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ items, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
};

