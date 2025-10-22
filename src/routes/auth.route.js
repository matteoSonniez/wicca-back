const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Route de connexion
router.post('/login', authController.login);

// Inscription en deux étapes
router.post('/signup/request-code', authController.requestSignupCode);
router.post('/signup/verify', authController.verifySignupCode);

// Mot de passe oublié / reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router; 