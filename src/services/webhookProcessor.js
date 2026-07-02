const { markWebhookProcessed } = require("../repositories/webhookRepository");
const { identifyCompanyId } = require("./recalculationService");
const { addRecalculationJob } = require("../queues/recalculationQueue");

const processEvent = async (eventRecord) => {
    try {
        const { portalId, objectId, eventType, objectType, payload } = eventRecord;
        
        // Filter relevant events
        const relevantObjectTypes = ["company", "deal", "ticket", "contact", "engagement"];
        
        let isRelevant = false;
        for (const type of relevantObjectTypes) {
            if (eventType.startsWith(type) || objectType === type || eventType.includes("engagement")) {
                isRelevant = true;
                break;
            }
        }

        if (isRelevant) {
            const companyId = await identifyCompanyId(portalId, objectType, objectId);
            
            if (companyId) {
                // Add job to BullMQ queue instead of processing directly
                await addRecalculationJob({
                    portalId,
                    companyId,
                    objectType,
                    objectId,
                    timestamp: Date.now(),
                    reasonPayload: payload,
                });
            } else {
                console.log(`Webhook event ${eventRecord.id} ignored: No associated company found.`);
            }
        }

        // Mark processed
        await markWebhookProcessed(eventRecord.id);

    } catch (error) {
        console.error(`Error processing webhook event ${eventRecord.id}:`, error.message);
        throw error;
    }
};

module.exports = {
    processEvent,
};
