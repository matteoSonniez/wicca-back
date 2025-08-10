const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const auth = require('../utils/auth');

router.post("/create", usersController.createUser);
router.post("/login", usersController.loginUser);
router.get("/me", auth, usersController.getMe);

module.exports = router; 