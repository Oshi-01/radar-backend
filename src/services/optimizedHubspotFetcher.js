const { getHubSpotClient } = require("../config/hubspotClient");
const { logEvent } = require("../utils/performanceLogger");

// Helper to handle rate limits (429)
const withRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'))) {
                console.log(`[HubSpot Rate Limit] Hit 429, retrying in ${1000 * (i + 1)}ms...`);
                await new Promise(res => setTimeout(res, 1000 * (i + 1)));
            } else {
                throw e;
            }
        }
    }
    return await fn(); // Final attempt
};

const fetchCompanyDeals = async (accessToken, companyId) => {
    await logEvent("hubspotApiCall");
    const client = getHubSpotClient(accessToken);
    const response = await withRetry(() => client.crm.deals.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: "associations.company", operator: "EQ", value: String(companyId) }] }],
        properties: ["dealname", "dealstage", "amount", "closedate"],
        limit: 100
    }));
    return response.results;
};

const fetchCompanyTickets = async (accessToken, companyId) => {
    await logEvent("hubspotApiCall");
    const client = getHubSpotClient(accessToken);
    const response = await withRetry(() => client.crm.tickets.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: "associations.company", operator: "EQ", value: String(companyId) }] }],
        properties: ["subject", "hs_pipeline_stage", "hs_ticket_priority", "createdate"],
        limit: 100
    }));
    return response.results;
};

const fetchCompanyEngagements = async (accessToken, companyId) => {
    const client = getHubSpotClient(accessToken);
    const engagements = [];

    const searchRequest = {
        filterGroups: [{ filters: [{ propertyName: "associations.company", operator: "EQ", value: String(companyId) }] }],
        properties: ["hs_createdate", "hs_timestamp"],
        limit: 100
    };

    if (client.crm.objects.meetings) {
        await logEvent("hubspotApiCall");
        try {
            const res = await withRetry(() => client.crm.objects.meetings.searchApi.doSearch(searchRequest));
            engagements.push(...res.results);
        } catch(e) {}
    }

    if (client.crm.objects.emails) {
        await new Promise(r => setTimeout(r, 200));
        await logEvent("hubspotApiCall");
        try {
            const res = await withRetry(() => client.crm.objects.emails.searchApi.doSearch(searchRequest));
            engagements.push(...res.results);
        } catch(e) {}
    }

    return engagements;
};

const fetchSingleCompany = async (accessToken, companyId) => {
    await logEvent("hubspotApiCall");
    const client = getHubSpotClient(accessToken);
    return withRetry(() => client.crm.companies.basicApi.getById(companyId, ["name", "domain", "industry", "createdate", "hs_createdate"]));
};

const fetchCompanyContacts = async (accessToken, companyId) => {
    await logEvent("hubspotApiCall");
    const client = getHubSpotClient(accessToken);
    const response = await withRetry(() => client.crm.contacts.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: "associations.company", operator: "EQ", value: String(companyId) }] }],
        properties: ["firstname", "lastname", "email", "createdate"],
        limit: 100
    }));
    return response.results;
};

module.exports = {
    fetchCompanyDeals,
    fetchCompanyTickets,
    fetchCompanyEngagements,
    fetchSingleCompany,
    fetchCompanyContacts
};
