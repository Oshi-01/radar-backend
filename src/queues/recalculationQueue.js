const { Queue } = require("bullmq");
const redisConnection = require("../config/redis");
const { logEvent } = require("../utils/performanceLogger");

const queueName = "health-recalculation";

const recalculationQueue = new Queue(queueName, {
    connection: redisConnection,
});

const addRecalculationJob = async (payload) => {
    const { portalId, companyId } = payload;
    
    const throttleKey = `recalculation:throttle:${portalId}:${companyId}`;
    
    // Set throttle window of 60 seconds
    const result = await redisConnection.set(throttleKey, "queued", "EX", 60, "NX");
    
    if (!result) {
        await logEvent("skippedJobs");
        console.log(`[Queue] Skipped recalculation for company ${companyId} (throttled)`);
        return null;
    }

    await logEvent("queuedJobs");

    const jobId = `recalc-${companyId}-${Date.now()}`;

    return recalculationQueue.add("recalculate", payload, {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
    });
};

module.exports = {
    recalculationQueue,
    addRecalculationJob,
};
