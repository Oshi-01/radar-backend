const { getPortalByPortalId } = require("../repositories/portalRepository");
const { getSettingsByPortalId } = require("../repositories/settingsRepository");
const { getCompanyHealth, updateCompanyHealth, createCompanyHealth } = require("../repositories/companyHealthRepository");
const { createHistory } = require("../repositories/historyRepository");
const { getHubSpotClient } = require("../config/hubspotClient");
const { getOrBuildCompanyContext } = require("./companyContextCache");
const healthEngine = require("./healthEngine");
const riskService = require("./riskService");
const recommendationService = require("./recommendationService");
const appEventService = require("./hubspot/appEventService");
const { logEvent } = require("../utils/performanceLogger");

const identifyCompanyId = async (portalId, objectType, objectId) => {
    if (objectType === "company" || objectType === "company.creation" || objectType === "company.propertyChange" || objectType === "company.deletion") {
        return objectId;
    }

    const portal = await getPortalByPortalId(portalId);
    if (!portal || !portal.accessToken) {
        throw new Error("Portal or access token not found");
    }

    const client = getHubSpotClient(portal.accessToken);
    let api;
    if (objectType === 'deal') api = client.crm.deals.associationsApi;
    if (objectType === 'ticket') api = client.crm.tickets.associationsApi;
    
    if (api) {
        try {
            const response = await api.getAll(objectId, "company");
            if (response.results && response.results.length > 0) {
                return String(response.results[0].id); // The ID of the associated company
            }
        } catch (error) {
            console.error(`Failed to find company association for ${objectType} ${objectId}:`, error.message);
        }
    }

    return null;
};

