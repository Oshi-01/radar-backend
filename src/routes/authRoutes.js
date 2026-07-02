const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.get("/install", authController.install);
router.get("/oauth/callback", authController.oauthCallback);
router.get("/me", authController.me);

module.exports = router;