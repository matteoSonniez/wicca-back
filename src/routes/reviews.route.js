const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const { createReview, getReviewsForExpert, getMyReviews, getExpertAverage } = require('../controllers/reviews.controller');

// Créer un avis (client authentifié)
router.post('/', auth, createReview);

// Liste des avis d'un expert
router.get('/expert/:expertId', getReviewsForExpert);

// Moyenne des avis d'un expert
router.get('/expert/:expertId/average', getExpertAverage);

// Mes avis (client authentifié)
router.get('/me', auth, getMyReviews);

module.exports = router;


