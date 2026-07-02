const { Queue } = require("bullmq");
const redisConnection = require("../config/redis");

// Initialize queue
const syncQueue = new Queue("portal-sync", { connection: redisConnection });

const syncPortal = async (req, res) => {
    try {
        const { portalId } = req.params;
        
        // Push job to the queue
        await syncQueue.add("initial-sync", { portalId });
        
        // Return 202 Accepted immediately
        res.status(202).json({ 
            success: true, 
            status: 'sync_started',
            message: 'Background sync has been started. This may take several minutes for large portals.'
        });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSyncStatus = async (req, res) => {
    try {
        const { portalId } = req.params;
        
        // Find any active or waiting jobs for this portal
        const jobs = await syncQueue.getJobs(["active", "waiting", "delayed"]);
        const portalJob = jobs.find(job => job.data.portalId === portalId);
        
        if (portalJob) {
            return res.json({
                isSyncing: true,
                progress: portalJob.progress || { processed: 0, total: 0 }
            });
        }
        
        return res.json({ isSyncing: false });
    } catch (error) {
        console.error("Error fetching sync status:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    syncPortal,
    getSyncStatus,
};
