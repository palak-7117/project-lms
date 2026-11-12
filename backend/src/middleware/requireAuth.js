const db = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sessionCookieName, readCookie, hashToken } = require("../config/auth");

const requireAuth = asyncHandler(async (req, res, next) => {
    const token = readCookie(req, sessionCookieName);
    if (!token || token.length > 200) {
        throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    }

    const [rows] = await db.execute(
        `SELECT s.id AS sessionId, s.user_id AS userId, u.email, u.display_name AS displayName,
                u.role, u.account_status AS accountStatus,
                sp.id AS studentProfileId, sp.admission_status AS admissionStatus,
                sp.authorization_status AS authorizationStatus, sp.current_semester_id AS currentSemesterId,
                tp.id AS teacherProfileId
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL
           AND s.expires_at > CURRENT_TIMESTAMP(3)
           AND (s.last_seen_at IS NULL OR s.last_seen_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE))
         LIMIT 1`,
        [hashToken(token)]
    );

    const user = rows[0];
    if (!user || user.accountStatus !== "active" ||
        (user.role === "student" && (!user.studentProfileId || user.admissionStatus !== "admitted" || user.authorizationStatus !== "authorized")) ||
        (user.role === "teacher" && !user.teacherProfileId)) {
        throw new ApiError(401, "SESSION_INVALID", "Your session is no longer valid. Sign in again.");
    }

    const [updated] = await db.execute(
        `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)
           AND (last_seen_at IS NULL OR last_seen_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE))`,
        [user.sessionId]
    );
    if (updated.affectedRows !== 1) {
        throw new ApiError(401, "SESSION_INVALID", "Your session is no longer valid. Sign in again.");
    }

    req.auth = {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        studentProfileId: user.studentProfileId,
        teacherProfileId: user.teacherProfileId,
        admissionStatus: user.admissionStatus,
        authorizationStatus: user.authorizationStatus,
        currentSemesterId: user.currentSemesterId,
        sessionId: user.sessionId
    };
    return next();
});

module.exports = requireAuth;
