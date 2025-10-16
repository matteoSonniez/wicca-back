const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const adminOnly = require('../utils/admin');
const adminCtrl = require('../controllers/admin.controller');

// Toutes les routes admin nécessitent auth + adminOnly
router.use(auth, adminOnly);

// Promos
router.get('/promos', adminCtrl.listPromos);
router.post('/promos', adminCtrl.createPromo);
router.patch('/promos/:id', adminCtrl.updatePromo);
router.delete('/promos/:id', adminCtrl.deletePromo);

// Experts
router.get('/experts', adminCtrl.listExperts);
router.get('/experts/:id', adminCtrl.getExpertById);
router.patch('/experts/:id', adminCtrl.updateExpert);
router.delete('/experts/:id', adminCtrl.deleteExpert);

// Placeholders pour futurs endpoints users
router.get('/users', adminCtrl.listUsers);
router.post('/users', adminCtrl.createUser);
router.delete('/users/:id', adminCtrl.deleteUser);

module.exports = router;


