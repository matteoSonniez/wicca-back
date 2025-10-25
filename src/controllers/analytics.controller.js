const AnalyticsEvent = require('../models/analyticsEvent.model');

// POST /analytics/events
exports.ingestEvent = async (req, res) => {
  try {
    const {
      event,
      anonId,
      sessionId,
      userId,
      path,
      referrer,
      userAgent,
      locale,
      screen,
      props
    } = req.body || {};

    if (!event || typeof event !== 'string') {
      return res.status(400).json({ message: 'event requis' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '').toString();

    const doc = await AnalyticsEvent.create({
      event,
      anonId: anonId || null,
      sessionId: sessionId || null,
      userId: userId || null,
      path: path || req.headers['x-path'] || null,
      referrer: referrer || req.headers['referer'] || req.headers['referrer'] || null,
      userAgent: userAgent || req.headers['user-agent'] || null,
      ip,
      locale: locale || req.headers['accept-language'] || null,
      screen: screen || undefined,
      props: props || {}
    });

    return res.status(201).json({ ok: true, id: doc._id });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur serveur', error: e?.message });
  }
};


