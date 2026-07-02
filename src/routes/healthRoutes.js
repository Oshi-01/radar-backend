const express = require("express");

const {
    calculateHealthScore,
} = require("../services/healthEngine");

const {
    getRiskLevel,
} = require("../services/riskService");

const router = express.Router();

router.get("/test", async (req, res) => {

    const mockCompany = {
        openTickets: 8,
        daysSinceMeeting: 45,
        daysUntilRenewal: 30,
    };

    const score = await calculateHealthScore(
        mockCompany
    );

    const riskLevel = getRiskLevel(score);

    return res.json({
        score,
        riskLevel,
    });
});

module.exports = router;