const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripe.controller');
const auth = require('../utils/auth');

router.post('/create-checkout-session', auth, stripeController.createCheckoutSession);

module.exports = router; 