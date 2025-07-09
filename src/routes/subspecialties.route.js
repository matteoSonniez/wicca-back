const express = require('express');
const router = express.Router();
const subSpecialtiesController = require('../controllers/subspecialties.controller');

// Route pour créer une sous-spécialité
router.post('/create', subSpecialtiesController.createSubSpecialty);

module.exports = router; 