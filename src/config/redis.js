const Redis = require("ioredis");

const redisConfig = {
    maxRetriesPerRequest: null,
    family: 0, // Force IPv4/IPv6 auto-detection (fixes Render ETIMEDOUT on Node 18+)
};

const connection = process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL, redisConfig)
    : new Redis({
        ...redisConfig,
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
    });

module.exports = connection;
