const prisma = require("../db");

const getHealth = async (req, res) => {
    try {
        // Query to check if the database is reachable
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: "success", message: "Database connection is healthy!" });
    } catch (error) {
        console.error("Database connection error:", error);
        res.status(500).json({ status: "error", message: "Database connection failed", error: error.message });
    }
};

module.exports = {
    getHealth
};
