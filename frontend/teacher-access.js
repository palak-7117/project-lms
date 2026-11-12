"use strict";

// Page access is bootstrapped from the server session by auth-guard.js.
// localStorage is never used as evidence of identity or authorization.
(() => {
    function evaluate() {
        const user = window.LearnSpaceApi?.getCurrentUser();
        if (!user || user.role !== "teacher" || !user.teacherProfileId) {
            return { allowed: false, code: "server_session_required" };
        }
        return {
            allowed: true,
            code: "server_session_valid",
            userId: user.userId,
            teacherId: user.teacherProfileId
        };
    }

    function validateTeacherIdentity(userId, teacherId) {
        const current = evaluate();
        return current.allowed && userId === current.userId && teacherId === current.teacherId
            ? { valid: true, userId, teacherId, accountActive: true }
            : { valid: false, code: "server_identity_mismatch" };
    }

    globalThis.LearnSpaceTeacherAccess = Object.freeze({
        evaluate,
        validateTeacherIdentity,
        isRelevantStorageChange: () => false
    });
})();
