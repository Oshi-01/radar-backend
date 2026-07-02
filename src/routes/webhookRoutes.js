const express = require("express");
const router = express.Router();
const { handleWebhook, scoreRenewalRisk } = require("../webhooks/hubspotWebhookController");

router.post("/hubspot", handleWebhook);
router.post("/workflow/score-renewal", scoreRenewalRisk);

module.exports = router;
