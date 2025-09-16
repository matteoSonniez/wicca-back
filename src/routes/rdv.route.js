const express = require('express');
const router = express.Router();
const { getClientAppointmentsById, getExpertAppointmentsById } = require('../controllers/rdv.controller');

// RDV d'un client par ID
router.get('/client/:userId', getClientAppointmentsById);

// RDV d'un expert par ID
router.get('/expert/:expertId', getExpertAppointmentsById);

module.exports = router;


