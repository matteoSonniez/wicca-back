const express = require('express');
const router = express.Router();
const { getClientAppointmentsById, getClientAppointmentsMe, getExpertAppointmentsById, cancelAppointment, getAppointmentByStripeSession, getAppointmentById, sendAppointmentConfirmation } = require('../controllers/rdv.controller');
const auth = require('../utils/auth');

// RDV d'un client par ID
router.get('/client/:userId', getClientAppointmentsById);

// RDV du client authentifié
router.get('/client', auth, getClientAppointmentsMe);

// RDV d'un expert par ID
router.get('/expert/:expertId', getExpertAppointmentsById);

module.exports = router;
// Annuler un RDV (client ou expert propriétaire)
router.post('/cancel/:slotId', auth, cancelAppointment);

// RDV par Stripe Checkout Session (client authentifié)
router.get('/by-session/:sessionId', auth, getAppointmentByStripeSession);

// RDV par slotId (client authentifié)
router.get('/by-id/:slotId', auth, getAppointmentById);

// Envoi email de confirmation (idempotent)
router.post('/send-confirmation', auth, sendAppointmentConfirmation);


