const express = require("express");
const router = express.Router();
const prisma = require("../db");

const DEFAULT_RULES = {
    engagement: {
        meeting_in_days: { enabled: true, days: 30, points: 10 },
        call_in_days: { enabled: true, days: 30, points: 5 },
        frequent_engagement: { enabled: true, count: 3, days: 45, points: 10 },
        no_meeting_or_call: { enabled: true, days: 45, points: -10 },
        no_activity: { enabled: true, days: 60, points: -15 }
    },
    support: {
        zero_open_tickets: { enabled: true, points: 5 },
        some_open_tickets: { enabled: true, min: 3, max: 5, points: -10 },
        many_open_tickets: { enabled: true, min: 6, points: -20 },
        overdue_critical: { enabled: true, days: 7, points: -10 },
        escalated_ticket: { enabled: true, points: -10 }
    },
    commercial: {
        healthy_open_renewal: { enabled: true, points: 10 },
        renewal_away_31_90: { enabled: true, minDays: 31, maxDays: 90, points: -5 },
        renewal_less_30_low_eng: { enabled: true, days: 30, points: -15 },
        renewal_stalled: { enabled: true, days: 21, points: -10 },
        renewal_closed_lost: { enabled: true, points: -20 },
        no_renewal_owner: { enabled: true, points: -5 }
    },
    trend: {
        score_improved: { enabled: true, points: 5 },
        score_dropped_10: { enabled: true, points: -10 },
        meeting_despite_escalation: { enabled: true, points: 5 }
    }
};

const DEFAULT_THRESHOLDS = {
    healthy: 80,
    warning: 60
};

// Get settings for the portal
router.get("/", async (req, res) => {
    try {
        const portalId = req.query.portalId;
        if (!portalId) {
            return res.status(401).json({ error: "portalId required" });
        }

        let settings = await prisma.settings.findUnique({
            where: { portalId }
        });

        if (!settings) {
            const portal = await prisma.portal.findUnique({ where: { portalId } });
            if (!portal) {
                return res.status(404).json({ error: "Portal not found" });
            }

            settings = await prisma.settings.create({
                data: {
                    portalId,
                    rulesConfig: DEFAULT_RULES,
                    riskThresholds: DEFAULT_THRESHOLDS
                }
            });
        } else if (!settings.rulesConfig || !settings.riskThresholds) {
            settings = await prisma.settings.update({
                where: { portalId },
                data: { 
                    rulesConfig: settings.rulesConfig || DEFAULT_RULES,
                    riskThresholds: settings.riskThresholds || DEFAULT_THRESHOLDS
                }
            });
        }

        return res.json(settings);
    } catch (error) {
        console.error("Error fetching settings:", error);
        return res.status(500).json({ error: "Failed to fetch settings", message: error.message, stack: error.stack });
    }
});

// Update settings
router.post("/", async (req, res) => {
    try {
        const { portalId, rulesConfig, riskThresholds } = req.body;
        
        if (!portalId) {
            return res.status(401).json({ error: "portalId required" });
        }

        const portal = await prisma.portal.findUnique({ where: { portalId } });
        if (!portal) {
            return res.status(404).json({ error: "Portal not found" });
        }

        const settings = await prisma.settings.upsert({
            where: { portalId },
            update: {
                rulesConfig,
                riskThresholds
            },
            create: {
                portalId,
                rulesConfig,
                riskThresholds
            }
        });

        return res.json({ success: true, settings });
    } catch (error) {
        console.error("Error updating settings:", error);
        return res.status(500).json({ error: "Failed to update settings" });
    }
});

module.exports = router;
