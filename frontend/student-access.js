"use strict";

// Page access is bootstrapped from the server session by auth-guard.js.
// localStorage is never used as evidence of identity or authorization.
(() => {
    function evaluateStudentAccess() {
        const user = window.LearnSpaceApi?.getCurrentUser();
        if (!user || user.role !== "student" || !user.studentProfileId) {
            return { allowed: false, code: "server_session_required" };
        }
        return {
            allowed: true,
            code: "server_session_valid",
            userId: user.userId,
            studentId: user.studentProfileId,
            semesterId: user.currentSemesterId || null
        };
    }

    globalThis.LearnSpaceStudentAccess = Object.freeze({ evaluateStudentAccess });
})();
