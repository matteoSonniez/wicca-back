const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// POST /api/jaas/token
// Body: { room: string, user: { id, name, avatar, email }, moderator?: boolean, expiresInSec?: number }
router.post('/token', (req, res) => {
  try {
    const { room, user = {}, moderator = false, expiresInSec = 60 * 60 } = req.body || {};
    if (!room) return res.status(400).json({ message: 'room requis' });

    const appId = process.env.JAAS_APP_ID; // e.g. vpaas-magic-cookie-xxxx
    const kid = process.env.JAAS_KID;      // key id from JaaS key pair
    const pkRaw = process.env.JAAS_PRIVATE_KEY || '';
    // Supporte les deux formats: "\n" (un backslash) ou "\\n" (deux backslashes)
    const privateKey = pkRaw.includes('\\n')
      ? pkRaw.replace(/\\\\n/g, '\n') // transforme \\n en vrais retours
      : pkRaw.replace(/\n/g, '\n');      // transforme \n en vrais retours

    if (!appId || !kid || !privateKey) {
      return res.status(500).json({ message: 'Configuration JaaS manquante' });
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room,
      exp: now + expiresInSec,
      nbf: now - 10,
      context: {
        user: {
          id: user.id || undefined,
          name: user.name || 'Invité',
          avatar: user.avatar || undefined,
          email: user.email || undefined,
        },
        features: {
          recording: moderator ? 'cloud' : 'disabled',
          livestreaming: moderator ? 'true' : 'false',
          transcription: 'false',
        },
        moderator: moderator ? 'true' : 'false',
      },
    };

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: { kid },
    });

    res.json({ token, tenant: appId });
  } catch (err) {
    console.error('JaaS token error', err);
    res.status(500).json({ message: 'Erreur génération token' });
  }
});

module.exports = router;


