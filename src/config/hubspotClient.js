const hubspot = require("@hubspot/api-client");

const getHubSpotClient = (accessToken = null) => {
    const client = new hubspot.Client({
        accessToken: accessToken || undefined,
    });
    return client;
};

module.exports = {
    getHubSpotClient,
};