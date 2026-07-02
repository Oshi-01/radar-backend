const prisma = require("../db");

const createHistory = async (data) => {
    return prisma.healthHistory.create({
        data,
    });
};

const getHistoryByCompanyHealthId = async (
    companyHealthId
) => {
    return prisma.healthHistory.findMany({
        where: {
            companyHealthId,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
};

module.exports = {
    createHistory,
    getHistoryByCompanyHealthId,
};