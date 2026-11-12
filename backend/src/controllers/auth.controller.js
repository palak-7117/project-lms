const authService = require("../services/auth.service");
const ApiError = require("../utils/ApiError");
const { newCsrfToken, setCsrfCookie, setSessionCookie, clearCsrfCookie, clearSessionCookie, readCookie, sessionCookieName } = require("../config/auth");

function issueCsrf(req, res) {
    const csrfToken = newCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.json({ success: true, data: { csrfToken } });
}

async function login(req, res) {
    const role = req.params.role;
    if (!["admin", "teacher", "student"].includes(role)) {
        throw new ApiError(404, "NOT_FOUND", "Route not found.");
    }
    const result = await authService.login(role, req.body);
    setSessionCookie(res, result.token);
    const csrfToken = newCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.json({ success: true, data: { user: result.principal, csrfToken } });
}

function currentUser(req, res) {
    const { sessionId, ...user } = req.auth;
    res.json({ success: true, data: { user } });
}

async function logout(req, res) {
    await authService.logout(readCookie(req, sessionCookieName));
    clearSessionCookie(res);
    clearCsrfCookie(res);
    res.json({ success: true, message: "Signed out." });
}

module.exports = { issueCsrf, login, currentUser, logout };
