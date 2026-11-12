function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
        ? error.status
        : Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
            ? error.statusCode
            : 500;

    const code = typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code
        : status === 400
            ? "BAD_REQUEST"
            : "INTERNAL_ERROR";

    // Deliberately omit raw errors, SQL messages, query text, and credentials.
    if (status >= 500) {
        console.error(`[api] ${req.method} ${req.path} -> ${status} (${code})`);
    }

    const message = status === 404
        ? "Route not found"
        : code === "DB_UNAVAILABLE"
            ? "Database unavailable"
            : status >= 500
                ? "Internal server error"
                : error.type === "entity.parse.failed"
                    ? "Invalid JSON request body"
                    : error.message || "Request failed";

    res.status(status).json({ success: false, error: message, code });
}

module.exports = errorHandler;
