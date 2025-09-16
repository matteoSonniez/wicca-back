const express = require('express');
const router = express.Router();
const expertsRouter = require("./experts.route");
const usersRouter = require("./users.route");
const specialtiesRouter = require("./specialties.route");
const subSpecialtiesRouter = require("./subspecialties.route");
const calendarRouter = require("./calendar.route");
const stripeRouter = require("./stripe.route");
const authRouter = require("./auth.route");
const jaasRouter = require("./jaas.route");
const rdvRouter = require("./rdv.route");

router.use("/experts", expertsRouter);
router.use("/users", usersRouter);
router.use("/specialties", specialtiesRouter);
router.use("/subspecialties", subSpecialtiesRouter);
router.use("/calendar", calendarRouter);
router.use("/stripe", stripeRouter);
router.use("/auth", authRouter);
router.use("/jaas", jaasRouter);
router.use("/rdv", rdvRouter);

module.exports = router;