const recalculateForCompany = async (portalId, companyId, reasonPayload, eventType = "") => {
    const startTime = Date.now();

    const portal = await getPortalByPortalId(portalId);
    if (!portal || !portal.accessToken) {
        throw new Error("Portal or access token not found");
    }

    // Sync the changed object locally before recalculating
    const client = getHubSpotClient(portal.accessToken);
    const prisma = require("../db");

    try {
        if (eventType.includes('deal') || eventType === 'deal') {
            const deal = await client.crm.deals.basicApi.getById(reasonPayload.objectId || reasonPayload.dealId, ["dealname", "amount", "dealstage", "closedate"]);
            await prisma.deal.upsert({
                where: { portalId_dealId_companyId: { portalId, dealId: deal.id, companyId } },
                update: { 
                    amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
                    stage: deal.properties.dealstage,
                    closeDate: deal.properties.closedate ? new Date(deal.properties.closedate) : null
                },
                create: {
                    portalId, companyId, dealId: deal.id,
                    amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
                    stage: deal.properties.dealstage,
                    closeDate: deal.properties.closedate ? new Date(deal.properties.closedate) : null
                }
            });
        } else if (eventType.includes('ticket') || eventType === 'ticket') {
            const ticket = await client.crm.tickets.basicApi.getById(reasonPayload.objectId || reasonPayload.ticketId, ["subject", "hs_pipeline_stage", "hs_ticket_priority", "createdate"]);
            await prisma.ticket.upsert({
                where: { portalId_ticketId_companyId: { portalId, ticketId: ticket.id, companyId } },
                update: { 
                    subject: ticket.properties.subject,
                    stage: ticket.properties.hs_pipeline_stage,
                    priority: ticket.properties.hs_ticket_priority,
                    createdDate: ticket.properties.createdate ? new Date(ticket.properties.createdate) : null
                },
                create: {
                    portalId, companyId, ticketId: ticket.id,
                    subject: ticket.properties.subject,
                    stage: ticket.properties.hs_pipeline_stage,
                    priority: ticket.properties.hs_ticket_priority,
                    createdDate: ticket.properties.createdate ? new Date(ticket.properties.createdate) : null
                }
            });
        }
    } catch (e) {
        console.error(`[Recalculation Service] Failed to sync object ${reasonPayload?.objectId}:`, e.message);
    }

    const { buildCompanyDataLocally } = require("./localDataBuilder");
    const companyData = await buildCompanyDataLocally(portalId, companyId);

    if (!companyData) {
        console.log(`Recalculation ignored: Company ${companyId} not found in HubSpot.`);
        return;
    }

    // Fetch existing CompanyHealth record
    const existingHealth = await getCompanyHealth(portalId, companyId);
    const previousScore = existingHealth ? existingHealth.score : 100;
    const previousRiskLevel = existingHealth ? existingHealth.riskLevel : null;

    // Run health engine with previousScore for slope limiting
    const settings = await getSettingsByPortalId(portalId) || {};
    const healthResult = await healthEngine.calculateHealthScore(companyData, settings, previousScore);
    const newScore = healthResult.score;
    const riskLevel = riskService.getRiskLevel(newScore, settings);
    const recommendations = recommendationService.getRecommendations(companyData);

    let updatedHealth;

    // Optimize DB Writes: Only update if changed
    if (existingHealth) {
        if (newScore !== previousScore || riskLevel !== previousRiskLevel || (companyData.hubspotCreatedAt && !existingHealth.hubspotCreatedAt)) {
            updatedHealth = await updateCompanyHealth(portalId, companyId, {
                score: newScore,
                riskLevel,
                companyName: companyData.companyName,
                hubspotCreatedAt: companyData.hubspotCreatedAt,
                lastCalculatedAt: new Date(),
            });
        } else {
            updatedHealth = existingHealth;
        }
    } else {
        updatedHealth = await createCompanyHealth({
            portalId,
            companyId,
            companyName: companyData.companyName,
            score: newScore,
            riskLevel,
            hubspotCreatedAt: companyData.hubspotCreatedAt,
            lastCalculatedAt: new Date(),
        });
    }

    // Optimize History Writes: Only insert if meaningful delta
    if (!existingHealth || Math.abs(newScore - previousScore) >= 3) {
        await createHistory({
            companyHealthId: updatedHealth.id,
            previousScore,
            newScore,
            reason: reasonPayload || {},
        });
        
        // Emitting App Events only when there is a meaningful change
        await appEventService.emitAppEvent(portalId, portal.accessToken, "account.health.recalculated", companyId, {
            healthScore: newScore,
            riskLevel: riskLevel,
            source: eventType ? `event_${eventType}` : "auto_recalculation"
        });

        if (previousScore - newScore >= 15) {
            await appEventService.emitAppEvent(portalId, portal.accessToken, "account.health.risk_escalated", companyId, {
                previousScore: previousScore,
                newScore: newScore,
                riskLevel: riskLevel
            });
        }
    }
    
    // Push data to HubSpot Custom App Object (account_health)
    try {
        // Attempt to sync to custom object (assuming 'account_health' is the object type ID or name)
        // This is a naive attempt, in a real app you might need to query for an existing object and update it.
        await client.crm.objects.basicApi.create("account_health", {
            properties: {
                company_id: companyId.toString(),
                health_score: newScore.toString(),
                risk_level: riskLevel,
                deal_health_score: healthResult.dealHealth.toString(),
                ticket_health_score: healthResult.ticketHealth.toString(),
                engagement_health_score: healthResult.engagementHealth.toString(),
                trend_direction: healthResult.trendDirection,
                last_calculated_at: new Date().toISOString()
            }
        });
    } catch (e) {
        // Log but don't fail, schema might not be deployed yet in sandbox
        console.error(`[Recalculation Service] Failed to push to account_health custom object for company ${companyId}:`, e.message);
    }

    // Log time taken
    console.log(`[Metrics] recalcTime: ${Date.now() - startTime}ms`);

    return { updatedHealth, healthResult };
};

module.exports = {
    identifyCompanyId,
    recalculateForCompany,
};
