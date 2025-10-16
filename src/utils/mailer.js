const nodemailer = require('nodemailer');

let cachedTransporter = null;

function buildTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('SMTP configuration manquante. Définissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM');
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || 'false') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  cachedTransporter = transporter;
  return transporter;
}

async function sendEmail({ to, subject, text, html, from, attachments }) {
  const transporter = buildTransporter();
  const mailFrom = from || process.env.SMTP_FROM;
  return transporter.sendMail({ from: mailFrom, to, subject, text, html, attachments });
}

async function sendWelcomeEmail({ to, firstName }) {
  const subject = 'Bienvenue chez Wicca';
  const safeFirst = firstName ? firstName : 'cher utilisateur';
  const text = `\n\nObject : Bienvenue chez Wicca\n\nBonjour ${safeFirst}\n\nBienvenue sur La première plateforme qui réunit des praticiens vérifiés dans toutes les disciplines de la guidance spirituelle : tarot, astrologie, magnétisme, numérologie, énergétique — dans un cadre clair, transparent et moderne.\n\nPourquoi Wicca a été créée\nWicca est née d’un constat simple :\nDans un monde ultra-connecté, trop de personnes continuent de chercher des réponses dans le flou, au hasard, sans savoir vers qui se tourner.\n\nNous avons créé Wicca pour répondre à un besoin simple mais essentiel : rendre la guidance spirituelle plus accessible, moderne et fiable.\nNotre mission est de rassembler, en un seul endroit, des praticiens vérifiés et passionnés, afin que chacun puisse trouver un accompagnement authentique et avancer avec confiance.\n\nWicca, c’est la spiritualité réinventée : belle, accessible, ancrée.\nIci, des rencontres, des intuitions, des éclairages précieux pour avancer.\n\nCe que vous pouvez faire dès maintenant :\n- Explorer les profils de nos experts (tarot, astrologie, numérologie, magnétisme, etc.).\n- Réserver votre première séance, en visio ou en présentiel.\n- Sauvegarder vos praticiens favoris dans votre espace personnel.\n\nVos rendez-vous sont clairs et sans surprise : pas de facturation à la minute, chaque séance est annoncée à l’avance avec un tarif fixe.\n\nEt si vous avez la moindre question, notre équipe est là pour vous :\n📩 contact@wicca.app\n\nQue cette plateforme soit un lieu de découverte, d’alignement… et de magie.\n\nÀ très bientôt,\nL’équipe Wicca`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Bienvenue chez <span style="color:#e91e63">Wicca</span></h2>
      <p style="margin:0 0 16px">Bonjour ${safeFirst},</p>
      <p style="margin:0 0 12px">Bienvenue dans l’univers de Wicca.</p>
      <p style="margin:0 0 12px">La première plateforme réunit des praticiens vérifiés dans toutes les disciplines de la guidance spirituelle : <strong>tarot</strong>, <strong>astrologie</strong>, <strong>magnétisme</strong>, <strong>numérologie</strong>, <strong>énergétique</strong> — dans un cadre clair, transparent et moderne.</p>

      <h3 style="margin:20px 0 8px;font-size:16px">Pourquoi Wicca a été créée</h3>
      <p style="margin:0 0 12px">Wicca est née d’un constat simple :</p>
      <p style="margin:0 0 12px">Dans un monde ultra-connecté, trop de personnes continuent de chercher des réponses dans le flou, au hasard, sans savoir vers qui se tourner.</p>
      <p style="margin:0 0 12px">Nous avons créé Wicca pour répondre à un besoin simple mais essentiel : rendre la guidance spirituelle plus accessible, moderne et fiable. Notre mission est de rassembler, en un seul endroit, des praticiens vérifiés et passionnés, afin que chacun puisse trouver un accompagnement authentique et avancer avec confiance.</p>

      <p style="margin:12px 0">Wicca, c’est la spiritualité réinventée : <strong>belle</strong>, <strong>accessible</strong>, <strong>ancrée</strong>.<br/>Ici, des rencontres, des intuitions, des éclairages précieux pour avancer.</p>

      <h3 style="margin:20px 0 8px;font-size:16px">Ce que vous pouvez faire dès maintenant :</h3>
      <ul style="margin:0 0 12px 20px;padding:0">
        <li>Explorer les profils de nos experts (tarot, astrologie, numérologie, magnétisme, etc.).</li>
        <li>Réserver votre première séance, en visio ou en présentiel.</li>
        <li>Sauvegarder vos praticiens favoris dans votre espace personnel.</li>
      </ul>

      <p style="margin:12px 0">Vos rendez-vous sont clairs et sans surprise : pas de facturation à la minute, chaque séance est annoncée à l’avance avec un tarif fixe.</p>

      <p style="margin:16px 0">Et si vous avez la moindre question, notre équipe est là pour vous :<br/>
      <strong>📩 contact@wicca.fr</strong></p>

      <p style="margin:20px 0">Que cette plateforme soit un lieu de découverte, d’alignement… et de magie.</p>

      <p style="margin:24px 0 0">À très bientôt,<br/>L’équipe Wicca</p>
    </div>
  `;
  return sendEmail({ to, subject, text, html });
}

async function sendExpertWelcomeEmail({ to, firstName }) {
  const subject = 'Bienvenue sur Wicca – votre inscription est confirmée';
  const safeFirst = firstName ? firstName : 'cher expert';
  const baseUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://wicca.fr').replace(/\/$/, '');
  const dashboardUrl = `${baseUrl}/dashboard`;
  const text = [
    'Objet : Bienvenue sur Wicca – votre inscription est confirmée',
    '',
    `Bonjour ${safeFirst},`,
    '',
    'Nous sommes ravis de vous accueillir parmi les experts de Wicca, la première plateforme pensée main dans la main avec les praticiens des arts divinatoires.',
    '',
    'Votre inscription a bien été prise en compte ✅',
    'Vous pouvez dès à présent accéder à votre espace professionnel pour compléter votre profil et mettre en avant vos spécialités.',
    '',
    `Espace pro : ${dashboardUrl}`,
    '',
    'Quelques conseils pour bien démarrer :',
    '• Soignez votre profil : ajoutez une photo récente, professionnelle, avec un fond clair et agréable – elle donne envie à vos futurs clients de réserver avec vous.',
    '• Relisez vos textes : nous vous conseillons d’utiliser des outils de correction orthographique afin de présenter un profil clair et sans fautes.',
    '• Indiquez vos disponibilités pour permettre des réservations simples et rapides.',
    '• Spécialités manquantes ? Si une pratique que vous proposez n’apparaît pas dans la liste, écrivez-nous à contact@wicca.fr pour que nous puissions l’ajouter.',
    '• Charte qualité : prenez quelques minutes pour relire nos engagements, ils sont gages de confiance et de sérieux pour vos futurs consultants.',
    '',
    'Notre équipe est disponible pour vous accompagner à chaque étape.',
    '📩 Pour toute question : contact@wicca.fr',
    '',
    'Encore bienvenue dans la communauté Wicca ✨',
    'Nous avons hâte de voir votre expertise briller auprès de nos utilisateurs.',
    '',
    'À très bientôt,',
    'L’équipe Wicca'
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Bienvenue sur <span style="color:#e91e63">Wicca</span> – votre inscription est confirmée</h2>
      <p style="margin:0 0 12px">Bonjour ${safeFirst},</p>
      <p style="margin:0 0 12px">Nous sommes ravis de vous accueillir parmi les experts de Wicca, la première plateforme pensée main dans la main avec les praticiens des arts divinatoires.</p>
      <p style="margin:0 0 12px">Votre inscription a bien été prise en compte ✅<br/>Vous pouvez dès à présent accéder à votre espace professionnel pour compléter votre profil et mettre en avant vos spécialités.</p>
      <div style="margin:16px 0 20px">
        <a href="${dashboardUrl}" target="_blank" rel="noopener"
           style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600">
          Accéder à votre tableau de bord
        </a>
      </div>
      <h3 style="margin:20px 0 8px;font-size:16px">Quelques conseils pour bien démarrer :</h3>
      <ul style="margin:0 0 12px 20px;padding:0">
        <li>Soignez votre profil : ajoutez une photo récente, professionnelle, avec un fond clair et agréable – elle donne envie à vos futurs clients de réserver avec vous.</li>
        <li>Relisez vos textes : nous vous conseillons d’utiliser des outils de correction orthographique afin de présenter un profil clair et sans fautes.</li>
        <li>Indiquez vos disponibilités pour permettre des réservations simples et rapides.</li>
        <li>Spécialités manquantes ? Si une pratique que vous proposez n’apparaît pas dans la liste, écrivez-nous à <strong>contact@wicca.fr</strong> pour que nous puissions l’ajouter.</li>
        <li>Charte qualité : prenez quelques minutes pour relire nos engagements, ils sont gages de confiance et de sérieux pour vos futurs consultants.</li>
      </ul>
      <p style="margin:12px 0">Notre équipe est disponible pour vous accompagner à chaque étape.<br/>
      <strong>📩 Pour toute question : contact@wicca.fr</strong></p>
      <p style="margin:12px 0">Encore bienvenue dans la communauté Wicca ✨<br/>
      Nous avons hâte de voir votre expertise briller auprès de nos utilisateurs.</p>
      <p style="margin:20px 0">À très bientôt,<br/>L’équipe Wicca</p>
    </div>
  `;
  return sendEmail({ to, subject, text, html });
}

