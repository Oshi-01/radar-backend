const { getCompanyFullDetail } = require("../services/companyDetailService");
const prisma = require("../db");

const getCompanyFull = async (req, res) => {
    try {
        const { companyId } = req.params;
        const portalId = req.query.portalId;

        if (!portalId) {
            return res.status(400).json({ error: "portalId is required in query" });
        }

        const data = await getCompanyFullDetail(portalId, companyId);
        return res.json(data);
    } catch (error) {
        console.error("Error fetching company detail:", error.message);
        return res.status(500).json({ error: "Failed to fetch company detail", details: error.message, stack: error.stack });
    }
};

const getAllCompanies = async (req, res) => {
    try {
        const portalId = req.query.portalId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const risk = req.query.risk || "all";
        const sort = req.query.sort || "date_desc";

        if (!portalId) {
            return res.status(400).json({ error: "portalId is required in query" });
        }

        const whereClause = { portalId };
        
        if (search) {
            whereClause.companyName = {
                contains: search,
                mode: "insensitive"
            };
        }
        
        if (risk && risk !== "all") {
            whereClause.riskLevel = risk;
        }

        // Get aggregated stats
        const [total, healthy, warning, atRisk, scoreAggr] = await Promise.all([
            prisma.companyHealth.count({ where: whereClause }),
            prisma.companyHealth.count({ where: { ...whereClause, riskLevel: 'healthy' } }),
            prisma.companyHealth.count({ where: { ...whereClause, riskLevel: 'warning' } }),
            prisma.companyHealth.count({ where: { ...whereClause, riskLevel: 'at_risk' } }),
            prisma.companyHealth.aggregate({
                where: whereClause,
                _avg: { score: true }
            })
        ]);

        const avgScore = scoreAggr._avg.score ? Math.round(scoreAggr._avg.score) : 0;

        let orderBy = { updatedAt: "desc" };
        if (sort === "score_desc") orderBy = { score: "desc" };
        if (sort === "score_asc") orderBy = { score: "asc" };
        if (sort === "date_asc") orderBy = { updatedAt: "asc" };

        // Get paginated companies
        const companies = await prisma.companyHealth.findMany({
            where: whereClause,
            orderBy,
            skip,
            take: limit
        });

        return res.json({ 
            data: companies,
            metrics: {
                total,
                healthyCount: healthy,
                warningCount: warning,
                atRiskCount: atRisk,
                avgScore
            },
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching all companies:", error.message);
        return res.status(500).json({ error: "Failed to fetch companies", details: error.message });
    }
};

module.exports = {
    getCompanyFull,
    getAllCompanies
};
