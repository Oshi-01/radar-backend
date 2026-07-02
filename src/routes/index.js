const express = require("express");
const router = express.Router();

const { getHealth } = require("../controllers/healthController");
const authRoutes = require("./authRoutes");
const syncRoutes = require("./syncRoutes");
const webhookRoutes = require("./webhookRoutes");
const companyRoutes = require("./companyRoutes");

const settingsRoutes = require("./settingsRoutes");
const logRoutes = require("./logRoutes");

// Basic health check route for the DB connection
router.get("/health", getHealth);

router.use("/hubspot", authRoutes);
router.use("/sync", syncRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/company", companyRoutes);
router.use("/settings", settingsRoutes);
router.use("/logs", logRoutes);

module.exports = router;
