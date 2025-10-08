const express = require('express');
const router = express.Router();
const { getExpertMonthlyAppointments, getExpertMonthlyUniqueClientsCount, getExpertMonthlyRevenueCompare } = require('../controllers/dashboard.controller');
const auth = require('../utils/auth');

// RDV du mois courant pour un expert
router.get('/rdv/month/:expertId', auth, getExpertMonthlyAppointments);

// Clients uniques du mois courant
router.get('/clients/month/:expertId', auth, getExpertMonthlyUniqueClientsCount);

// Revenus mensuels (courant + précédent) pour l'expert
router.get('/revenue/month/:expertId', auth, getExpertMonthlyRevenueCompare);

module.exports = router;


