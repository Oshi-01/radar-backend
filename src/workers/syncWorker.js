const { Worker } = require("bullmq");
const redisConnection = require("../config/redis");
const { getValidAccessToken } = require("../services/oauthService");
const { getHubSpotClient } = require("../config/hubspotClient");
const prisma = require("../db");

// Retry helper for rate limits
const withRetry = async (fn, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = e.code === 429 || e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'));
            if (is429 && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i);
                console.log(`[Sync Worker] Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw e;
            }
        }
    }
};

const extractCompanyIds = (associations) => {
    if (!associations || !associations.companies || !associations.companies.results) return [];
    return associations.companies.results.map(r => r.id);
};

const syncCompanies = async (hubspotClient, portalId) => {
    console.log(`[Sync Worker] Syncing companies for portal ${portalId}...`);
    let after = undefined;
    let totalProcessed = 0;
    do {
        const response = await withRetry(() =>
            hubspotClient.crm.companies.basicApi.getPage(100, after, ["name", "domain", "industry", "createdate", "hs_createdate"])
        );
        after = response.paging?.next?.after;
        for (const company of response.results) {
            try {
                const companyName = company.properties.name || "Unknown Company";
                const hubspotCreatedAt = company.properties.hs_createdate 
                    ? new Date(company.properties.hs_createdate) 
                    : (company.properties.createdate ? new Date(company.properties.createdate) : null);

                await prisma.companyHealth.upsert({
                    where: { portalId_companyId: { portalId, companyId: company.id } },
                    update: { companyName, hubspotCreatedAt, score: null, lastCalculatedAt: null, riskLevel: "pending" },
                    create: { portalId, companyId: company.id, companyName, score: null, riskLevel: "pending", hubspotCreatedAt, lastCalculatedAt: null }
                });
                totalProcessed++;
            } catch (err) {}
        }
        if (after) await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
    return totalProcessed;
};

const syncDeals = async (hubspotClient, portalId) => {
    console.log(`[Sync Worker] Syncing deals for portal ${portalId}...`);
    let after = undefined;
    do {
        const response = await withRetry(() =>
            hubspotClient.crm.deals.basicApi.getPage(100, after, ["dealname", "amount", "dealstage", "closedate", "hs_lastmodifieddate"], undefined, ["companies"])
        );
        after = response.paging?.next?.after;
        for (const deal of response.results) {
            const companyIds = extractCompanyIds(deal.associations);
            for (const cId of companyIds) {
                try {
                    await prisma.deal.upsert({
                        where: { portalId_dealId_companyId: { portalId, dealId: deal.id, companyId: cId } },
                        update: { 
                            amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
                            stage: deal.properties.dealstage,
                            closeDate: deal.properties.closedate ? new Date(deal.properties.closedate) : null,
                            lastModifiedDate: deal.properties.hs_lastmodifieddate ? new Date(deal.properties.hs_lastmodifieddate) : null
                        },
                        create: {
                            portalId, companyId: cId, dealId: deal.id,
                            amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
                            stage: deal.properties.dealstage,
                            closeDate: deal.properties.closedate ? new Date(deal.properties.closedate) : null,
                            lastModifiedDate: deal.properties.hs_lastmodifieddate ? new Date(deal.properties.hs_lastmodifieddate) : null
                        }
                    });
                } catch(e) {}
            }
        }
        if (after) await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
};

const syncTickets = async (hubspotClient, portalId) => {
    console.log(`[Sync Worker] Syncing tickets for portal ${portalId}...`);
    let after = undefined;
    do {
        const response = await withRetry(() =>
            hubspotClient.crm.tickets.basicApi.getPage(100, after, ["subject", "hs_pipeline_stage", "hs_ticket_priority", "createdate"], undefined, ["companies"])
        );
        after = response.paging?.next?.after;
        for (const ticket of response.results) {
            const companyIds = extractCompanyIds(ticket.associations);
            for (const cId of companyIds) {
                try {
                    await prisma.ticket.upsert({
                        where: { portalId_ticketId_companyId: { portalId, ticketId: ticket.id, companyId: cId } },
                        update: { 
                            subject: ticket.properties.subject,
                            stage: ticket.properties.hs_pipeline_stage,
                            priority: ticket.properties.hs_ticket_priority,
                            createdDate: ticket.properties.createdate ? new Date(ticket.properties.createdate) : null
                        },
                        create: {
                            portalId, companyId: cId, ticketId: ticket.id,
                            subject: ticket.properties.subject,
                            stage: ticket.properties.hs_pipeline_stage,
                            priority: ticket.properties.hs_ticket_priority,
                            createdDate: ticket.properties.createdate ? new Date(ticket.properties.createdate) : null
                        }
                    });
                } catch(e) {}
            }
        }
        if (after) await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
};

const syncEngagements = async (hubspotClient, portalId) => {
    console.log(`[Sync Worker] Syncing engagements for portal ${portalId}...`);
    
    // Meetings
    if (hubspotClient.crm.objects.meetings) {
        let after = undefined;
        do {
            const response = await withRetry(() =>
                hubspotClient.crm.objects.meetings.basicApi.getPage(100, after, ["hs_createdate", "hs_timestamp"], undefined, ["companies"])
            );
            after = response.paging?.next?.after;
            for (const meeting of response.results) {
                const companyIds = extractCompanyIds(meeting.associations);
                for (const cId of companyIds) {
                    try {
                        await prisma.engagement.upsert({
                            where: { portalId_engagementId_companyId: { portalId, engagementId: meeting.id, companyId: cId } },
                            update: { type: "MEETING", timestamp: meeting.properties.hs_timestamp ? new Date(meeting.properties.hs_timestamp) : (meeting.properties.hs_createdate ? new Date(meeting.properties.hs_createdate) : null) },
                            create: { portalId, companyId: cId, engagementId: meeting.id, type: "MEETING", timestamp: meeting.properties.hs_timestamp ? new Date(meeting.properties.hs_timestamp) : (meeting.properties.hs_createdate ? new Date(meeting.properties.hs_createdate) : null) }
                        });
                    } catch(e) {}
                }
            }
            if (after) await new Promise(resolve => setTimeout(resolve, 150));
        } while (after);
    }

    // Emails
    if (hubspotClient.crm.objects.emails) {
        let after = undefined;
        do {
            const response = await withRetry(() =>
                hubspotClient.crm.objects.emails.basicApi.getPage(100, after, ["hs_createdate", "hs_timestamp"], undefined, ["companies"])
            );
            after = response.paging?.next?.after;
            for (const email of response.results) {
                const companyIds = extractCompanyIds(email.associations);
                for (const cId of companyIds) {
                    try {
                        await prisma.engagement.upsert({
                            where: { portalId_engagementId_companyId: { portalId, engagementId: email.id, companyId: cId } },
                            update: { type: "EMAIL", timestamp: email.properties.hs_timestamp ? new Date(email.properties.hs_timestamp) : (email.properties.hs_createdate ? new Date(email.properties.hs_createdate) : null) },
                            create: { portalId, companyId: cId, engagementId: email.id, type: "EMAIL", timestamp: email.properties.hs_timestamp ? new Date(email.properties.hs_timestamp) : (email.properties.hs_createdate ? new Date(email.properties.hs_createdate) : null) }
                        });
                    } catch(e) {}
                }
            }
            if (after) await new Promise(resolve => setTimeout(resolve, 150));
        } while (after);
    }
};

const syncContacts = async (hubspotClient, portalId) => {
    console.log(`[Sync Worker] Syncing contacts for portal ${portalId}...`);
    let after = undefined;
    do {
        const response = await withRetry(() =>
            hubspotClient.crm.contacts.basicApi.getPage(100, after, ["firstname", "lastname"], undefined, ["companies"])
        );
        after = response.paging?.next?.after;
        for (const contact of response.results) {
            const companyIds = extractCompanyIds(contact.associations);
            for (const cId of companyIds) {
                try {
                    await prisma.contact.upsert({
                        where: { portalId_contactId_companyId: { portalId, contactId: contact.id, companyId: cId } },
                        update: {},
                        create: { portalId, companyId: cId, contactId: contact.id }
                    });
                } catch(e) {}
            }
        }
        if (after) await new Promise(resolve => setTimeout(resolve, 150));
    } while (after);
};

const syncWorker = new Worker("portal-sync", async (job) => {
    const { portalId } = job.data;
    console.log(`[Sync Worker] Starting full bulk sync for portal ${portalId}...`);

    try {
        const accessToken = await getValidAccessToken(portalId);
        const hubspotClient = getHubSpotClient(accessToken);

        // We could report progress more granularly, but this is a background job
        await job.updateProgress(10);
        await syncCompanies(hubspotClient, portalId);
        
        await job.updateProgress(40);
        await syncDeals(hubspotClient, portalId);
        
        await job.updateProgress(60);
        await syncTickets(hubspotClient, portalId);
        
        await job.updateProgress(80);
        try {
            await syncEngagements(hubspotClient, portalId);
        } catch(e) {
            console.log(`[Sync Worker] Scopes for engagements missing or failed, continuing...`, e.message);
        }

        await job.updateProgress(90);
        await syncContacts(hubspotClient, portalId);

        await job.updateProgress(100);
        console.log(`[Sync Worker] Completed full sync for portal ${portalId}.`);

        // We can now trigger the scoreWorker to rapidly calculate scores 
        // since the data is local! It will do it naturally through the polling loop.

        return { success: true };
    } catch (error) {
        console.error(`[Sync Worker] Error syncing portal ${portalId}:`, error);
        throw error;
    }
}, {
    connection: redisConnection,
    concurrency: 1,
});

syncWorker.on('failed', (job, err) => {
    console.error(`[Sync Worker] Job ${job?.id} failed with error:`, err.message);
});

module.exports = syncWorker;
