const getRecommendations = (companyData) => {

    const recommendations = [];

    if (companyData.openTickets > 5) {
        recommendations.push(
            "Review unresolved support tickets"
        );
    }

    if (companyData.daysSinceMeeting > 30) {
        recommendations.push(
            "Schedule customer success review"
        );
    }

    return recommendations;
};

module.exports = {
    getRecommendations,
};