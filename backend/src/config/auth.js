const crypto = require("node:crypto");

const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = isProduction ? "__Host-ls_session" : "ls_session";
const csrfCookieName = isProduction ? "__Host-ls_csrf" : "ls_csrf";
const absoluteSessionHours = 8;
const idleSessionMinutes = 30;

function cookieOptions(maxAge) {
    return {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge
    };
}

function setSessionCookie(res, token) {
    res.cookie(sessionCookieName, token, {
        ...cookieOptions(absoluteSessionHours * 60 * 60 * 1000),
        httpOnly: true
    });
}

function clearSessionCookie(res) {
    res.clearCookie(sessionCookieName, {
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        httpOnly: true
    });
}

function setCsrfCookie(res, token) {
    res.cookie(csrfCookieName, token, cookieOptions(absoluteSessionHours * 60 * 60 * 1000));
}

function clearCsrfCookie(res) {
    res.clearCookie(csrfCookieName, {
        secure: isProduction,
        sameSite: "lax",
        path: "/"
    });
}

function readCookie(req, name) {
    const cookieHeader = req.headers.cookie || "";
    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() === name) {
            try {
                return decodeURIComponent(part.slice(separator + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

function newCsrfToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
    sessionCookieName,
    csrfCookieName,
    absoluteSessionHours,
    idleSessionMinutes,
    setSessionCookie,
    clearSessionCookie,
    setCsrfCookie,
    clearCsrfCookie,
    readCookie,
    newCsrfToken,
    hashToken
};
