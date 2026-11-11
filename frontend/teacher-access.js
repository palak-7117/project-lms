"use strict";

// Shared client-side Teacher access check. The account and profile checks
// mirror script.js login validation so both Teacher pages apply one policy.
(() => {
    const SESSION_KEY = "learnspaceSession";
    const USERS_KEY = "learnspaceUsers";
    const TEACHERS_KEY = "learnspaceTeachers";
    const STUDENTS_KEY = "learnspaceStudents";
    const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
    const ALLOWED_ACCOUNT_STATUSES = new Set(["active", "disabled", "pending"]);
    const ALLOWED_ADMISSION_STATUSES = new Set(["pending", "admitted", "rejected"]);
    const ALLOWED_AUTHORIZATION_STATUSES = new Set(["pending", "authorized", "revoked"]);
    const ACCESS_STORAGE_KEYS = new Set([
        SESSION_KEY,
        USERS_KEY,
        TEACHERS_KEY,
        STUDENTS_KEY
    ]);

    function isObjectRecord(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function isNonemptyString(value) {
        return typeof value === "string" && value.trim() !== "";
    }

    function isValidTimestamp(value) {
        return typeof value === "string" && value.trim() !== "" &&
            !Number.isNaN(Date.parse(value));
    }

    function readRawValue(key) {
        try {
            return { success: true, rawValue: localStorage.getItem(key) };
        } catch (error) {
            return { success: false, code: "storage_unavailable" };
        }
    }

    function readRecordCollection(key) {
        const raw = readRawValue(key);
        if (!raw.success) return raw;
        if (raw.rawValue === null) {
            return { success: true, records: [], rawValue: null, missing: true };
        }

        let records;
        try {
            if (typeof raw.rawValue !== "string") {
                return { success: false, code: `${key}_malformed` };
            }
            records = JSON.parse(raw.rawValue);
        } catch (error) {
            return { success: false, code: `${key}_malformed` };
        }
        if (!Array.isArray(records)) {
            return { success: false, code: `${key}_non_array` };
        }
        return { success: true, records, rawValue: raw.rawValue, missing: false };
    }

    function validateUsers(users) {
        const seenIds = new Set();
        const seenEmails = new Set();

        for (const user of users) {
            if (!isObjectRecord(user) || !isNonemptyString(user.id) ||
                !ALLOWED_ROLES.has(user.role) ||
                !ALLOWED_ACCOUNT_STATUSES.has(user.accountStatus)) {
                return { success: false, code: "users_invalid" };
            }

            const emailInput = document.createElement("input");
            emailInput.type = "email";
            emailInput.required = true;
            emailInput.value = String(user.email || "").trim().toLowerCase();
            if (!emailInput.checkValidity()) {
                return { success: false, code: "users_invalid" };
            }
            if (seenIds.has(user.id)) {
                return { success: false, code: "users_duplicate_id" };
            }
            if (seenEmails.has(emailInput.value)) {
                return { success: false, code: "users_duplicate_email" };
            }
            seenIds.add(user.id);
            seenEmails.add(emailInput.value);
        }
        return { success: true };
    }

    function validateProfiles(profiles, role, users) {
        const profileIdKey = role === "student" ? "studentId" : "teacherId";
        const seenProfileIds = new Set();
        const seenUserIds = new Set();

        for (const profile of profiles) {
            if (!isObjectRecord(profile) || !isNonemptyString(profile[profileIdKey]) ||
                !isNonemptyString(profile.userId) || !isValidTimestamp(profile.createdAt)) {
                return { success: false, code: `${role}_profiles_invalid` };
            }

            const linkedUsers = users.filter((user) => user.id === profile.userId);
            if (linkedUsers.length !== 1 || linkedUsers[0].role !== role) {
                return { success: false, code: `${role}_profile_broken_link` };
            }
            if (seenProfileIds.has(profile[profileIdKey])) {
                return { success: false, code: `${role}_profiles_duplicate_id` };
            }
            if (seenUserIds.has(profile.userId)) {
                return { success: false, code: `${role}_profiles_duplicate_user` };
            }

            if (role === "student" &&
                (!ALLOWED_ADMISSION_STATUSES.has(profile.admissionStatus) ||
                 !ALLOWED_AUTHORIZATION_STATUSES.has(profile.authorizationStatus) ||
                 !Object.prototype.hasOwnProperty.call(profile, "semesterId") ||
                 (profile.semesterId !== null && !isNonemptyString(profile.semesterId)))) {
                return { success: false, code: "student_profiles_invalid" };
            }

            seenProfileIds.add(profile[profileIdKey]);
            seenUserIds.add(profile.userId);
        }
        return { success: true };
    }

    function denied(code) {
        return { allowed: false, code };
    }

    function evaluate() {
        let sessionRaw;
        try {
            sessionRaw = localStorage.getItem(SESSION_KEY);
        } catch (error) {
            return denied("session_unavailable");
        }
        if (sessionRaw === null) return denied("session_missing");

        let session;
        try {
            if (typeof sessionRaw !== "string") return denied("session_malformed");
            session = JSON.parse(sessionRaw);
        } catch (error) {
            return denied("session_malformed");
        }
        if (!isObjectRecord(session) || !isNonemptyString(session.userId) ||
            !isValidTimestamp(session.createdAt) || session.mode !== "demo") {
            return denied("session_invalid");
        }
        if (session.role !== "teacher") return denied("session_wrong_role");

        const users = readRecordCollection(USERS_KEY);
        const teachers = readRecordCollection(TEACHERS_KEY);
        const students = readRecordCollection(STUDENTS_KEY);
        for (const collection of [users, teachers, students]) {
            if (!collection.success) return denied(collection.code);
        }

        const usersValidation = validateUsers(users.records);
        if (!usersValidation.success) return denied(usersValidation.code);
        const matchingUsers = users.records.filter((user) => user.id === session.userId);
        if (matchingUsers.length === 0) return denied("account_not_found");
        if (matchingUsers.length !== 1) return denied("account_duplicate_id");
        const user = matchingUsers[0];
        if (user.role !== "teacher") return denied("account_wrong_role");
        if (user.accountStatus !== "active") return denied("account_inactive");

        const teacherValidation = validateProfiles(teachers.records, "teacher", users.records);
        if (!teacherValidation.success) return denied(teacherValidation.code);
        const studentValidation = validateProfiles(students.records, "student", users.records);
        if (!studentValidation.success) return denied(studentValidation.code);

        const linkedTeacherProfiles = teachers.records.filter(
            (profile) => profile.userId === user.id
        );
        if (linkedTeacherProfiles.length === 0) return denied("teacher_profile_missing");
        if (linkedTeacherProfiles.length !== 1) return denied("teacher_profile_duplicate");
        if (students.records.some((profile) => profile.userId === user.id)) {
            return denied("cross_role_profile_conflict");
        }

        // Refuse a mixed snapshot if another tab changed any identity data
        // during this check. localStorage cannot make these reads atomic.
        for (const [key, expected] of [
            [SESSION_KEY, sessionRaw],
            [USERS_KEY, users.rawValue],
            [TEACHERS_KEY, teachers.rawValue],
            [STUDENTS_KEY, students.rawValue]
        ]) {
            try {
                if (localStorage.getItem(key) !== expected) {
                    return denied("data_changed_during_check");
                }
            } catch (error) {
                return denied("storage_unavailable");
            }
        }

        return {
            allowed: true,
            code: "access_granted",
            userId: user.id,
            teacherId: linkedTeacherProfiles[0].teacherId,
            sessionCreatedAt: session.createdAt
        };
    }

    function isRelevantStorageChange(event) {
        return event.key === null || ACCESS_STORAGE_KEYS.has(event.key);
    }

    globalThis.LearnSpaceTeacherAccess = Object.freeze({
        evaluate,
        isRelevantStorageChange
    });
})();
