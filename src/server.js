const express = require('express')
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
var cors = require('cors')
const apiRouter = require('./routes');
const cron = require('node-cron');
//const errorHandler = require('./middlewares/errorsHandling');
require('dotenv').config();
// Forcer le fuseau horaire Paris pour toutes les opérations Date locales et pour le cron
process.env.TZ = process.env.TZ || 'Europe/Paris';
process.env.CRON_TZ = process.env.CRON_TZ || 'Europe/Paris';
console.log('Server TZ:', process.env.TZ, 'CRON_TZ:', process.env.CRON_TZ, 'Now:', new Date().toString());
console.log('MONGODB_URI from env:', process.env.MONGODB_USER);

//mongoDb connect
mongoose.set("strictQuery", false);
mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}.mongodb.net/?retryWrites=true&w=majority`
).then(async () => {
  console.log("successfully connect to database");
  try {
    // Synchronise les index (unique email inclus)
    await Promise.all([
      require('./models/users.model').syncIndexes(),
      require('./models/experts.model').syncIndexes()
    ]);
    console.log('Indexes synchronisés');
  } catch (e) {
    console.warn('Erreur synchronisation des index:', e?.message);
  }
}).catch(err => console.log(err))

//Middlewares & routes
app.use(cors());

// Route Stripe webhook AVANT tout bodyParser.json()
app.post(
  '/api/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  require('./controllers/stripe.controller').webhook
);

// Ensuite, le reste du parsing JSON
app.use(bodyParser.json());
app.use("/api", apiRouter);
//app.use(errorHandler);
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// start app
app.listen(process.env.PORT, function () {
  console.log("Server launch");
}); 

// Cron: chaque lundi à 10:00 heure serveur
try {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const BookedSlot = require('./models/bookedSlot.model');
  const { sendAppointmentEndedEmail } = require('./utils/mailer');
  cron.schedule('0 10 * * 1', async () => {
    console.log('[Cron] Capture des paiements autorisés (lundi 10:00)');
    const now = new Date();
    const toCapture = await BookedSlot.find({
      authorized: true,
      paid: { $ne: true },
      paymentIntentId: { $ne: null },
      cancel: { $ne: true },
      captureScheduledFor: { $lte: now }
    }).select('paymentIntentId');
    for (const slot of toCapture) {
      try {
        await stripe.paymentIntents.capture(slot.paymentIntentId);
      } catch (e) {
        console.error('[Cron] Echec capture', slot.paymentIntentId, e?.message);
      }
    }
  }, {
    timezone: process.env.CRON_TZ || 'Europe/Paris'
  });

  // Cron: toutes les 5 minutes, envoie l'email de fin de RDV aux clients dont la séance est terminée
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const candidates = await BookedSlot.find({
        emailEndedSent: { $ne: true },
        cancel: { $ne: true },
        date: { $lte: now }
      })
        .select('start end date client expert emailEndedSent ended')
        .populate({ path: 'client', model: 'User', select: 'firstName lastName email' })
        .populate({ path: 'expert', model: 'Expert', select: 'firstName lastName email' })
        .limit(500);

      const baseUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

      for (const slot of candidates) {
        try {
          const d = new Date(slot.date);
          const timeStr = typeof slot.end === 'string' && slot.end ? slot.end : (typeof slot.start === 'string' ? slot.start : '00:00');
          const [hhStr = '0', mmStr = '0'] = String(timeStr).split(':');
          const hh = parseInt(hhStr || '0', 10) || 0;
          const mm = parseInt(mmStr || '0', 10) || 0;
          const endDt = new Date(d);
          endDt.setHours(hh, mm, 0, 0);

          if (endDt <= now && slot.client && slot.client.email && slot.expert) {
            const expertName = [slot.expert.firstName, slot.expert.lastName].filter(Boolean).join(' ').trim();
            const reviewLink = `${baseUrl}/rdv?review=${encodeURIComponent(String(slot._id))}`;
            await sendAppointmentEndedEmail({
              to: slot.client.email,
              clientFirstName: slot.client.firstName || '',
              expertName,
              reviewLink
            });
            slot.emailEndedSent = true;
            slot.ended = true;
            await slot.save();
          }
        } catch (e) {
          // on continue avec les autres slots
        }
      }
    } catch (e) {
      console.warn('[Cron] Erreur envoi emails fin RDV:', e?.message);
    }
  }, {
    timezone: process.env.CRON_TZ || 'Europe/Paris'
  });
} catch (e) {
  console.warn('Cron non initialisé:', e?.message);
}