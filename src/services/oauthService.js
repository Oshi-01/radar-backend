const { getHubSpotClient } = require("../config/hubspotClient");
const { upsertPortal, getPortalByPortalId } = require("../repositories/portalRepository");

const REQUIRED_SCOPES = [
    "crm.schemas.deals.read",
    "timeline",
    "oauth",
    "tickets",
    "crm.objects.companies.read",
    "crm.objects.deals.read",
    "crm.schemas.contacts.read",
    "crm.objects.contacts.read",
    "crm.schemas.companies.read"
];

const getAuthorizationUrl = (state) => {
    // Append state parameter to the existing redirect URI
    let authUrl = process.env.HUBSPOT_REDIRECT_URI;
    if (state) {
        authUrl += `&state=${encodeURIComponent(state)}`;
    }
    return authUrl;
};

const handleCallback = async (code) => {
    const hubspotClient = getHubSpotClient();
    const CALLBACK_URL = process.env.CALLBACK_URL || "http://localhost:8000/api/hubspot/oauth/callback";

    try {
        const tokenResponse = await hubspotClient.oauth.tokensApi.create(
            "authorization_code",
            code,
            CALLBACK_URL,
            process.env.HUBSPOT_CLIENT_ID,
            process.env.HUBSPOT_CLIENT_SECRET
        );

        const { accessToken, refreshToken, expiresIn } = tokenResponse;
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        // Get the hub_id using the access token
        const hubspotClientWithToken = getHubSpotClient(accessToken);
        const accessTokenInfo = await hubspotClientWithToken.oauth.accessTokensApi.get(accessToken);
        const hubId = String(accessTokenInfo.hubId || accessTokenInfo.hub_id);
        const installerEmail = accessTokenInfo.user;
        const hubDomain = accessTokenInfo.hubDomain;
        
        // Scope validation
        if (accessTokenInfo.scopes) {
            const grantedScopes = accessTokenInfo.scopes;
            const missingScopes = REQUIRED_SCOPES.filter(scope => !grantedScopes.includes(scope));
            if (missingScopes.length > 0) {
                console.error(`Missing required scopes: ${missingScopes.join(", ")}`);
                throw new Error("Missing required scopes");
            }
        }

        await upsertPortal(hubId, {
            accessToken,
            refreshToken,
            expiresAt,
            hubId,
            installerEmail,
            hubDomain,
        });

        return { hubId };
    } catch (error) {
        console.error("Error exchanging token or saving portal:", error.message);
        throw error;
    }
};

const getValidAccessToken = async (portalId) => {
    const portal = await getPortalByPortalId(portalId);
    if (!portal || !portal.refreshToken) {
        throw new Error("Portal not found or missing refresh token");
    }

    // Refresh if expiring in the next 5 minutes
    const isExpired = !portal.expiresAt || portal.expiresAt <= new Date(Date.now() + 5 * 60 * 1000);
    
    if (!isExpired) {
        return portal.accessToken;
    }

    const hubspotClient = getHubSpotClient();
    try {
        console.log(`Refreshing access token for portal ${portalId}`);
        const tokenResponse = await hubspotClient.oauth.tokensApi.create(
            "refresh_token",
            undefined,
            undefined,
            process.env.HUBSPOT_CLIENT_ID,
            process.env.HUBSPOT_CLIENT_SECRET,
            portal.refreshToken
        );

        const { accessToken, refreshToken, expiresIn } = tokenResponse;
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        await upsertPortal(portalId, {
            accessToken,
            refreshToken: refreshToken || portal.refreshToken,
            expiresAt,
            hubId: portalId
        });

        return accessToken;
    } catch (error) {
        console.error("Error refreshing token:", error.message);
        // Handle revoked tokens gracefully
        if (error.code === 400 || error.code === 401 || (error.response && (error.response.status === 400 || error.response.status === 401))) {
            console.error(`Refresh token invalid for portal ${portalId}, marking as disconnected.`);
            await upsertPortal(portalId, {
                accessToken: null,
                refreshToken: null,
            });
            throw new Error("Refresh token revoked or invalid. Portal disconnected.");
        }
        throw error;
    }
};

module.exports = {
    getAuthorizationUrl,
    handleCallback,
    getValidAccessToken
};