const redis = require("../config/redis");

const logEvent = async (event, count = 1) => {
    try {
        const key = `metrics:${event}`;
        await redis.incrby(key, count);
        console.log(`[Metrics] ${event}: +${count}`);
    } catch (e) {
        console.error("Failed to log metric", e);
    }
};

module.exports = {
    logEvent
};
