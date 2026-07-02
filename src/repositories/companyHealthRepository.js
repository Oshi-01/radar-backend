const prisma = require("../db");

const getCompanyHealth = async (portalId, companyId) => {
    return prisma.companyHealth.findUnique({
        where: {
            portalId_companyId: {
                portalId,
                companyId,
            },
        },
    });
};

const createCompanyHealth = async (data) => {
    return prisma.companyHealth.create({
        data,
    });
};

const updateCompanyHealth = async (
    portalId,
    companyId,
    data
) => {
    return prisma.companyHealth.update({
        where: {
            portalId_companyId: {
                portalId,
                companyId,
            },
        },
        data,
    });
};

module.exports = {
    getCompanyHealth,
    createCompanyHealth,
    updateCompanyHealth,
};