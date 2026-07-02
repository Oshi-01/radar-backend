const buildHealthSignals = (companies, deals, tickets, engagements, contacts = []) => {
    const companyDataMap = new Map();

    companies.forEach((company) => {
        companyDataMap.set(company.id, {
            companyId: company.id,
            companyName: company.properties.name || "Unknown Company",
            hubspotCreatedAt: company.properties.hs_createdate ? new Date(company.properties.hs_createdate) : (company.properties.createdate ? new Date(company.properties.createdate) : null),
            
            // Deal Health Data
            activeDeals: 0,
            stagnantDeals: 0,
            lostDeals30Days: 0,
            hasHealthyRenewalDeal: false,
            stalledRenewalDeal: false,
            closedLostRenewalDeal: false,
            hasRenewalOwner: !!company.properties.hubspot_owner_id,
            
            // Contact Data
            totalContacts: 0,
            
            // Ticket Health Data
            openTickets: 0,
            openCriticalTickets: 0,
            slaBreachedTickets: 0,
            escalatedTickets: 0,
            ticketReopens30Days: 0,
            overdueCriticalTickets: 0,

            // Engagement Data
            lastActivityDate: null,
            lastMeetingDate: null,
            lastEmailDate: null,
            daysSinceLastActivity: 365,
            daysSinceMeeting: 365,
            daysSinceLastEmail: 365,
            meetings30Days: 0,
            calls30Days: 0,
            engagements45Days: 0,
            
            // Renewal
            lastRenewalDate: null,
            daysUntilRenewal: 365,
        });
    });

    const getAssociatedCompanyIds = (record) => {
        const ids = [];
        if (record.associations && record.associations.companies && record.associations.companies.results) {
            record.associations.companies.results.forEach(assoc => {
                ids.push(assoc.id);
            });
        }
        return ids;
    };

    const now = new Date();

    deals.forEach((deal) => {
        const companyIds = getAssociatedCompanyIds(deal);
        const stage = (deal.properties.dealstage || "").toLowerCase();
        const dealName = (deal.properties.dealname || "").toLowerCase();
        
        const isClosedWon = stage.includes("closedwon") || stage === "closedwon";
        const isClosedLost = stage.includes("closedlost") || stage === "closedlost";
        const isClosed = isClosedWon || isClosedLost || stage === "closed";
        const isRenewal = dealName.includes("renewal");
        
        companyIds.forEach(id => {
            if (!companyDataMap.has(id)) return;
            const data = companyDataMap.get(id);

            if (deal.properties.hubspot_owner_id) {
                data.hasRenewalOwner = true;
            }

            if (!isClosed) {
                data.activeDeals += 1;

                // Check if stagnant (> 14 days)
                const lastModifiedStr = deal.properties.hs_lastmodifieddate || deal.properties.createdate;
                if (lastModifiedStr) {
                    const lastModified = new Date(lastModifiedStr);
                    const daysSinceMod = Math.ceil(Math.abs(now - lastModified) / (1000 * 60 * 60 * 24));
                    if (daysSinceMod > 14) {
                        data.stagnantDeals += 1;
                    }
                    if (isRenewal && daysSinceMod > 21) {
                        data.stalledRenewalDeal = true;
                    }
                }
                
                if (isRenewal && !data.stalledRenewalDeal) {
                    data.hasHealthyRenewalDeal = true;
                }
            }

            if (isClosedLost && deal.properties.closedate) {
                const closeDate = new Date(deal.properties.closedate);
                const daysSinceClosed = Math.ceil(Math.abs(now - closeDate) / (1000 * 60 * 60 * 24));
                if (daysSinceClosed <= 30) {
                    data.lostDeals30Days += 1;
                }
                if (isRenewal) {
                    data.closedLostRenewalDeal = true;
                }
            }

            if (isClosedWon && deal.properties.closedate) {
                const closeDate = new Date(deal.properties.closedate);
                const renewalDate = new Date(closeDate);
                renewalDate.setFullYear(renewalDate.getFullYear() + 1);

                if (!data.lastRenewalDate || renewalDate > data.lastRenewalDate) {
                    data.lastRenewalDate = renewalDate;
                }
            }
        });
    });

    tickets.forEach((ticket) => {
        const companyIds = getAssociatedCompanyIds(ticket);
        const stage = (ticket.properties.hs_pipeline_stage || "").toLowerCase();
        const priority = (ticket.properties.hs_ticket_priority || "").toUpperCase();
        const isClosed = stage.includes("closed") || stage === "4"; 
        const isEscalated = stage.includes("escalated");
        
        companyIds.forEach(id => {
            if (!companyDataMap.has(id)) return;
            const data = companyDataMap.get(id);

            if (!isClosed) {
                data.openTickets += 1;
                
                if (priority === "HIGH" || priority === "CRITICAL") {
                    data.openCriticalTickets += 1;
                }
                
                if (isEscalated) {
                    data.escalatedTickets += 1;
                }
                
                const createdDate = ticket.properties.createdate ? new Date(ticket.properties.createdate) : null;
                if (createdDate) {
                    const daysOpen = Math.ceil(Math.abs(now - createdDate) / (1000 * 60 * 60 * 24));
                    if (daysOpen > 7 && (priority === "HIGH" || priority === "CRITICAL")) {
                        data.slaBreachedTickets += 1;
                        data.overdueCriticalTickets += 1;
                    }
                }
            } else {
                // If closed but recently modified, it could be reopened but HubSpot doesn't expose it easily.
                // We agreed to omit complex reopen tracking for MVP or use simple heuristics if needed.
            }
        });
    });

    engagements.forEach((eng) => {
        const companyIds = getAssociatedCompanyIds(eng);
        const engDateStr = eng.properties.hs_timestamp || eng.properties.hs_createdate;
        
        const type = eng.properties.hs_engagement_type || "";
        const isMeeting = type === "MEETING" || eng.properties.hs_meeting_title || eng.properties.hs_internal_meeting_notes;
        const isCall = type === "CALL";
        const isEmail = type === "EMAIL" || eng.properties.hs_email_subject;

        if (engDateStr) {
            const engDate = new Date(engDateStr);
            const daysAgo = Math.ceil(Math.abs(now - engDate) / (1000 * 60 * 60 * 24));

            companyIds.forEach(id => {
                if (!companyDataMap.has(id)) return;
                const data = companyDataMap.get(id);
                
                if (!data.lastActivityDate || engDate > data.lastActivityDate) {
                    data.lastActivityDate = engDate;
                }

                if (daysAgo <= 45) {
                    data.engagements45Days += 1;
                }

                if (isMeeting) {
                    if (!data.lastMeetingDate || engDate > data.lastMeetingDate) data.lastMeetingDate = engDate;
                    if (daysAgo <= 30) data.meetings30Days += 1;
                }
                
                if (isCall) {
                    if (daysAgo <= 30) data.calls30Days += 1;
                }
                
                if (isEmail) {
                    if (!data.lastEmailDate || engDate > data.lastEmailDate) data.lastEmailDate = engDate;
                }
            });
        }
    });

    contacts.forEach((contact) => {
        const companyIds = getAssociatedCompanyIds(contact);
        companyIds.forEach(id => {
            if (!companyDataMap.has(id)) return;
            const data = companyDataMap.get(id);
            data.totalContacts += 1;
        });
    });

    Array.from(companyDataMap.values()).forEach(data => {
        if (data.lastActivityDate) {
            data.daysSinceLastActivity = Math.ceil(Math.abs(now - data.lastActivityDate) / (1000 * 60 * 60 * 24));
        }
        if (data.lastMeetingDate) {
            data.daysSinceMeeting = Math.ceil(Math.abs(now - data.lastMeetingDate) / (1000 * 60 * 60 * 24));
        }
        if (data.lastEmailDate) {
            data.daysSinceLastEmail = Math.ceil(Math.abs(now - data.lastEmailDate) / (1000 * 60 * 60 * 24));
        }
        if (data.lastRenewalDate) {
            const diffTime = data.lastRenewalDate - now;
            data.daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (data.daysUntilRenewal < 0) {
                // If it passed, assume it was renewed and bump 1 year (simple heuristic)
                data.daysUntilRenewal = 365 + data.daysUntilRenewal;
            }
        }
    });

    return Array.from(companyDataMap.values());
};

module.exports = {
    buildHealthSignals,
};