module.exports = { sendEmail, sendWelcomeEmail, sendExpertWelcomeEmail };

// Email de code de vérification d'inscription
module.exports.sendVerificationCodeEmail = async function({ to, firstName, role, code }) {
  const subject = 'Votre code de vérification Wicca';
  const safeFirst = firstName ? firstName : '';
  const text = [
    'Objet : Votre code de vérification Wicca',
    '',
    safeFirst ? `Bonjour ${safeFirst},` : 'Bonjour,',
    '',
    `Voici votre code de vérification : ${code}`,
    'Il est valable pendant 15 minutes.',
    '',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.',
    '',
    'À très bientôt,',
    'L’équipe Wicca'
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Code de vérification</h2>
      <p>${safeFirst ? `Bonjour ${safeFirst},` : 'Bonjour,'}</p>
      <p>Voici votre code de vérification ${role === 'expert' ? 'pour finaliser votre inscription en tant qu’expert' : 'pour finaliser votre inscription'} :</p>
      <div style="margin:14px 0 18px">
        <div style="display:inline-block;background:#111;color:#fff;padding:12px 16px;border-radius:10px;font-weight:700;letter-spacing:2px;font-size:18px">${code}</div>
      </div>
      <p>Ce code est valable pendant <strong>15 minutes</strong>.</p>
      <p style="margin:16px 0 0;color:#555;font-size:13px">Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet email.</p>
      <p style="margin:20px 0">À très bientôt,<br/>L’équipe Wicca</p>
    </div>
  `;
  return sendEmail({ to, subject, text, html });
}

// Envoie l'email de confirmation de RDV (visio/présentiel)
// Params: { to, clientFirstName, expertName, dateStr, heureStr, visio, jaasLink }
module.exports.sendAppointmentConfirmationEmail = async function({ to, clientFirstName, expertName, dateStr, heureStr, visio, jaasLink }) {
  const subject = 'Votre rendez-vous Wicca est confirmé';
  const safeFirst = clientFirstName || '';
  const link = visio ? (jaasLink || '') : '';
  const baseUrl = (process.env.APP_BASE_URL || process.env.FRONT_BASE_URL || 'https://wicca.fr').replace(/\/$/, '');
  const manageUrl = `${baseUrl}/rdv`;

  // Helpers calendrier
  function parseDateAndTime(dateString, timeString) {
    try {
      if (!dateString || !timeString) return null;
      let y, m, d;
      let m1 = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
      if (m1) {
        y = Number(m1[1]); m = Number(m1[2]); d = Number(m1[3]);
      } else {
        let m2 = dateString.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/); // DD/MM/YYYY ou DD-MM-YYYY
        if (!m2) return null;
        d = Number(m2[1]); m = Number(m2[2]); y = Number(m2[3]);
      }
      // Heure: "HH:mm" ou "HH:mm - HH:mm"
      const t = timeString.replace(/\s+/g, '');
      let startH = 9, startMin = 0, endH = null, endMin = null;
      let tt = t.match(/^(\d{1,2}):(\d{2})(?:[-–](\d{1,2}):(\d{2}))?$/);
      if (tt) {
        startH = Number(tt[1]); startMin = Number(tt[2]);
        if (tt[3] && tt[4]) { endH = Number(tt[3]); endMin = Number(tt[4]); }
      }
      const start = new Date(y, (m - 1), d, startH, startMin, 0);
      let end;
      if (endH != null) {
        end = new Date(y, (m - 1), d, endH, endMin, 0);
      } else {
        end = new Date(start.getTime() + 60 * 60 * 1000); // défaut 60 min
      }
      return { start, end };
    } catch (_) {
      return null;
    }
  }

  function formatICSDate(dt) {
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const y = dt.getFullYear();
    const m = pad(dt.getMonth() + 1);
    const d = pad(dt.getDate());
    const hh = pad(dt.getHours());
    const mm = pad(dt.getMinutes());
    const ss = pad(dt.getSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}`; // heure locale (flottante)
  }

  function buildICS({ start, end, summary, description, location, url }) {
    const uid = `wicca-${Date.now()}-${Math.random().toString(16).slice(2)}@wicca`;
    const dtstamp = formatICSDate(new Date());
    const dtstart = formatICSDate(start);
    const dtend = formatICSDate(end);
    const desc = (description || '').replace(/\n/g, '\\n');
    const loc = (location || '').replace(/\n/g, '\\n');
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-\//Wicca\//Calendar\//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary || ''}`,
      `DESCRIPTION:${desc}${url ? `\\n\\n${url}` : ''}`,
      loc ? `LOCATION:${loc}` : null,
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean);
    return icsLines.join('\r\n');
  }

  const adviceTitle = visio
    ? 'Quelques conseils pour vivre une belle expérience en visio :'
    : 'Quelques conseils pour vivre une belle expérience en présentiel avec Wicca :';

  const adviceText = visio
    ? [
        'Installez-vous dans un endroit calme et confortable, où vous pourrez vous concentrer sereinement',
        'Vérifiez votre connexion internet ainsi que le bon fonctionnement de votre micro et/ou caméra',
        'N’hésitez pas à vous connecter quelques minutes en avance pour vous poser',
        'Sachez que vous n’êtes pas obligé(e) d’activer votre caméra. Votre confort émotionnel passe avant tout. Vous pouvez choisir de garder votre caméra éteinte si cela vous aide à être plus à l’aise.'
      ]
    : [
        'Prévoyez d’arriver quelques minutes en avance afin de commencer la séance sereinement.',
        'Choisissez une tenue dans laquelle vous vous sentez à l’aise et détendu(e).',
        'Le lieu de rendez-vous est celui indiqué lors de votre réservation (vous le retrouverez également dans votre mail de confirmation).',
        'Si vous ne trouvez pas facilement l’adresse, n’hésitez pas à contacter directement l’expert pour être guidé(e).',
        'Votre confort émotionnel est essentiel : sentez-vous libre de partager vos attentes ou limites dès le début de la séance.',
        'Prenez un instant pour vous recentrer avant d’entrer : respirez profondément et ouvrez-vous à l’expérience, sans attente particulière, simplement avec curiosité et confiance.'
      ];

  const parsed = parseDateAndTime(dateStr, heureStr);
  const summary = `Rendez-vous Wicca avec ${expertName}`;
  const description = visio ? `Séance en visio. Lien: ${link}` : 'Séance en présentiel.';
  const location = visio ? 'En ligne' : 'Présentiel';
  const googleUrl = parsed
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${formatICSDate(parsed.start)}/${formatICSDate(parsed.end)}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`
    : null;
  const icsContent = parsed ? buildICS({ start: parsed.start, end: parsed.end, summary, description, location, url: manageUrl }) : null;

  const text = [
    'Objet :  Votre rendez-vous Wicca est confirmé',
    '',
    `Bonjour ${safeFirst || '(Prénom)'},`,
    '',
    'Votre rendez-vous est désormais confirmé.',
    'Merci pour votre confiance.',
    '',
    `Date & heure : ${dateStr} ${heureStr}`,
    `Avec : ${expertName}`,
    `Format : ${visio ? 'Séance en visio' : 'Séance en présentiel'}`,
    visio ? `Lien d’accès : ${link}` : null,
    parsed ? `Ajouter au calendrier (Google) : ${googleUrl}` : null,
    parsed ? 'Un fichier .ics est joint pour l’ajouter à tout autre calendrier.' : null,
    `Gérer votre rendez-vous (annuler ou déplacer) : ${manageUrl}`,
    '',
    adviceTitle,
    ...adviceText.map(l => `• ${l}`),
    '',
    visio
      ? 'Et si vous avez la moindre question, ou le moindre souci technique :'
      : 'Et si vous avez la moindre question ou difficulté avant votre venue :',
    '📩 contact@wicca.fr',
    '',
    'À très bientôt,',
    'L’équipe Wicca'
  ].filter(Boolean).join('\n');

  const adviceListHtml = adviceText.map(l => `<li>${l}</li>`).join('');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Votre rendez-vous Wicca est confirmé</h2>
      <p>Bonjour ${safeFirst || '(Prénom)'},</p>
      <p>Votre rendez-vous est désormais confirmé.<br/>Merci pour votre confiance.</p>
      <p><strong>Date & heure :</strong> ${dateStr} ${heureStr}<br/>
      <strong>Avec :</strong> ${expertName}<br/>
      <strong>Format :</strong> ${visio ? 'Séance en visio' : 'Séance en présentiel'}<br/>
      ${visio ? `<strong>Lien d’accès :</strong> <a href="${link}" target="_blank" rel="noopener">Accéder à la visioconférence</a>` : ''}
      </p>
      ${parsed ? `<div style="margin:6px 0 18px">
        <a href="${googleUrl}" target="_blank" rel="noopener"
           style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;margin-right:8px">
          Ajouter à Google Calendar
        </a>
        <span style="display:inline-block;color:#555;vertical-align:middle">Ou utilisez le fichier <strong>.ics</strong> joint.</span>
      </div>` : ''}
      <div style="margin:18px 0 22px">
        <a href="${manageUrl}" target="_blank" rel="noopener"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600">
          Annuler ou déplacer le rendez-vous
        </a>
      </div>
      <h3 style="margin:20px 0 8px;font-size:16px">${adviceTitle}</h3>
      <ul style="margin:0 0 12px 20px;padding:0">${adviceListHtml}</ul>
      <p>${visio ? 'Et si vous avez la moindre question, ou le moindre souci technique :' : 'Et si vous avez la moindre question ou difficulté avant votre venue :' }<br/>
      <strong>📩 contact@wicca.fr</strong></p>
      <p style="margin:20px 0">À très bientôt,<br/>L’équipe Wicca</p>
    </div>
  `;
  const attachments = icsContent ? [{ filename: 'wicca-rdv.ics', content: icsContent, contentType: 'text/calendar; charset=utf-8' }] : undefined;
  return sendEmail({ to, subject, text, html, attachments });
}


