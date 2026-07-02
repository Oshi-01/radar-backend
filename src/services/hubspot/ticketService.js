const { getHubSpotClient } = require("../../config/hubspotClient");

const withRetry = async (fn, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = e.code === 429 || e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'));
            if (is429 && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i);
                console.log(`[TicketService] Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw e;
            }
        }
    }
};

const fetchTickets = async (accessToken) => {
    const hubspotClient = getHubSpotClient(accessToken);
    let allTickets = [];
    let after = undefined;

    try {
        do {
            const response = await withRetry(() =>
                hubspotClient.crm.tickets.basicApi.getPage(
                    100,
                    after,
                    ["subject", "hs_pipeline_stage", "hs_ticket_priority", "createdate"],
                    undefined,
                    ["company"]
                )
            );
            allTickets = allTickets.concat(response.results);
            after = response.paging?.next?.after;

            if (after) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        } while (after);

        return allTickets;
    } catch (error) {
        console.error("[TicketService] Error fetching tickets:", error.message);
        if (allTickets.length > 0) return allTickets;
        throw error;
    }
};

module.exports = {
    fetchTickets,
};
