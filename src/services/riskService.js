const getRiskLevel = (score, settings = {}) => {
    const riskThresholds = settings.riskThresholds || {
        healthy: 80,
        warning: 60
    };

    if (score >= riskThresholds.healthy) {
        return "healthy";
    }

    if (score >= riskThresholds.warning) {
        return "warning";
    }

    return "at_risk";
};

module.exports = {
    getRiskLevel,
};