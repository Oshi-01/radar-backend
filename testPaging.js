require("dotenv").config();
const { getValidAccessToken } = require("./src/services/oauthService");
const { getHubSpotClient } = require("./src/config/hubspotClient");

async function test() {
    const portalId = "48478135";
    const accessToken = await getValidAccessToken(portalId);
    const hubspotClient = getHubSpotClient(accessToken);
    const response = await hubspotClient.crm.companies.basicApi.getPage(
        100,
        undefined,
        ["name", "domain", "industry", "createdate", "hs_createdate"]
    );
    console.log("Paging object:", JSON.stringify(response.paging, null, 2));
}
test();
