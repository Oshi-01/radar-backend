const { getHubSpotClient } = require("../../config/hubspotClient");

const withRetry = async (fn, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = e.code === 429 || e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'));
            if (is429 && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i);
                console.log(`[EngagementService] Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw e;
            }
        }
    }
};

const fetchAllPages = async (hubspotClient, apiObj, properties, associations) => {
    let all = [];
    let after = undefined;

    do {
        const response = await withRetry(() =>
            apiObj.basicApi.getPage(100, after, properties, undefined, associations)
        );
        all = all.concat(response.results);
        after = response.paging?.next?.after;

        if (after) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    } while (after);

    return all;
};

const fetchEngagements = async (accessToken) => {
    const hubspotClient = getHubSpotClient(accessToken);
    try {
        const engagements = [];

        if (hubspotClient.crm.objects.meetings) {
            const meetings = await fetchAllPages(
                hubspotClient,
                hubspotClient.crm.objects.meetings,
                ["hs_meeting_title", "hs_createdate", "hs_timestamp"],
                ["company"]
            );
            engagements.push(...meetings);
        }

        if (hubspotClient.crm.objects.emails) {
            const emails = await fetchAllPages(
                hubspotClient,
                hubspotClient.crm.objects.emails,
                ["hs_email_subject", "hs_createdate", "hs_timestamp"],
                ["company"]
            );
            engagements.push(...emails);
        }

        return engagements;
    } catch (error) {
        console.error("[EngagementService] Error fetching engagements:", error.message);
        return [];
    }
};

module.exports = {
    fetchEngagements,
};
