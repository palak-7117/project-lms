"use strict";

/*
 * Read-only demo access evaluator for Student academic pages.
 *
 * This module intentionally has no DOM dependencies. Its storage argument may
 * be replaced with a small getItem-only adapter in isolated tests.
 */
(() => {
    const SESSION_KEY = "learnspaceSession";
    const USERS_KEY = "learnspaceUsers";
    const STUDENTS_KEY = "learnspaceStudents";
    const SEMESTERS_KEY = "learnspaceSemesters";
    const CURRICULUM_KEY = "learnspaceCurriculumCourses";

    const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
    const ALLOWED_ACCOUNT_STATUSES = new Set(["active", "disabled", "pending"]);
    const ALLOWED_ADMISSION_STATUSES = new Set(["pending", "admitted", "rejected"]);
    const ALLOWED_AUTHORIZATION_STATUSES = new Set(["pending", "authorized", "revoked"]);
    const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+\/?=^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    function denied(code) {
        const sessionCodes = new Set([
            "session_missing",
            "session_malformed",
            "session_invalid",
            "session_wrong_role"
        ]);
        const eligibilityCodes = new Set([
            "account_not_found",
            "account_wrong_role",
            "account_inactive",
            "student_profile_missing",
            "admission_pending",
            "admission_rejected",
            "authorization_pending",
            "authorization_revoked",
            "semester_unallocated",
            "semester_not_found",
            "semester_inactive"
        ]);

        const message = sessionCodes.has(code)
            ? "Your session could not be verified. Please sign in again."
            : eligibilityCodes.has(code)
                ? "Your student account is not currently eligible for academic access."
                : "Student access data could not be verified. Please contact an administrator.";

        return { allowed: false, code, message };
    }

    function isObjectRecord(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function isNonemptyString(value) {
        return typeof value === "string" && value.trim() !== "";
    }

    function isValidTimestamp(value) {
        return typeof value === "string" &&
            value.trim() !== "" &&
            !Number.isNaN(Date.parse(value));
    }

    function readJsonValue(storage, key, kind) {
        let rawValue;
        try {
            rawValue = storage.getItem(key);
        } catch (error) {
            return { success: false, code: `${kind}_unavailable` };
        }

        if (rawValue === null) {
            return { success: false, code: `${kind}_missing` };
        }
        if (typeof rawValue !== "string") {
            return { success: false, code: `${kind}_malformed` };
        }

        try {
            return { success: true, value: JSON.parse(rawValue), rawValue };
        } catch (error) {
            return { success: false, code: `${kind}_malformed` };
        }
    }

    function readRecordCollection(storage, key, kind) {
        const result = readJsonValue(storage, key, kind);
        if (!result.success) return result;
        if (!Array.isArray(result.value)) {
            return { success: false, code: `${kind}_non_array` };
        }
        return { success: true, records: result.value, rawValue: result.rawValue };
    }

    function getStorage(options) {
        try {
            if (Object.prototype.hasOwnProperty.call(options, "storage")) {
                const storage = options.storage;
                if (!storage || typeof storage.getItem !== "function") {
                    return { success: false, code: "storage_unavailable" };
                }
                return { success: true, storage };
            }

            const storage = globalThis.localStorage;
            if (!storage || typeof storage.getItem !== "function") {
                return { success: false, code: "storage_unavailable" };
            }
            return { success: true, storage };
        } catch (error) {
            return { success: false, code: "storage_unavailable" };
        }
    }

    function validateSession(session) {
        if (!isObjectRecord(session) ||
            !isNonemptyString(session.userId) ||
            !isValidTimestamp(session.createdAt) ||
            session.mode !== "demo") {
            return { success: false, code: "session_invalid" };
        }
        if (session.role !== "student") {
            return { success: false, code: "session_wrong_role" };
        }
        return { success: true };
    }

    function validateUsers(users) {
        const seenIds = new Set();
        const seenEmails = new Set();

        for (const user of users) {
            if (!isObjectRecord(user) || !isNonemptyString(user.id)) {
                return { success: false, code: "users_invalid" };
            }
            if (!ALLOWED_ROLES.has(user.role) ||
                !ALLOWED_ACCOUNT_STATUSES.has(user.accountStatus)) {
                return { success: false, code: "users_invalid" };
            }

            // Match the login/Admin validators' String(...).trim().toLowerCase()
            // preprocessing, then reproduce email-input newline sanitization.
            const normalizedEmail = String(user.email || "")
                .trim()
                .toLowerCase()
                .replace(/[\r\n]/g, "");
            if (!EMAIL_PATTERN.test(normalizedEmail)) {
                return { success: false, code: "users_invalid" };
            }
            if (seenIds.has(user.id)) {
                return { success: false, code: "users_duplicate_id" };
            }
            if (seenEmails.has(normalizedEmail)) {
                return { success: false, code: "users_duplicate_email" };
            }

            seenIds.add(user.id);
            seenEmails.add(normalizedEmail);
        }

        return { success: true };
    }

    function validateStudentProfiles(profiles, users) {
        const userById = new Map(users.map((user) => [user.id, user]));
        const seenStudentIds = new Set();
        const seenUserIds = new Set();

        for (const profile of profiles) {
            if (!isObjectRecord(profile) ||
                !isNonemptyString(profile.studentId) ||
                !isNonemptyString(profile.userId) ||
                !isValidTimestamp(profile.createdAt) ||
                !ALLOWED_ADMISSION_STATUSES.has(profile.admissionStatus) ||
                !ALLOWED_AUTHORIZATION_STATUSES.has(profile.authorizationStatus) ||
                !Object.prototype.hasOwnProperty.call(profile, "semesterId") ||
                (profile.semesterId !== null && !isNonemptyString(profile.semesterId))) {
                return { success: false, code: "students_invalid" };
            }

            const linkedUser = userById.get(profile.userId);
            if (!linkedUser || linkedUser.role !== "student") {
                return { success: false, code: "students_broken_link" };
            }
            if (seenStudentIds.has(profile.studentId)) {
                return { success: false, code: "students_duplicate_id" };
            }
            if (seenUserIds.has(profile.userId)) {
                return { success: false, code: "students_duplicate_user" };
            }

            seenStudentIds.add(profile.studentId);
            seenUserIds.add(profile.userId);
        }

        return { success: true };
    }

    function validateCurriculumCourses(courses) {
        const seenIds = new Set();
        const seenCodes = new Set();

        for (const course of courses) {
            if (!isObjectRecord(course) ||
                !isNonemptyString(course.id) ||
                !isNonemptyString(course.code) ||
                !isNonemptyString(course.name) ||
                typeof course.description !== "string" ||
                !isValidTimestamp(course.createdAt)) {
                return { success: false, code: "curriculum_invalid" };
            }

            const normalizedCode = course.code.trim().toLowerCase();
            if (seenIds.has(course.id)) {
                return { success: false, code: "curriculum_duplicate_id" };
            }
            if (seenCodes.has(normalizedCode)) {
                return { success: false, code: "curriculum_duplicate_code" };
            }
            seenIds.add(course.id);
            seenCodes.add(normalizedCode);
        }

        return { success: true };
    }

    function validateSemesters(semesters, courses) {
        const courseIds = new Set(courses.map((course) => course.id));
        const seenSemesterIds = new Set();
        const seenMemberships = new Set();

        for (const semester of semesters) {
            if (!isObjectRecord(semester) ||
                !isNonemptyString(semester.id) ||
                !isNonemptyString(semester.name) ||
                !isNonemptyString(semester.academicYear) ||
                (semester.status !== "active" && semester.status !== "inactive") ||
                !Array.isArray(semester.curriculumCourseIds) ||
                !isValidTimestamp(semester.createdAt)) {
                return { success: false, code: "semesters_invalid" };
            }
            if (seenSemesterIds.has(semester.id)) {
                return { success: false, code: "semesters_duplicate_id" };
            }
            seenSemesterIds.add(semester.id);

            const membershipsInSemester = new Set();
            for (const courseId of semester.curriculumCourseIds) {
                if (!isNonemptyString(courseId) || !courseIds.has(courseId)) {
                    return { success: false, code: "semesters_invalid_reference" };
                }
                if (membershipsInSemester.has(courseId)) {
                    return { success: false, code: "semesters_duplicate_membership" };
                }
                if (seenMemberships.has(courseId)) {
                    return { success: false, code: "semesters_duplicate_membership" };
                }
                membershipsInSemester.add(courseId);
                seenMemberships.add(courseId);
            }
        }

        return { success: true };
    }

    function validateCollection(snapshot, validator) {
        if (!snapshot.success) return snapshot;
        const validation = validator(snapshot.records);
        return validation.success
            ? { success: true }
            : { success: false, code: validation.code };
    }

    function evaluateStudentAccess(options = {}) {
        if (!isObjectRecord(options)) return denied("invalid_options");

        const storageResult = getStorage(options);
        if (!storageResult.success) return denied(storageResult.code);
        const storage = storageResult.storage;

        const sessionSnapshot = readJsonValue(storage, SESSION_KEY, "session");
        if (!sessionSnapshot.success) return denied(sessionSnapshot.code);
        const sessionValidation = validateSession(sessionSnapshot.value);
        if (!sessionValidation.success) return denied(sessionValidation.code);

        const usersSnapshot = readRecordCollection(storage, USERS_KEY, "users");
        const studentsSnapshot = readRecordCollection(storage, STUDENTS_KEY, "students");
        const curriculumSnapshot = readRecordCollection(storage, CURRICULUM_KEY, "curriculum");
        const semestersSnapshot = readRecordCollection(storage, SEMESTERS_KEY, "semesters");

        for (const snapshot of [usersSnapshot, studentsSnapshot, curriculumSnapshot, semestersSnapshot]) {
            if (!snapshot.success) return denied(snapshot.code);
        }

        const usersValidation = validateCollection(usersSnapshot, validateUsers);
        if (!usersValidation.success) return denied(usersValidation.code);

        const matchingUsers = usersSnapshot.records.filter((user) => user.id === sessionSnapshot.value.userId);
        if (matchingUsers.length === 0) return denied("account_not_found");
        if (matchingUsers.length !== 1) return denied("users_duplicate_id");
        const user = matchingUsers[0];
        if (user.role !== "student") return denied("account_wrong_role");
        if (user.accountStatus !== "active") return denied("account_inactive");

        const studentsValidation = validateCollection(
            studentsSnapshot,
            (profiles) => validateStudentProfiles(profiles, usersSnapshot.records)
        );
        if (!studentsValidation.success) return denied(studentsValidation.code);

        const linkedProfiles = studentsSnapshot.records.filter((profile) => profile.userId === user.id);
        if (linkedProfiles.length === 0) return denied("student_profile_missing");
        if (linkedProfiles.length !== 1) return denied("students_duplicate_user");
        const profile = linkedProfiles[0];

        if (profile.admissionStatus !== "admitted") {
            return denied(profile.admissionStatus === "pending" ? "admission_pending" : "admission_rejected");
        }
        if (profile.authorizationStatus !== "authorized") {
            return denied(profile.authorizationStatus === "pending"
                ? "authorization_pending"
                : "authorization_revoked");
        }
        if (profile.semesterId === null) return denied("semester_unallocated");

        const curriculumValidation = validateCollection(curriculumSnapshot, validateCurriculumCourses);
        if (!curriculumValidation.success) return denied(curriculumValidation.code);
        const semestersValidation = validateCollection(
            semestersSnapshot,
            (semesters) => validateSemesters(semesters, curriculumSnapshot.records)
        );
        if (!semestersValidation.success) return denied(semestersValidation.code);

        const matchingSemesters = semestersSnapshot.records.filter(
            (semester) => semester.id === profile.semesterId
        );
        if (matchingSemesters.length === 0) return denied("semester_not_found");
        if (matchingSemesters.length !== 1) return denied("semesters_duplicate_id");
        if (matchingSemesters[0].status !== "active") return denied("semester_inactive");

        // Recheck the exact raw values to avoid granting access based on a
        // collection mix that changed while the evaluator was reading data.
        // localStorage cannot provide an atomic multi-key transaction, so a
        // change after this check is still possible.
        const kindByKey = new Map([
            [SESSION_KEY, "session"],
            [USERS_KEY, "users"],
            [STUDENTS_KEY, "students"],
            [CURRICULUM_KEY, "curriculum"],
            [SEMESTERS_KEY, "semesters"]
        ]);
        for (const [key, expected] of [
            [SESSION_KEY, sessionSnapshot.rawValue],
            [USERS_KEY, usersSnapshot.rawValue],
            [STUDENTS_KEY, studentsSnapshot.rawValue],
            [CURRICULUM_KEY, curriculumSnapshot.rawValue],
            [SEMESTERS_KEY, semestersSnapshot.rawValue]
        ]) {
            try {
                if (storage.getItem(key) !== expected) {
                    return denied("data_changed_during_check");
                }
            } catch (error) {
                return denied(`${kindByKey.get(key)}_unavailable`);
            }
        }

        return {
            allowed: true,
            code: "access_granted",
            userId: user.id,
            studentId: profile.studentId,
            semesterId: matchingSemesters[0].id
        };
    }

    globalThis.LearnSpaceStudentAccess = Object.freeze({ evaluateStudentAccess });
})();
