const express = require('express');
const router = express.Router();
const specialtiesController = require('../controllers/specialties.controller');

// Route pour créer une spécialité
router.post('/create', specialtiesController.createSpecialty);
// Route pour récupérer toutes les spécialités avec sous-spécialités
router.get('/get-all', specialtiesController.getAllSpecialties);
// Route pour rechercher des spécialités par nom
router.post('/search', specialtiesController.searchSpecialties);
// Route pour mettre à jour une spécialité
router.patch('/:id', specialtiesController.updateSpecialty);

module.exports = router; 