const User = require('../models/users.model');
const Expert = require('../models/experts.model');
const BookedSlot = require('../models/bookedSlot.model');

// GET /api/rdv/client/:userId
const getClientAppointmentsById = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'userId requis' });

    const user = await User.findById(userId)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'expert', model: 'Expert', select: 'firstName email photoUrl avatard' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ rdvs: user.rdv || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV client', error: error.message });
  }
};

// GET /api/rdv/client (auth requis)
const getClientAppointmentsMe = async (req, res) => {
  try {
    const me = req.user;
    if (!me || !me._id) return res.status(403).json({ message: 'Réservé aux utilisateurs authentifiés' });

    const user = await User.findById(me._id)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'expert', model: 'Expert', select: 'firstName email photoUrl avatard' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ rdvs: user.rdv || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV client', error: error.message });
  }
};

// GET /api/rdv/expert/:expertId
const getExpertAppointmentsById = async (req, res) => {
  try {
    const { expertId } = req.params;
    if (!expertId) return res.status(400).json({ message: 'expertId requis' });

    const expert = await Expert.findById(expertId)
      .select('rdv')
      .populate({
        path: 'rdv',
        model: 'BookedSlot',
        options: { sort: { date: -1, start: -1 } },
        populate: [
          { path: 'client', model: 'User', select: 'firstName lastName email' },
          { path: 'specialty', model: 'Specialty', select: 'name color' },
        ],
      });

    if (!expert) return res.status(404).json({ message: 'Expert non trouvé' });
    const now = new Date();
    const rdvs = expert.rdv || [];

    // Déterminer les RDV terminés (date + heure de fin passées)
    const idsToMarkEnded = [];
    for (const rdv of rdvs) {
      try {
        const timeString = rdv.end || rdv.start; // fallback sur start si end manquant
        if (!timeString) continue;
        const [hh, mm] = timeString.split(':').map(Number);
        const endDateTime = new Date(rdv.date);
        endDateTime.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
        if (endDateTime <= now && !rdv.ended) {
          idsToMarkEnded.push(rdv._id);
          rdv.ended = true; // refléter immédiatement dans la réponse
          // L'email de fin est désormais géré par le cron (server.js)
        }
      } catch (_) {
        // ignorer un rdv mal formé
      }
    }

    if (idsToMarkEnded.length > 0) {
      await BookedSlot.updateMany({ _id: { $in: idsToMarkEnded } }, { $set: { ended: true } });
    }

    // Envoi email fin RDV supprimé ici (cron dédié)

    res.json({ rdvs });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des RDV expert', error: error.message });
  }
};

// GET /api/rdv/by-session/:sessionId (auth requis)
const getAppointmentByStripeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ message: 'sessionId requis' });

    const me = req.user;
    if (!me || !me._id) return res.status(403).json({ message: 'Réservé aux utilisateurs authentifiés' });

    const slot = await BookedSlot.findOne({ stripeSessionId: sessionId })
      .populate({ path: 'expert', model: 'Expert', select: 'firstName email adressrdv' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name color' });

    if (!slot) return res.status(404).json({ message: 'RDV introuvable' });
    if (String(slot.client) !== String(me._id)) return res.status(403).json({ message: 'Non autorisé' });

    return res.status(200).json({ rdv: slot });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération du RDV', error: error.message });
  }
};

