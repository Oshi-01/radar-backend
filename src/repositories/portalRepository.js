const prisma = require("../db");
const { encryptToken, decryptToken } = require("../utils/encryption");

const createPortal = async (data) => {
    const encryptedData = { ...data };
    if (encryptedData.accessToken) encryptedData.accessToken = encryptToken(encryptedData.accessToken);
    if (encryptedData.refreshToken) encryptedData.refreshToken = encryptToken(encryptedData.refreshToken);
    
    return prisma.portal.create({
        data: encryptedData,
    });
};

const getPortalByPortalId = async (portalId) => {
    const portal = await prisma.portal.findUnique({
        where: {
            portalId,
        },
    });
    
    if (portal) {
        if (portal.accessToken) portal.accessToken = decryptToken(portal.accessToken);
        if (portal.refreshToken) portal.refreshToken = decryptToken(portal.refreshToken);
    }
    
    return portal;
};

const upsertPortal = async (portalId, data) => {
    const encryptedData = { ...data };
    if (encryptedData.accessToken) encryptedData.accessToken = encryptToken(encryptedData.accessToken);
    if (encryptedData.refreshToken) encryptedData.refreshToken = encryptToken(encryptedData.refreshToken);

    return prisma.portal.upsert({
        where: {
            portalId,
        },
        update: encryptedData,
        create: {
            portalId,
            ...encryptedData,
        },
    });
};

module.exports = {
    createPortal,
    getPortalByPortalId,
    upsertPortal,
};