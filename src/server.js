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
console.log('MONGODB_URI from env:', process.env.MONGODB_USER);

//mongoDb connect
mongoose.set("strictQuery", false);
mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}.mongodb.net/?retryWrites=true&w=majority` 
).then(() => {
  console.log("successfully connect to database")
}).catch(err=>console.log(err))

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

// Cron: chaque mardi à 13:30 heure serveur
try {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const BookedSlot = require('./models/bookedSlot.model');
  cron.schedule('30 13 * * 2', async () => {
    console.log('[Cron] Capture des paiements autorisés (mardi 13:30)');
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
} catch (e) {
  console.warn('Cron non initialisé:', e?.message);
}