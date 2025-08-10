const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');

router.get('/connect', calendarController.connectCalendly);
router.get('/callback', calendarController.connectCalendly); 

module.exports = router;