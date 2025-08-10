const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Route de connexion
router.post('/login', authController.login);

module.exports = router; 