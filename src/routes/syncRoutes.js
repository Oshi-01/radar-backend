const express = require("express");
const router = express.Router();
const syncController = require("../controllers/syncController");

router.get("/:portalId", syncController.syncPortal);
router.get("/:portalId/status", syncController.getSyncStatus);

module.exports = router;