// Email de notification à l'expert lors d'une nouvelle réservation
// Params: { to, expertFirstName, clientName, dateStr, heureStr, visio, jaasLink }
module.exports.sendExpertAppointmentNotificationEmail = async function({ to, expertFirstName, clientName, dateStr, heureStr, visio, jaasLink }) {
  const subject = 'Nouveau rendez-vous Wicca';
  const safeFirst = expertFirstName || '';
  const link = visio ? (jaasLink || '') : '';
  const baseUrl = (process.env.APP_BASE_URL || process.env.FRONT_BASE_URL || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://wicca.fr').replace(/\/$/, '');
  const dashboardRdvUrl = `${baseUrl}/dashboard/rdv`;
  
  // Helpers calendrier (copiés de l'email client)
  function parseDateAndTime(dateString, timeString) {
    try {
      if (!dateString || !timeString) return null;
      let y, m, d;
      let m1 = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
      if (m1) {
        y = Number(m1[1]); m = Number(m1[2]); d = Number(m1[3]);
      } else {
        let m2 = dateString.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/); // DD/MM/YYYY ou DD-MM-YYYY
        if (!m2) return null;
        d = Number(m2[1]); m = Number(m2[2]); y = Number(m2[3]);
      }
      // Heure: "HH:mm" ou "HH:mm - HH:mm"
      const t = timeString.replace(/\s+/g, '');
      let startH = 9, startMin = 0, endH = null, endMin = null;
      let tt = t.match(/^(\d{1,2}):(\d{2})(?:[-–](\d{1,2}):(\d{2}))?$/);
      if (tt) {
        startH = Number(tt[1]); startMin = Number(tt[2]);
        if (tt[3] && tt[4]) { endH = Number(tt[3]); endMin = Number(tt[4]); }
      }
      const start = new Date(y, (m - 1), d, startH, startMin, 0);
      let end;
      if (endH != null) {
        end = new Date(y, (m - 1), d, endH, endMin, 0);
      } else {
        end = new Date(start.getTime() + 60 * 60 * 1000); // défaut 60 min
      }
      return { start, end };
    } catch (_) {
      return null;
    }
  }

  function formatICSDate(dt) {
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const y = dt.getFullYear();
    const m = pad(dt.getMonth() + 1);
    const d = pad(dt.getDate());
    const hh = pad(dt.getHours());
    const mm = pad(dt.getMinutes());
    const ss = pad(dt.getSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}`; // heure locale (flottante)
  }

  function buildICS({ start, end, summary, description, location, url }) {
    const uid = `wicca-${Date.now()}-${Math.random().toString(16).slice(2)}@wicca`;
    const dtstamp = formatICSDate(new Date());
    const dtstart = formatICSDate(start);
    const dtend = formatICSDate(end);
    const desc = (description || '').replace(/\n/g, '\\n');
    const loc = (location || '').replace(/\n/g, '\\n');
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Wicca//Calendar//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary || ''}`,
      `DESCRIPTION:${desc}${url ? `\\n\\n${url}` : ''}`,
      loc ? `LOCATION:${loc}` : null,
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean);
    return icsLines.join('\r\n');
  }

  const parsed = parseDateAndTime(dateStr, heureStr);
  const summary = `Rendez-vous Wicca avec ${clientName || 'un client'}`;
  const description = visio ? `Séance en visio. Lien: ${link}` : 'Séance en présentiel.';
  const location = visio ? 'En ligne' : 'Présentiel';
  const googleUrl = parsed
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${formatICSDate(parsed.start)}/${formatICSDate(parsed.end)}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`
    : null;
  const icsContent = parsed ? buildICS({ start: parsed.start, end: parsed.end, summary, description, location, url: dashboardRdvUrl }) : null;

  const text = [
    'Objet : Nouveau rendez-vous Wicca',
    '',
    `Bonjour ${safeFirst || '(Prénom)'},`,
    '',
    'Vous avez un nouveau rendez-vous.',
    `Client : ${clientName || ''}`,
    `Date & heure : ${dateStr} ${heureStr}`,
    `Format : ${visio ? 'Séance en visio' : 'Séance en présentiel'}`,
    visio ? `Lien visio (client) : ${link}` : null,
    parsed ? `Ajouter au calendrier (Google) : ${googleUrl}` : null,
    parsed ? 'Un fichier .ics est joint pour l’ajouter à tout autre calendrier.' : null,
    '',
    `Gérer vos rendez-vous : ${dashboardRdvUrl}`,
    '',
    'À très bientôt,',
    'L’équipe Wicca'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Nouveau rendez-vous Wicca</h2>
      <p>Bonjour ${safeFirst || '(Prénom)'},</p>
      <p>Vous avez un nouveau rendez-vous :</p>
      <p>
        <strong>Client :</strong> ${clientName || ''}<br/>
        <strong>Date & heure :</strong> ${dateStr} ${heureStr}<br/>
        <strong>Format :</strong> ${visio ? 'Séance en visio' : 'Séance en présentiel'}
        ${visio && jaasLink ? `<br/><strong>Lien visio (client) :</strong> <a href="${jaasLink}" target="_blank" rel="noopener">Voir la page RDV</a>` : ''}
      </p>
      ${parsed ? `<div style="margin:6px 0 18px">
        <a href="${googleUrl}" target="_blank" rel="noopener"
           style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;margin-right:8px">
          Ajouter à Google Calendar
        </a>
        <span style="display:inline-block;color:#555;vertical-align:middle">Ou utilisez le fichier <strong>.ics</strong> joint.</span>
      </div>` : ''}
      <div style="margin:18px 0 22px">
        <a href="${dashboardRdvUrl}" target="_blank" rel="noopener"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600">
          Accéder à votre tableau de bord
        </a>
      </div>
      <p style="margin:20px 0">À très bientôt,<br/>L’équipe Wicca</p>
    </div>
  `;

  const attachments = icsContent ? [{ filename: 'wicca-rdv.ics', content: icsContent, contentType: 'text/calendar; charset=utf-8' }] : undefined;

  return sendEmail({ to, subject, text, html, attachments });
}

