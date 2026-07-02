const prisma = require("../db");

const createWebhookEvent = async (data) => {
    return prisma.webhookEvent.create({
        data,
    });
};

const markWebhookProcessed = async (id) => {
    return prisma.webhookEvent.update({
        where: {
            id,
        },
        data: {
            processed: true,
        },
    });
};

module.exports = {
    createWebhookEvent,
    markWebhookProcessed,
};