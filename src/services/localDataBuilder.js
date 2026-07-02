const prisma = require("../db");

const buildCompanyDataLocally = async (portalId, companyId) => {
    const companyHealth = await prisma.companyHealth.findUnique({
        where: { portalId_companyId: { portalId, companyId } }
    });

    if (!companyHealth) return null;

    const deals = await prisma.deal.findMany({
        where: { portalId, companyId }
    });

    const tickets = await prisma.ticket.findMany({
        where: { portalId, companyId }
    });

    const engagements = await prisma.engagement.findMany({
        where: { portalId, companyId }
    });

    const contacts = await prisma.contact.count({
        where: { portalId, companyId }
    });

    let openTickets = 0;
    let openCriticalTickets = 0;
    let slaBreachedTickets = 0;

    let activeDeals = 0;
    let stagnantDeals = 0;
    let lostDeals30Days = 0;

    let lastActivityDate = null;
    let lastMeetingDate = null;
    let lastEmailDate = null;
    let lastRenewalDate = null;

    const now = new Date();

    deals.forEach((deal) => {
        const stage = deal.stage || "";
        const isClosedWon = stage.includes("closedwon") || stage === "closedwon";
        const isClosedLost = stage.includes("closedlost") || stage === "closedlost";
        const isClosed = isClosedWon || isClosedLost || stage === "closed";
        
        if (!isClosed) {
            activeDeals += 1;

            if (deal.lastModifiedDate) {
                const daysSinceMod = Math.ceil(Math.abs(now - new Date(deal.lastModifiedDate)) / (1000 * 60 * 60 * 24));
                if (daysSinceMod > 14) {
                    stagnantDeals += 1;
                }
            }
        }

        if (isClosedLost && deal.closeDate) {
            const daysSinceClosed = Math.ceil(Math.abs(now - new Date(deal.closeDate)) / (1000 * 60 * 60 * 24));
            if (daysSinceClosed <= 30) {
                lostDeals30Days += 1;
            }
        }

        if (isClosedWon && deal.closeDate) {
            const renewalDate = new Date(deal.closeDate);
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);

            if (!lastRenewalDate || renewalDate > lastRenewalDate) {
                lastRenewalDate = renewalDate;
            }
        }
    });

    tickets.forEach((ticket) => {
        const stage = ticket.stage || "";
        const priority = ticket.priority || "";
        const isClosed = stage.includes("closed") || stage === "4"; 

        if (!isClosed) {
            openTickets += 1;

            if (priority === "HIGH" || priority === "CRITICAL") {
                openCriticalTickets += 1;
            }

            if (ticket.createdDate) {
                const daysOpen = Math.ceil(Math.abs(now - new Date(ticket.createdDate)) / (1000 * 60 * 60 * 24));
                if (daysOpen > 7 && (priority === "HIGH" || priority === "CRITICAL")) {
                    slaBreachedTickets += 1;
                }
            }
        }
    });

    engagements.forEach((eng) => {
        const engDate = eng.timestamp;
        if (engDate) {
            if (!lastActivityDate || engDate > lastActivityDate) {
                lastActivityDate = engDate;
            }
            if (eng.type === "MEETING" && (!lastMeetingDate || engDate > lastMeetingDate)) {
                lastMeetingDate = engDate;
            }
            if (eng.type === "EMAIL" && (!lastEmailDate || engDate > lastEmailDate)) {
                lastEmailDate = engDate;
            }
        }
    });

    let daysSinceLastActivity = 365;
    let daysSinceMeeting = 365;
    let daysSinceLastEmail = 365;
    let daysUntilRenewal = 365;

    if (lastActivityDate) {
        daysSinceLastActivity = Math.ceil(Math.abs(now - lastActivityDate) / (1000 * 60 * 60 * 24));
    }
    
    if (lastMeetingDate) {
        daysSinceMeeting = Math.ceil(Math.abs(now - lastMeetingDate) / (1000 * 60 * 60 * 24));
    }

    if (lastEmailDate) {
        daysSinceLastEmail = Math.ceil(Math.abs(now - lastEmailDate) / (1000 * 60 * 60 * 24));
    }

    if (lastRenewalDate) {
        const diffTime = lastRenewalDate - now;
        daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysUntilRenewal < 0) {
            daysUntilRenewal = 365 + daysUntilRenewal;
        }
    }

    return {
        companyId,
        companyName: companyHealth.companyName,
        hubspotCreatedAt: companyHealth.hubspotCreatedAt,
        
        activeDeals,
        stagnantDeals,
        lostDeals30Days,
        
        totalContacts: contacts,
        
        openTickets,
        openCriticalTickets,
        slaBreachedTickets,
        
        lastActivityDate,
        lastMeetingDate,
        lastEmailDate,
        lastRenewalDate,
        
        daysSinceLastActivity,
        daysSinceMeeting,
        daysSinceLastEmail,
        daysUntilRenewal,
    };
};

module.exports = {
    buildCompanyDataLocally,
};