// Email de fin de rendez-vous pour le client avec CTA avis
// Params: { to, clientFirstName, expertName, reviewLink }
module.exports.sendAppointmentEndedEmail = async function({ to, clientFirstName, expertName, reviewLink }) {
  const subject = 'Merci pour votre rendez-vous — laissez un avis';
  const safeFirst = clientFirstName || '';
  const link = (reviewLink || '').replace(/\s+/g, '');

  const text = [
    'Objet : Merci pour votre rendez-vous — laissez un avis',
    '',
    `Bonjour ${safeFirst || '(Prénom)'},`,
    '',
    `Votre rendez-vous avec ${expertName || 'votre expert'} est terminé.`,
    'Votre avis compte pour la communauté. Quelques mots suffisent pour aider les prochains clients.',
    '',
    `Laisser un avis : ${link}`,
    '',
    'Merci pour votre confiance.',
    'L’équipe Wicca'
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.7;color:#111;padding:8px 0">
      <h2 style="margin:0 0 12px;font-size:22px">Merci pour votre rendez-vous</h2>
      <p>Bonjour ${safeFirst || '(Prénom)'},</p>
      <p>Votre rendez-vous avec <strong>${expertName || 'votre expert'}</strong> est maintenant terminé.</p>
      <p>Votre avis compte pour la communauté. Quelques mots suffisent pour aider les prochains clients.</p>
      <div style="margin:18px 0 22px">
        <a href="${link}" target="_blank" rel="noopener"
           style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600">
          Laissez un avis à l’expert
        </a>
      </div>
      <p style="margin:20px 0">Merci pour votre confiance,<br/>L’équipe Wicca</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}
