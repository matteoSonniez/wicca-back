const express = require('express');
const router = express.Router();
const expertsController = require('../controllers/experts.controller');

router.post("/create", expertsController.createExpert);
router.post("/login", expertsController.loginExpert);
router.get('/get-one/:id', expertsController.getExpert);
router.patch('/update-specialties/:id', expertsController.updateExpertSpecialties);
router.post('/search', expertsController.searchExperts);
router.post('/find-by-specialty', expertsController.findExpertsBySpecialty);

module.exports = router;