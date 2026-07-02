const { getValidAccessToken } = require("./oauthService");
const companyService = require("./hubspot/companyService");
const dealService = require("./hubspot/dealService");
const ticketService = require("./hubspot/ticketService");
const engagementService = require("./hubspot/engagementService");
const contactService = require("./hubspot/contactService");
const { buildHealthSignals } = require("./healthDataBuilder");

const syncPortalData = async (portalId) => {
    const accessToken = await getValidAccessToken(portalId);
    console.log(`[SyncData] Got valid access token for portal ${portalId}`);

    // Fetch sequentially to avoid rate limit collisions on large portals
    console.log(`[SyncData] Fetching companies...`);
    const companies = await companyService.fetchCompanies(accessToken);
    console.log(`[SyncData] Fetched ${companies.length} companies`);

    console.log(`[SyncData] Fetching deals...`);
    const deals = await dealService.fetchDeals(accessToken);
    console.log(`[SyncData] Fetched ${deals.length} deals`);

    console.log(`[SyncData] Fetching tickets...`);
    const tickets = await ticketService.fetchTickets(accessToken);
    console.log(`[SyncData] Fetched ${tickets.length} tickets`);

    console.log(`[SyncData] Fetching engagements...`);
    const engagements = await engagementService.fetchEngagements(accessToken);
    console.log(`[SyncData] Fetched ${engagements.length} engagements`);

    console.log(`[SyncData] Fetching contacts...`);
    const contacts = await contactService.fetchContacts(accessToken);
    console.log(`[SyncData] Fetched ${contacts.length} contacts`);

    const healthSignals = buildHealthSignals(companies, deals, tickets, engagements, contacts);
    console.log(`[SyncData] Built ${healthSignals.length} health signals`);

    return healthSignals;
};

module.exports = {
    syncPortalData,
};
