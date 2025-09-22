const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripe.controller');
const auth = require('../utils/auth');

router.post('/create-checkout-session', auth, stripeController.createCheckoutSession);

// Stripe Connect (réservé aux experts authentifiés)
router.post('/connect/create-or-link-account', auth, stripeController.createOrLinkConnectAccount);
router.post('/connect/onboarding-link', auth, stripeController.createOnboardingLink);
router.get('/connect/status', auth, stripeController.getConnectStatus);
router.post('/connect/login-link', auth, stripeController.createConnectLoginLink);

module.exports = router; 