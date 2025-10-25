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

// RDV
router.get('/rdv', adminCtrl.listAppointments);

// Stats acquisitions
router.get('/stats/acquisitions', adminCtrl.acquisitionStats);
// Analytics overview
router.get('/analytics/overview', adminCtrl.analyticsOverview);
// Analytics insights avancés
router.get('/analytics/insights', adminCtrl.analyticsInsights);
// Analytics funnel
router.get('/analytics/funnel', adminCtrl.analyticsFunnel);
// Analytics export CSV
router.get('/analytics/export.csv', adminCtrl.analyticsExportCsv);
// Analytics exits
router.get('/analytics/exits', adminCtrl.analyticsExits);
// Analytics purge (danger)
router.delete('/analytics', adminCtrl.analyticsPurge);
// Placeholders pour futurs endpoints users
router.get('/users', adminCtrl.listUsers);
router.post('/users', adminCtrl.createUser);
router.delete('/users/:id', adminCtrl.deleteUser);

module.exports = router;


