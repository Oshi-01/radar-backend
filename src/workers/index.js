const recalculationWorker = require("./recalculationWorker");
const syncWorker = require("./syncWorker");
const scoreWorker = require("./scoreWorker");

const startWorkers = () => {
    console.log("BullMQ Workers started and listening for jobs...");
    scoreWorker.startScoreWorker();
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('Shutting down workers...');
        await recalculationWorker.close();
        await syncWorker.close();
        scoreWorker.close();
        process.exit(0);
    });
};

module.exports = {
    startWorkers,
};
