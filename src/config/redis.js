const Redis = require("ioredis");

const redisConfig = {
    maxRetriesPerRequest: null,
};

const connection = process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL, redisConfig)
    : new Redis({
        ...redisConfig,
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
    });

module.exports = connection;
