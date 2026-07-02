require("dotenv").config();
const { getValidAccessToken } = require("./src/services/oauthService");
const { getHubSpotClient } = require("./src/config/hubspotClient");
const healthEngine = require("./src/services/healthEngine");
const riskService = require("./src/services/riskService");
const prisma = require("./src/db");

async function test() {
    const portalId = "48478135";
    console.log(`Starting sync for portal ${portalId}...`);
    try {
        const accessToken = await getValidAccessToken(portalId);
        const hubspotClient = getHubSpotClient(accessToken);
        const settings = await prisma.settings.findUnique({ where: { portalId } }) || {};
        
        let after = undefined;
        console.log("Fetching first page of companies...");
        const response = await hubspotClient.crm.companies.basicApi.getPage(
            100,
            after,
            ["name", "domain", "industry", "createdate", "hs_createdate"]
        );
        const companies = response.results;
        console.log(`Fetched ${companies.length} companies. Saving to DB...`);
        
        let totalProcessed = 0;
        for (const company of companies) {
            try {
                const companyName = company.properties.name || "Unknown Company";
                const hubspotCreatedAt = company.properties.hs_createdate 
                    ? new Date(company.properties.hs_createdate) 
                    : (company.properties.createdate ? new Date(company.properties.createdate) : null);

                const signal = {
                    companyId: company.id,
                    companyName,
                    hubspotCreatedAt,
                    openTickets: 0,
                    activeDeals: 0,
                    daysSinceLastActivity: 365,
                    daysSinceMeeting: 365,
                    daysUntilRenewal: 365,
                };

                const newScore = await healthEngine.calculateHealthScore(signal, settings);
                const riskLevel = riskService.getRiskLevel(newScore);

                await prisma.companyHealth.upsert({
                    where: {
                        portalId_companyId: {
                            portalId,
                            companyId: company.id,
                        }
                    },
                    update: {
                        companyName,
                        score: newScore,
                        riskLevel,
                        hubspotCreatedAt,
                        lastCalculatedAt: new Date(),
                    },
                    create: {
                        portalId,
                        companyId: company.id,
                        companyName,
                        score: newScore,
                        riskLevel,
                        hubspotCreatedAt,
                        lastCalculatedAt: new Date(),
                    }
                });

                totalProcessed++;
                if (totalProcessed % 10 === 0) console.log(`Saved ${totalProcessed}...`);
            } catch (err) {
                console.error(`Error processing company ${company.id}:`, err.message);
            }
        }
        console.log("Upsert batch successful!");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
