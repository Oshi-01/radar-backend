const prisma = require("../db");
const { buildCompanyDataLocally } = require("../services/localDataBuilder");
const healthEngine = require("../services/healthEngine");
const riskService = require("../services/riskService");

const BATCH_SIZE = 50; // We can process much faster now!
const DELAY_BETWEEN_BATCHES = 500; // Small delay to let event loop breathe

let isRunning = false;
let timeoutId = null;

const processPendingScores = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
        // Find companies with pending scores
        const pendingCompanies = await prisma.companyHealth.findMany({
            where: {
                score: null,
            },
            take: BATCH_SIZE,
            orderBy: {
                createdAt: "asc" // process oldest first
            }
        });

        if (pendingCompanies.length === 0) {
            // Nothing to process, back off for a bit
            isRunning = false;
            timeoutId = setTimeout(processPendingScores, 10000);
            return;
        }

        console.log(`[Score Worker] Processing batch of ${pendingCompanies.length} pending scores...`);

        for (const company of pendingCompanies) {
            try {
                const settings = await prisma.settings.findUnique({ where: { portalId: company.portalId } }) || {};

                // Fetch context locally!
                const companyData = await buildCompanyDataLocally(company.portalId, company.companyId);
                
                // If it successfully built context, calculate score
                if (companyData) {
                    const healthResult = await healthEngine.calculateHealthScore(companyData, settings, company.score);
                    const newScore = healthResult.score;
                    const riskLevel = riskService.getRiskLevel(newScore);

                    await prisma.companyHealth.update({
                        where: { id: company.id },
                        data: {
                            score: newScore,
                            riskLevel: riskLevel,
                            lastCalculatedAt: new Date()
                        }
                    });
                }
            } catch (err) {
                console.error(`[Score Worker] Error processing company ${company.companyId}:`, err.message);
            }
        }

        // Delay to let event loop breathe before grabbing the next batch
        isRunning = false;
        timeoutId = setTimeout(processPendingScores, DELAY_BETWEEN_BATCHES);

    } catch (error) {
        console.error(`[Score Worker] Fatal error in loop:`, error.message);
        isRunning = false;
        timeoutId = setTimeout(processPendingScores, 10000); // Back off
    }
};

const startScoreWorker = () => {
    console.log("[Score Worker] Started polling for pending companies...");
    processPendingScores();
};

const close = () => {
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
};

module.exports = {
    startScoreWorker,
    close
};
