const OVH = require('ovh');

let cachedClient = null;

function buildClient() {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.OVH_ENDPOINT || 'ovh-eu';
  const appKey = process.env.OVH_APP_KEY;
  const appSecret = process.env.OVH_APP_SECRET;
  const consumerKey = process.env.OVH_CONSUMER_KEY;

  if (!appKey || !appSecret || !consumerKey) {
    throw new Error('Configuration OVH manquante. Définissez OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY');
  }
  console.log('[SMS] Init OVH client', { endpoint, hasAppKey: !!appKey, hasAppSecret: !!appSecret, hasConsumerKey: !!consumerKey });
  const client = OVH({ endpoint, appKey, appSecret, consumerKey });
  cachedClient = client;
  return client;
}

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let s = raw.replace(/[^0-9+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s;
  const cc = String(process.env.DEFAULT_COUNTRY || 'FR').toUpperCase();
  if (cc === 'FR' && s.startsWith('0')) {
    return '+33' + s.slice(1);
  }
  // Fallback: renvoyer tel tel quel (peut échouer côté OVH si non E.164)
  return s;
}

function ovhRequest(method, path, data) {
  const client = buildClient();
  return new Promise((resolve, reject) => {
    console.log('[SMS] OVH request', method, path, { payload: data });
    client.request(method, path, data, (err, result) => {
      if (err) {
        console.warn('[SMS] OVH error', err?.message || err);
      } else {
        console.log('[SMS] OVH response', result);
      }
      if (err) return reject(err);
      return resolve(result);
    });
  });
}

async function sendSms({ to, message, sender, noStopClause = true, tag }) {
  const enabled = String(process.env.OVH_SMS_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.warn('[SMS] Envoi désactivé par OVH_SMS_ENABLED');
    return { disabled: true };
  }

  const serviceName = process.env.OVH_SMS_SERVICE_NAME;
  if (!serviceName) {
    throw new Error('OVH_SMS_SERVICE_NAME manquant. Renseignez votre service SMS (ex: sms-XXXXXX)');
  }

  const receivers = Array.isArray(to) ? to.map(normalizePhone).filter(Boolean) : [normalizePhone(to)].filter(Boolean);
  console.log('[SMS] Prepared receivers', receivers);
  if (receivers.length === 0) {
    throw new Error('Aucun numéro de destinataire valide pour le SMS.');
  }
  const payload = {
    message: String(message || '').slice(0, 1600),
    receivers,
    noStopClause: Boolean(noStopClause),
  };
  const effectiveSender = sender || process.env.OVH_SMS_SENDER;
  if (effectiveSender) payload.sender = effectiveSender;
  if (tag) payload.tag = String(tag);

  console.log('[SMS] Sending', { serviceName, sender: effectiveSender, tag, length: payload.message.length });
  // POST /sms/{serviceName}/jobs
  return ovhRequest('POST', `/sms/${serviceName}/jobs`, payload);
}

module.exports = { sendSms, normalizePhone };


