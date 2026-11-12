const crypto = require("node:crypto");
const ApiError = require("../utils/ApiError");
const { getAllowedOrigins } = require("../config/env");
const { csrfCookieName, readCookie } = require("../config/auth");

const allowedOrigins = getAllowedOrigins();

function requireCsrf(req, res, next) {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
        return next(new ApiError(403, "CSRF_REJECTED", "Request origin is not allowed."));
    }

    const cookieToken = readCookie(req, csrfCookieName);
    const headerToken = req.get("x-csrf-token");
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        return next(new ApiError(403, "CSRF_REJECTED", "Refresh the page and try again."));
    }
    return next();
}

module.exports = requireCsrf;
