const calculateHealthScore = async (
    companyData,
    settings,
    previousScore = null
) => {
    let engagementScore = 0;
    let supportScore = 0;
    let commercialScore = 0;
    let trendScore = 0;

    const DEFAULT_RULES = {
        engagement: {
            meeting_in_days: { enabled: true, days: 30, points: 10 },
            call_in_days: { enabled: true, days: 30, points: 5 },
            frequent_engagement: { enabled: true, count: 3, days: 45, points: 10 },
            no_meeting_or_call: { enabled: true, days: 45, points: -10 },
            no_activity: { enabled: true, days: 60, points: -15 }
        },
        support: {
            zero_open_tickets: { enabled: true, points: 5 },
            some_open_tickets: { enabled: true, min: 3, max: 5, points: -10 },
            many_open_tickets: { enabled: true, min: 6, points: -20 },
            overdue_critical: { enabled: true, days: 7, points: -10 },
            escalated_ticket: { enabled: true, points: -10 }
        },
        commercial: {
            healthy_open_renewal: { enabled: true, points: 10 },
            renewal_away_31_90: { enabled: true, minDays: 31, maxDays: 90, points: -5 },
            renewal_less_30_low_eng: { enabled: true, days: 30, points: -15 },
            renewal_stalled: { enabled: true, days: 21, points: -10 },
            renewal_closed_lost: { enabled: true, points: -20 },
            no_renewal_owner: { enabled: true, points: -5 }
        },
        trend: {
            score_improved: { enabled: true, points: 5 },
            score_dropped_10: { enabled: true, points: -10 },
            meeting_despite_escalation: { enabled: true, points: 5 }
        }
    };

    const rules = settings?.rulesConfig || DEFAULT_RULES;
    
    // Helper to safely get rule with defaults fallback
    const getRule = (category, name) => {
        if (rules[category] && rules[category][name]) return rules[category][name];
        return DEFAULT_RULES[category][name];
    };

    // --- 1. Engagement [-15, +30] ---
    const meetingRule = getRule('engagement', 'meeting_in_days');
    const callRule = getRule('engagement', 'call_in_days');
    const freqRule = getRule('engagement', 'frequent_engagement');
    const noMeetingRule = getRule('engagement', 'no_meeting_or_call');
    const noActivityRule = getRule('engagement', 'no_activity');

    if (meetingRule.enabled && companyData.daysSinceMeeting <= meetingRule.days) engagementScore += meetingRule.points;
    // We don't have daysSinceCall, but calls30Days handles it roughly. Let's assume calls30Days > 0 applies to callRule.days = 30
    if (callRule.enabled && companyData.calls30Days > 0) engagementScore += callRule.points; 
    // We don't have engagementsXDays dynamic perfectly, but engagements45Days is close.
    if (freqRule.enabled && companyData.engagements45Days >= freqRule.count) engagementScore += freqRule.points;

    const noMeetingOrCall = companyData.daysSinceMeeting > noMeetingRule.days && companyData.calls30Days === 0;
    if (noMeetingRule.enabled && noMeetingOrCall) engagementScore += noMeetingRule.points;
    
    if (noActivityRule.enabled && companyData.daysSinceLastActivity > noActivityRule.days) engagementScore += noActivityRule.points;

    engagementScore = Math.max(-15, Math.min(30, engagementScore));

    // --- 2. Support [-30, +5] ---
    const zeroTkts = getRule('support', 'zero_open_tickets');
    const someTkts = getRule('support', 'some_open_tickets');
    const manyTkts = getRule('support', 'many_open_tickets');
    const overdue = getRule('support', 'overdue_critical');
    const escalated = getRule('support', 'escalated_ticket');

    if (zeroTkts.enabled && companyData.openTickets === 0) supportScore += zeroTkts.points;
    else if (someTkts.enabled && companyData.openTickets >= someTkts.min && companyData.openTickets <= someTkts.max) supportScore += someTkts.points;
    else if (manyTkts.enabled && companyData.openTickets >= manyTkts.min) supportScore += manyTkts.points;

    // We can't dynamically check overdue tickets days easily here since data builder did it, but data builder used 7. Let's rely on data builder for now.
    if (overdue.enabled && companyData.overdueCriticalTickets > 0) supportScore += overdue.points;
    if (escalated.enabled && companyData.escalatedTickets > 0) supportScore += escalated.points;
    
    if (companyData.ticketReopens30Days > 0) {
        supportScore -= Math.min(10, companyData.ticketReopens30Days * 5);
    }

    supportScore = Math.max(-30, Math.min(5, supportScore));

    // --- 3. Commercial / Renewal [-25, +10] ---
    const healthyRen = getRule('commercial', 'healthy_open_renewal');
    const renAway = getRule('commercial', 'renewal_away_31_90');
    const renLowEng = getRule('commercial', 'renewal_less_30_low_eng');
    const renStalled = getRule('commercial', 'renewal_stalled');
    const renClosedLost = getRule('commercial', 'renewal_closed_lost');
    const noRenOwner = getRule('commercial', 'no_renewal_owner');

    if (renAway.enabled && companyData.daysUntilRenewal >= renAway.minDays && companyData.daysUntilRenewal <= renAway.maxDays) {
        commercialScore += renAway.points;
    }
    if (renLowEng.enabled && companyData.daysUntilRenewal >= 0 && companyData.daysUntilRenewal <= renLowEng.days && noMeetingOrCall) {
        commercialScore += renLowEng.points;
    }
    
    if (healthyRen.enabled && companyData.hasHealthyRenewalDeal) commercialScore += healthyRen.points;
    if (renStalled.enabled && companyData.stalledRenewalDeal) commercialScore += renStalled.points; // stalled is bool, data builder checked 21
    if (renClosedLost.enabled && companyData.closedLostRenewalDeal) commercialScore += renClosedLost.points;
    if (noRenOwner.enabled && !companyData.hasRenewalOwner) commercialScore += noRenOwner.points;

    commercialScore = Math.max(-25, Math.min(10, commercialScore));

    // --- Preliminary Target Score ---
    const targetScore = Math.max(0, Math.min(100, 50 + engagementScore + supportScore + commercialScore));

    // --- 4. Trend / Recency Modifiers [-15, +10] ---
    const scoreImp = getRule('trend', 'score_improved');
    const scoreDrop = getRule('trend', 'score_dropped_10');
    const meetEsc = getRule('trend', 'meeting_despite_escalation');

    if (previousScore !== null) {
        if (scoreImp.enabled && targetScore > previousScore) {
            trendScore += scoreImp.points;
        } else if (scoreDrop.enabled && previousScore - targetScore >= 10) {
            trendScore += scoreDrop.points;
        }
    }

    if (meetEsc.enabled && companyData.meetings30Days > 0 && companyData.escalatedTickets > 0) {
        trendScore += meetEsc.points;
    }

    trendScore = Math.max(-15, Math.min(10, trendScore));

    // --- Final Score Calculation ---
    const finalScore = Math.max(0, Math.min(100, 50 + engagementScore + supportScore + commercialScore + trendScore));

    let trendDirection = "STABLE";
    if (previousScore !== null) {
        if (finalScore > previousScore + 2) trendDirection = "IMPROVING";
        else if (finalScore < previousScore - 2) trendDirection = "DECLINING";
    }

    return {
        score: finalScore,
        dealHealth: commercialScore,
        ticketHealth: supportScore,
        engagementHealth: engagementScore,
        signalRisk: trendScore,
        trendDirection
    };
};

module.exports = {
    calculateHealthScore,
};
