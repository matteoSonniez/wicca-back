const express = require('express');
const router = express.Router();
const expertsRouter = require("./experts.route");
const usersRouter = require("./users.route");
const specialtiesRouter = require("./specialties.route");
const subSpecialtiesRouter = require("./subspecialties.route");

router.use("/experts", expertsRouter);
router.use("/users", usersRouter);
router.use("/specialties", specialtiesRouter);
router.use("/subspecialties", subSpecialtiesRouter);

module.exports = router;