const prisma = require("../db");

const getSettingsByPortalId = async (portalId) => {
    return prisma.settings.findUnique({
        where: {
            portalId,
        },
    });
};

const createSettings = async (data) => {
    return prisma.settings.create({
        data,
    });
};

const updateSettings = async (portalId, data) => {
    return prisma.settings.update({
        where: {
            portalId,
        },
        data,
    });
};

module.exports = {
    getSettingsByPortalId,
    createSettings,
    updateSettings,
};