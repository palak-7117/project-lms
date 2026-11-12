const ApiError = require("./ApiError");

function requireString(value, field, maxLength, { optional = false } = {}) {
    if (optional && (value === undefined || value === null)) return null;
    if (typeof value !== "string") {
        throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a string.`);
    }
    const normalized = value.trim();
    if (!normalized && optional) return null;
    if (!normalized || normalized.length > maxLength) {
        throw new ApiError(400, "VALIDATION_ERROR", `${field} is required and must be at most ${maxLength} characters.`);
    }
    return normalized;
}

function requireEmail(value) {
    const email = requireString(value, "Email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid email address.");
    }
    return email;
}

function requirePassword(value) {
    if (typeof value !== "string" || value.length < 12 || value.length > 128) {
        throw new ApiError(400, "VALIDATION_ERROR", "Password must be between 12 and 128 characters.");
    }
    return value;
}

function requireUuid(value, field = "ID") {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid.`);
    }
    return value.toLowerCase();
}

function requireEnum(value, field, options) {
    if (!options.includes(value)) {
        throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid.`);
    }
    return value;
}

function duplicateKey(error) {
    return error && error.code === "ER_DUP_ENTRY";
}

module.exports = { requireString, requireEmail, requirePassword, requireUuid, requireEnum, duplicateKey };
