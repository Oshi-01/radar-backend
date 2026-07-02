const { getHubSpotClient } = require("../../config/hubspotClient");

const withRetry = async (fn, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = e.code === 429 || e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'));
            if (is429 && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i);
                console.log(`[DealService] Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw e;
            }
        }
    }
};

const fetchDeals = async (accessToken) => {
    const hubspotClient = getHubSpotClient(accessToken);
    let allDeals = [];
    let after = undefined;

    try {
        do {
            const response = await withRetry(() =>
                hubspotClient.crm.deals.basicApi.getPage(
                    100,
                    after,
                    ["dealname", "dealstage", "amount", "closedate"],
                    undefined,
                    ["company"]
                )
            );
            allDeals = allDeals.concat(response.results);
            after = response.paging?.next?.after;

            if (after) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        } while (after);

        return allDeals;
    } catch (error) {
        console.error("[DealService] Error fetching deals:", error.message);
        if (allDeals.length > 0) return allDeals;
        throw error;
    }
};

module.exports = {
    fetchDeals,
};
