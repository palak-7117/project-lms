const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../config/db");
const ApiError = require("../utils/ApiError");
const { requireEmail, requirePassword } = require("../utils/validation");
const { absoluteSessionHours, hashToken } = require("../config/auth");

const dummyPasswordHash = argon2.hash(crypto.randomBytes(32).toString("hex"), {
    type: argon2.argon2id
});

async function login(role, payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid login request.");
    }
    const email = requireEmail(payload.email);
    const password = requirePassword(payload.password);
    const [rows] = await db.execute(
        `SELECT id, email, password_hash AS passwordHash, display_name AS displayName,
                role, account_status AS accountStatus
         FROM users WHERE email = ? LIMIT 1`,
        [email]
    );
    const user = rows[0];
    let passwordValid = false;
    try {
        passwordValid = await argon2.verify(user ? user.passwordHash : await dummyPasswordHash, password);
    } catch {
        passwordValid = false;
    }

    if (!user || !passwordValid || user.role !== role) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    if (user.accountStatus !== "active") {
        throw new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active.");
    }

    const principal = {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        studentProfileId: null,
        teacherProfileId: null,
        admissionStatus: null,
        authorizationStatus: null,
        currentSemesterId: null
    };

    if (role === "student") {
        const [profiles] = await db.execute(
            `SELECT id, admission_status AS admissionStatus,
                    authorization_status AS authorizationStatus, current_semester_id AS currentSemesterId
             FROM student_profiles WHERE user_id = ? LIMIT 1`,
            [user.id]
        );
        const profile = profiles[0];
        if (!profile || profile.admissionStatus !== "admitted" || profile.authorizationStatus !== "authorized") {
            throw new ApiError(403, "STUDENT_NOT_AUTHORIZED", "Student access has not been approved.");
        }
        principal.studentProfileId = profile.id;
        principal.admissionStatus = profile.admissionStatus;
        principal.authorizationStatus = profile.authorizationStatus;
        principal.currentSemesterId = profile.currentSemesterId;
    }

    if (role === "teacher") {
        const [profiles] = await db.execute(
            "SELECT id FROM teacher_profiles WHERE user_id = ? LIMIT 1",
            [user.id]
        );
        if (!profiles[0]) throw new ApiError(403, "PROFILE_MISSING", "This account is not ready to sign in.");
        principal.teacherProfileId = profiles[0].id;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const sessionId = crypto.randomUUID();
    await db.execute(
        `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, last_seen_at)
         VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${absoluteSessionHours} HOUR), CURRENT_TIMESTAMP(3))`,
        [sessionId, user.id, hashToken(token)]
    );

    return { token, principal };
}

async function logout(token) {
    if (!token) return;
    await db.execute(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP(3)
         WHERE token_hash = ? AND revoked_at IS NULL`,
        [hashToken(token)]
    );
}

module.exports = { login, logout };
