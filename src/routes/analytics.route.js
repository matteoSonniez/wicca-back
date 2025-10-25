const express = require('express');
const router = express.Router();
const { ingestEvent } = require('../controllers/analytics.controller');

// Ingestion d'un événement d'analytics
router.post('/events', ingestEvent);

module.exports = router;


