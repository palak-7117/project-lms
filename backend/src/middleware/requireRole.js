const ApiError = require("../utils/ApiError");

function requireRole(...roles) {
    return function roleGuard(req, res, next) {
        if (!req.auth || !roles.includes(req.auth.role)) {
            return next(new ApiError(403, "FORBIDDEN", "You do not have permission to access this resource."));
        }
        return next();
    };
}

module.exports = requireRole;
