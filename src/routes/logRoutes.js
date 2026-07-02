const express = require("express");
const router = express.Router();
const prisma = require("../db");

// Get webhook logs
router.get("/", async (req, res) => {
    try {
        const portalId = req.query.portalId;
        const limit = parseInt(req.query.limit) || 50;

        if (!portalId) {
            return res.status(400).json({ error: "portalId is required" });
        }

        const logs = await prisma.webhookEvent.findMany({
            where: { portalId },
            orderBy: { createdAt: "desc" },
            take: limit
        });

        return res.json({ data: logs });
    } catch (error) {
        console.error("Error fetching logs:", error);
        return res.status(500).json({ error: "Failed to fetch logs" });
    }
});

module.exports = router;
