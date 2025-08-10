const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const auth = require('../utils/auth');

router.post('/generate14days', calendarController.add14DaysAvailabilities);
router.post('/bookSlot', auth, calendarController.bookSlot);
router.get('/availabilities/:expertId', calendarController.getAvailableSlots);
// Supprimer un créneau réservé (bookedSlot)
router.delete('/bookedSlot/:slotId', auth, calendarController.deleteBookedSlot);

module.exports = router;