// GET /api/rdv/by-id/:slotId (auth requis)
const getAppointmentById = async (req, res) => {
  try {
    const { slotId } = req.params;
    if (!slotId) return res.status(400).json({ message: 'slotId requis' });

    const me = req.user;
    if (!me || !me._id) return res.status(403).json({ message: 'Réservé aux utilisateurs authentifiés' });

    const slot = await BookedSlot.findById(slotId)
      .populate({ path: 'expert', model: 'Expert', select: 'firstName email adressrdv' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name color' });

    if (!slot) return res.status(404).json({ message: 'RDV introuvable' });
    if (String(slot.client) !== String(me._id)) return res.status(403).json({ message: 'Non autorisé' });

    return res.status(200).json({ rdv: slot });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de la récupération du RDV', error: error.message });
  }
};

// POST /api/rdv/send-confirmation (auth requis)
// Body: { slotId: string, jaasLink?: string }
const sendAppointmentConfirmation = async (req, res) => {
  try {
    const me = req.user;
    if (!me || !me._id) return res.status(403).json({ message: 'Réservé aux utilisateurs authentifiés' });
    const { slotId, jaasLink } = req.body || {};
    if (!slotId) return res.status(400).json({ message: 'slotId requis' });

    const slot = await BookedSlot.findById(slotId)
      .populate({ path: 'expert', model: 'Expert', select: 'firstName email' })
      .populate({ path: 'specialty', model: 'Specialty', select: 'name color' })
      .populate({ path: 'client', model: 'User', select: 'firstName lastName email' });
    if (!slot) return res.status(404).json({ message: 'RDV introuvable' });
    if (String(slot.client?._id) !== String(me._id)) return res.status(403).json({ message: 'Non autorisé' });

  console.log('[RDV] send-confirmation for slot', String(slot._id), {
    expertId: String(slot.expert?._id || ''),
    expertEmail: slot.expert?.email || '',
    clientEmail: slot.client?.email || '',
    visio: !!slot.visio,
    start: slot.start,
    end: slot.end,
    date: slot.date
  });

    // idempotent
    if (slot.emailConfirmationSent === true) {
      return res.status(200).json({ message: 'Déjà envoyé' });
    }

    const { sendAppointmentConfirmationEmail, sendExpertAppointmentNotificationEmail } = require('../utils/mailer');
    const safeFirst = slot.client?.firstName || '';
    const expertName = (slot.expert?.firstName || '').trim();
    const dateStr = new Date(slot.date).toLocaleDateString('fr-FR');
    const heureStr = `${slot.start} - ${slot.end}`;
    const visio = slot.visio === true;
    // Lien visio stable: page interne qui génère le token JaaS au moment de la connexion
    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const link = visio ? (jaasLink || `${baseUrl}/rdv/${slot._id}`) : '';

    await sendAppointmentConfirmationEmail({
      to: slot.client?.email,
      clientFirstName: safeFirst,
      expertName,
      dateStr,
      heureStr,
      visio,
      jaasLink: link
    });
  console.log('[RDV] Email confirmation client envoyé');
    // Envoi à l'expert si pas déjà envoyé
    if (slot.expert && slot.expert.email && slot.expertNotificationSent !== true) {
      const clientName = [slot.client?.firstName, slot.client?.lastName].filter(Boolean).join(' ').trim();
      try {
        await sendExpertAppointmentNotificationEmail({
          to: slot.expert.email,
          expertFirstName: slot.expert.firstName || '',
          clientName,
          dateStr,
          heureStr,
          visio,
          jaasLink: link
        });
        slot.expertNotificationSent = true;
      console.log('[RDV] Email notification expert envoyé');
      } catch (e) {
        // ne bloque pas la réponse
      console.warn('[RDV] Erreur envoi email expert', e?.message || e);
      }
    }

  // Envoi SMS expert au même moment que l'email (indépendant de l'email)
  try {
    if (slot.expert && slot.expert._id) {
      const Expert = require('../models/experts.model');
      const { sendSms } = require('../utils/sms');
      const expertDoc = await Expert.findById(slot.expert._id).select('phone');
      const expertPhone = expertDoc && expertDoc.phone ? String(expertDoc.phone).trim() : '';
      console.log('[RDV] Expert phone fetched', { expertPhone });
      if (expertPhone) {
        const baseUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://wicca.fr').replace(/\/$/, '');
        const dashUrl = `${baseUrl}`;
        const visioTxt = visio ? 'Visio' : 'Présentiel';
        const msg = [
          `Wicca · Vous avez un nouveau rendez-vous`,
          `${dateStr} ${heureStr}`,
          `Client: ${safeFirst || 'un client'}`,
          `Format: ${visioTxt}`,
          `Gérer: ${dashUrl}`
        ].join('\n');
        await sendSms({ to: expertPhone, message: msg, tag: 'rdv-paid' });
        console.log('[RDV] SMS expert envoyé');
      } else {
        console.warn('[RDV] Aucun numéro expert, SMS non envoyé');
      }
    } else {
      console.warn('[RDV] Expert manquant, SMS non envoyé');
    }
  } catch (e) {
    console.warn('[RDV] Erreur envoi SMS expert', e?.message || e);
  }

    slot.emailConfirmationSent = true;
    await slot.save();
    return res.status(200).json({ message: 'Email envoyé' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur envoi email', error: error.message });
  }
};

module.exports = { getClientAppointmentsById, getClientAppointmentsMe, getExpertAppointmentsById, getAppointmentByStripeSession, getAppointmentById, sendAppointmentConfirmation };



// Annuler un rendez-vous: marque cancel=true et annule le PaymentIntent si non capturé
module.exports.cancelAppointment = async (req, res) => {
  try {
    const { slotId } = req.params;
    if (!slotId) return res.status(400).json({ message: 'slotId requis' });
    const BookedSlot = require('../models/bookedSlot.model');
    const slot = await BookedSlot.findById(slotId).select('expert client cancel paid paymentIntentId authorized');
    if (!slot) return res.status(404).json({ message: 'RDV introuvable' });

    // Autorisation: expert propriétaire OU client propriétaire
    const isExpert = !!req.expert && String(slot.expert) === String(req.expert._id);
    const isClient = !!req.user && String(slot.client) === String(req.user._id);
    if (!isExpert && !isClient) return res.status(403).json({ message: 'Non autorisé' });

    // Si pas déjà annulé, on annule
    if (!slot.cancel) {
      // Si paiement non capturé, tenter d'annuler le PaymentIntent
      try {
        if (slot.paymentIntentId && !slot.paid) {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          await stripe.paymentIntents.cancel(slot.paymentIntentId);
        }
      } catch (e) {
        // si déjà annulé côté Stripe, on ignore
      }
      slot.cancel = true;
      slot.authorized = false; // sécurité
      await slot.save();
    }
    return res.status(200).json({ message: 'RDV annulé', slotId: slotId });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur lors de l\'annulation du RDV', error: error.message });
  }
};
