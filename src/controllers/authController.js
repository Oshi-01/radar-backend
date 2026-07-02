const oauthService = require("../services/oauthService");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const install = (req, res) => {
    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: "lax",
    });

    const authUrl = oauthService.getAuthorizationUrl(state);
    res.redirect(authUrl);
};

const oauthCallback = async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const storedState = req.cookies.oauth_state;
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    
    // CSRF Check
    if (!state || state !== storedState) {
        console.error("State mismatch or missing. Possible CSRF.");
        return res.redirect(`${FRONTEND_URL}/auth/callback?error=invalid_state`);
    }

    if (!code) {
        return res.redirect(`${FRONTEND_URL}/auth/callback?error=no_code_provided`);
    }

    // Clear the state cookie
    res.clearCookie("oauth_state");

    try {
        const result = await oauthService.handleCallback(code);
        
        // Generate JWT
        const token = jwt.sign(
            { portalId: result.hubId },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Set JWT as HttpOnly cookie
        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: "lax",
        });

        return res.redirect(`${FRONTEND_URL}/auth/callback`);
    } catch (error) {
        console.error("OAuth Callback Error:", error);
        return res.redirect(`${FRONTEND_URL}/auth/callback?error=installation_failed`);
    }
};

const me = (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.json({ portalId: decoded.portalId });
    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = {
    install,
    oauthCallback,
    me,
};