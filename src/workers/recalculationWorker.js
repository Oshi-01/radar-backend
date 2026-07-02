const { Worker } = require("bullmq");
const redisConnection = require("../config/redis");
const { recalculateForCompany } = require("../services/recalculationService");

// In-memory buffer for intelligent job coalescing
const jobBuffer = new Map();

const worker = new Worker("health-recalculation", async (job) => {
    const { portalId, companyId, reasonPayload, objectType } = job.data;
    const eventType = objectType || "";
    
    return new Promise((resolve, reject) => {
        if (jobBuffer.has(companyId)) {
            // Overwrite with latest job, discard older one
            clearTimeout(jobBuffer.get(companyId).timeout);
            console.log(`[Worker] Coalesced redundant job for company ${companyId}`);
        }

        const timeout = setTimeout(async () => {
            jobBuffer.delete(companyId);
            console.log(`[Worker] Processing recalculation job for portal ${portalId}, company ${companyId}`);
            try {
                await recalculateForCompany(portalId, companyId, reasonPayload, eventType);
                console.log(`[Worker] Successfully recalculated health for company ${companyId}`);
                resolve();
            } catch (error) {
                console.error(`[Worker] Error recalculating health for company ${companyId}:`, error);
                reject(error);
            }
        }, 5000); // 5 second debounce window

        jobBuffer.set(companyId, { timeout });
    });

}, {
    connection: redisConnection,
    concurrency: 1,
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});

module.exports = worker;
