const Redis = require("ioredis");

const redisConfig = {
    maxRetriesPerRequest: null,
    family: 0,
    enableReadyCheck: false,
    connectTimeout: 30000, // 30 seconds timeout (free tier can be slow)
    retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
    },
};

// If the URL is "rediss://" (Secure TLS), allow unauthorized certs for Render
if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith("rediss://")) {
    redisConfig.tls = {
        rejectUnauthorized: false,
    };
}

const connection = process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL, redisConfig)
    : new Redis({
        ...redisConfig,
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
    });

connection.on("connect", () => console.log("[Redis] Connected successfully"));
connection.on("error", (err) => console.log("[Redis] Connection error:", err.message));

module.exports = connection;
