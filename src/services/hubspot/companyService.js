const { getHubSpotClient } = require("../../config/hubspotClient");

// Retry helper for rate limiting
const withRetry = async (fn, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = e.code === 429 || e.response?.status === 429 || (e.message && e.message.includes('RATE_LIMIT'));
            if (is429 && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i); // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                console.log(`[CompanyService] Rate limited, retrying in ${delay}ms (attempt ${i + 1}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw e;
            }
        }
    }
};

const fetchCompanies = async (accessToken) => {
    const hubspotClient = getHubSpotClient(accessToken);
    let allCompanies = [];
    let after = undefined;
    let pageCount = 0;

    try {
        do {
            const response = await withRetry(() =>
                hubspotClient.crm.companies.basicApi.getPage(
                    100,
                    after,
                    ["name", "domain", "industry", "createdate", "hs_createdate"]
                )
            );
            allCompanies = allCompanies.concat(response.results);
            after = response.paging?.next?.after;
            pageCount++;

            if (pageCount % 50 === 0) {
                console.log(`[CompanyService] Fetched ${allCompanies.length} companies so far (page ${pageCount})...`);
            }

            // Throttle to avoid hitting the 100 requests per 10 seconds rate limit
            if (after) {
                await new Promise(resolve => setTimeout(resolve, 150)); 
            }
        } while (after);

        console.log(`[CompanyService] Finished fetching all ${allCompanies.length} companies in ${pageCount} pages.`);
        return allCompanies;
    } catch (error) {
        console.error(`[CompanyService] Error fetching companies after ${allCompanies.length} fetched:`, error.message);
        // Return what we have so far rather than losing everything
        if (allCompanies.length > 0) {
            console.log(`[CompanyService] Returning ${allCompanies.length} companies fetched before error.`);
            return allCompanies;
        }
        throw error;
    }
};

const searchCompanies = async (accessToken, query) => {
    const hubspotClient = getHubSpotClient(accessToken);
    try {
        const publicObjectSearchRequest = {
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: "name",
                            operator: "CONTAINS_TOKEN",
                            value: query
                        }
                    ]
                },
                {
                    filters: [
                        {
                            propertyName: "domain",
                            operator: "CONTAINS_TOKEN",
                            value: query
                        }
                    ]
                }
            ],
            properties: ["name", "domain", "industry"],
            limit: 10,
        };

        const response = await withRetry(() =>
            hubspotClient.crm.companies.searchApi.doSearch(publicObjectSearchRequest)
        );
        return response.results;
    } catch (error) {
        console.error("[CompanyService] Error searching companies:", error.message);
        throw error;
    }
};

module.exports = {
    fetchCompanies,
    searchCompanies,
};
