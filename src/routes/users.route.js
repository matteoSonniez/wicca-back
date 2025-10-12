const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const auth = require('../utils/auth');

router.post("/create", usersController.createUser);
router.post("/login", usersController.loginUser);
router.get("/me", auth, usersController.getMe);
router.patch("/me", auth, usersController.updateMe);
router.get("/favorites", auth, usersController.getFavorites);
router.post("/favorites/:expertId", auth, usersController.addFavorite);
router.delete("/favorites/:expertId", auth, usersController.removeFavorite);

module.exports = router; 