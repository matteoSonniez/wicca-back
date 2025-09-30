const express = require('express');
const router = express.Router();
const { getClientAppointmentsById, getClientAppointmentsMe, getExpertAppointmentsById } = require('../controllers/rdv.controller');
const auth = require('../utils/auth');

// RDV d'un client par ID
router.get('/client/:userId', getClientAppointmentsById);

// RDV du client authentifié
router.get('/client', auth, getClientAppointmentsMe);

// RDV d'un expert par ID
router.get('/expert/:expertId', getExpertAppointmentsById);

module.exports = router;


