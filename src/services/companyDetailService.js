const { getCompanyHealth } = require("../repositories/companyHealthRepository");
const { getSettingsByPortalId } = require("../repositories/settingsRepository");
const { getOrBuildCompanyContext } = require("./companyContextCache");
const recommendationService = require("./recommendationService");
const prisma = require("../db");
const fetcher = require("./optimizedHubspotFetcher");
const { getValidAccessToken } = require("./oauthService");
const healthEngine = require("./healthEngine");
const riskService = require("./riskService");

const getCompanyFullDetail = async (portalId, companyId) => {
    // 1. Fetch valid portal access token
    const accessToken = await getValidAccessToken(portalId);

    // 2. Fetch parallel data (Health, History, and live Context/Activity)
    const [healthRecord, settings, companyData, historyRecords, tickets, deals, engagements] = await Promise.all([
        getCompanyHealth(portalId, companyId),
        getSettingsByPortalId(portalId),
        getOrBuildCompanyContext(portalId, companyId, accessToken),
        prisma.healthHistory.findMany({
            where: { companyHealth: { portalId, companyId } },
            orderBy: { createdAt: "desc" },
            take: 20
        }),
        fetcher.fetchCompanyTickets(accessToken, companyId),
        fetcher.fetchCompanyDeals(accessToken, companyId),
        fetcher.fetchCompanyEngagements(accessToken, companyId)
    ]);

    if (!healthRecord) {
        throw new Error("Company health record not found");
    }

    // 3. Get Recommendations
    const recommendations = recommendationService.getRecommendations(companyData);

    // 4. On-Demand Score Calculation
    const healthResult = await healthEngine.calculateHealthScore(companyData, settings, healthRecord.score);
    const calculatedScore = healthResult.score;
    const calculatedRiskLevel = riskService.getRiskLevel(calculatedScore);

    // Save it to DB so it updates immediately
    await prisma.companyHealth.update({
        where: { id: healthRecord.id },
        data: {
            score: calculatedScore,
            riskLevel: calculatedRiskLevel,
            lastCalculatedAt: new Date()
        }
    });

    // 5. Build breakdown and reasons
    const breakdown = [
        { label: 'Engagement', value: healthResult.engagementHealth > 0 ? `+${healthResult.engagementHealth}` : `${healthResult.engagementHealth}`, impact: healthResult.engagementHealth },
        { label: 'Support', value: healthResult.ticketHealth > 0 ? `+${healthResult.ticketHealth}` : `${healthResult.ticketHealth}`, impact: healthResult.ticketHealth },
        { label: 'Commercial', value: healthResult.dealHealth > 0 ? `+${healthResult.dealHealth}` : `${healthResult.dealHealth}`, impact: healthResult.dealHealth },
        { label: 'Trend', value: healthResult.signalRisk > 0 ? `+${healthResult.signalRisk}` : `${healthResult.signalRisk}`, impact: healthResult.signalRisk }
    ];

    const reasons = [];
    if (companyData.stagnantDeals > 0) reasons.push(`${companyData.stagnantDeals} stagnant deals.`);
    if (companyData.lostDeals30Days > 0) reasons.push(`${companyData.lostDeals30Days} deals lost in last 30 days.`);
    if (companyData.openCriticalTickets > 0) reasons.push(`${companyData.openCriticalTickets} open critical tickets.`);
    if (companyData.slaBreachedTickets > 0) reasons.push(`${companyData.slaBreachedTickets} tickets breaching SLA.`);
    if (companyData.daysSinceLastEmail > 14) reasons.push(`No email engagement in ${companyData.daysSinceLastEmail} days.`);
    if (companyData.daysSinceMeeting > 30) reasons.push(`No meetings in ${companyData.daysSinceMeeting} days.`);
    if (reasons.length === 0) reasons.push("Account is healthy and actively engaged.");

    // 6. Construct Final Object
    return {
        company: {
            id: companyId,
            name: healthRecord.companyName || companyData.companyName,
        },
        healthScore: calculatedScore,
        riskLevel: calculatedRiskLevel,
        trend: healthResult.trendDirection,
        lastCalculatedAt: healthRecord.lastCalculatedAt || new Date(),
        breakdown,
        reasons,
        recommendations,
        summary: {
            activeDeals: companyData.activeDeals || 0,
            stagnantDeals: companyData.stagnantDeals || 0,
            lostDeals30Days: companyData.lostDeals30Days || 0,
            openTickets: companyData.openTickets || 0,
            openCriticalTickets: companyData.openCriticalTickets || 0,
            slaBreachedTickets: companyData.slaBreachedTickets || 0,
            daysSinceLastEmail: companyData.daysSinceLastEmail || 0,
            daysSinceMeeting: companyData.daysSinceMeeting || 0,
            daysSinceLastActivity: companyData.daysSinceLastActivity || 0,
        },
        history: historyRecords.map(h => ({
            score: h.newScore,
            reason: h.reason,
            createdAt: h.createdAt
        })),
        activity: {
            tickets: tickets.map(t => ({ id: t.id, subject: t.properties.subject, stage: t.properties.hs_pipeline_stage, date: t.properties.createdate })),
            deals: deals.map(d => ({ id: d.id, name: d.properties.dealname, amount: d.properties.amount, stage: d.properties.dealstage, date: d.properties.closedate })),
            engagements: engagements.map(e => ({ id: e.id, title: e.properties.hs_meeting_title || e.properties.hs_email_subject, date: e.properties.hs_timestamp || e.properties.hs_createdate }))
        }
    };
};

module.exports = {
    getCompanyFullDetail
};
