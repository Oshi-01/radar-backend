const { createWebhookEvent } = require("../repositories/webhookRepository");
const webhookProcessor = require("../services/webhookProcessor");

const handleWebhook = async (req, res) => {
    // Respond immediately to prevent HubSpot timeout
    res.status(200).send("OK");

    const events = req.body;
    if (!Array.isArray(events)) {
        return;
    }

    for (const event of events) {
        try {
            // Save event to DB
            const dbEvent = await createWebhookEvent({
                portalId: String(event.portalId),
                eventType: event.subscriptionType || event.eventType || "unknown",
                objectType: event.subscriptionType ? event.subscriptionType.split('.')[0] : '', 
                objectId: String(event.objectId),
                payload: event,
                processed: false,
            });

            // Trigger async processing
            webhookProcessor.processEvent(dbEvent).catch((err) => {
                console.error("Error processing webhook event asynchronously:", err.message);
            });
        } catch (error) {
            console.error("Error storing webhook event:", error.message);
        }
    }
};

const { getOrBuildCompanyContext } = require("../services/companyContextCache");
const healthEngine = require("../services/healthEngine");
const riskService = require("../services/riskService");
const prisma = require("../db");
const { getValidAccessToken } = require("../services/oauthService");

const scoreRenewalRisk = async (req, res) => {
    try {
        const payload = req.body;
        const portalId = payload.origin?.portalId?.toString();
        const companyId = payload.inputFields?.companyId || payload.object?.objectId?.toString();

        if (!portalId || !companyId) {
            return res.status(400).json({ error: "Missing portalId or companyId" });
        }

        // Idempotency Layer: Check if we recalculated very recently (e.g. 5 mins)
        const existingHealth = await prisma.companyHealth.findFirst({
            where: { portalId, companyId }
        });
        
        if (existingHealth && existingHealth.lastCalculatedAt) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (existingHealth.lastCalculatedAt > fiveMinutesAgo) {
                console.log(`Idempotency skip: Company ${companyId} was scored less than 5 mins ago.`);
                // Return existing cached score if available to satisfy Workflow
                return res.status(200).json({
                    outputFields: {
                        healthScore: existingHealth.score,
                        riskLevel: existingHealth.riskLevel,
                        trendDirection: existingHealth.trend || "STABLE",
                        riskExplanation: "Score calculated recently. See app card for details."
                    }
                });
            }
        }

        const accessToken = await getValidAccessToken(portalId);
        const settings = await prisma.settings.findUnique({ where: { portalId } }) || {};

        // Fetch authentic context
        const companyData = await getOrBuildCompanyContext(portalId, companyId, accessToken);
        
        if (!companyData) {
            return res.status(404).json({ error: "Company data not found" });
        }

        const previousScore = existingHealth ? existingHealth.score : null;
        const healthResult = await healthEngine.calculateHealthScore(companyData, settings, previousScore);
        const calculatedScore = healthResult.score;
        const calculatedRiskLevel = riskService.getRiskLevel(calculatedScore, settings);

        // Build Explanation
        const reasons = [];
        if (companyData.stagnantDeals > 0) reasons.push(`${companyData.stagnantDeals} stagnant deals.`);
        if (companyData.lostDeals30Days > 0) reasons.push(`${companyData.lostDeals30Days} deals lost in last 30 days.`);
        if (companyData.openCriticalTickets > 0) reasons.push(`${companyData.openCriticalTickets} open critical tickets.`);
        if (companyData.daysSinceLastEmail > 14) reasons.push(`No email engagement in ${companyData.daysSinceLastEmail} days.`);
        if (reasons.length === 0) reasons.push("Account is healthy and actively engaged.");

        // Update DB
        await prisma.companyHealth.updateMany({
            where: { portalId, companyId },
            data: {
                score: calculatedScore,
                riskLevel: calculatedRiskLevel,
                lastCalculatedAt: new Date()
            }
        });

        // Return sync response for Custom Workflow Action with expanded fields
        return res.status(200).json({
            outputFields: {
                healthScore: calculatedScore,
                riskLevel: calculatedRiskLevel,
                dealHealthScore: healthResult.dealHealth,
                ticketHealthScore: healthResult.ticketHealth,
                engagementHealthScore: healthResult.engagementHealth,
                trendDirection: healthResult.trendDirection,
                riskExplanation: reasons.join(" ")
            }
        });

    } catch (error) {
        console.error("Error in scoreRenewalRisk:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = {
    handleWebhook,
    scoreRenewalRisk
};
