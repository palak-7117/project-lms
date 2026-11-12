"use strict";

// Read-only resolver for offerings eligible to the currently authorized Student.
(() => {
    const COURSE_KEY = "learnspaceCourses";
    const CURRICULUM_KEY = "learnspaceCurriculumCourses";
    const SEMESTER_KEY = "learnspaceSemesters";
    const USERS_KEY = "learnspaceUsers";
    const TEACHERS_KEY = "learnspaceTeachers";
    const OFFERING_FIELDS = ["curriculumCourseId", "teacherUserId", "teacherId"];
    const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
    const ALLOWED_ACCOUNT_STATUSES = new Set(["active", "disabled", "pending"]);
    const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    function isRecord(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function isNonemptyString(value) {
        return typeof value === "string" && value.trim() !== "";
    }

    function isValidTimestamp(value) {
        return isNonemptyString(value) && !Number.isNaN(Date.parse(value));
    }

    function readArray(key, allowMissing = false) {
        let rawValue;
        try {
            rawValue = localStorage.getItem(key);
        } catch (error) {
            return { success: false, message: `${key} could not be read.` };
        }

        if (rawValue === null && allowMissing) {
            return { success: true, records: [], rawValue };
        }
        if (typeof rawValue !== "string") {
            return { success: false, message: `${key} is unavailable or missing.` };
        }

        let records;
        try {
            records = JSON.parse(rawValue);
        } catch (error) {
            return { success: false, message: `${key} contains malformed JSON.` };
        }
        if (!Array.isArray(records)) {
            return { success: false, message: `${key} must contain a list.` };
        }
        return { success: true, records, rawValue };
    }

    function validateUsers(users) {
        const ids = new Set();
        const emails = new Set();
        for (const user of users) {
            if (!isRecord(user) || !isNonemptyString(user.id) ||
                !ALLOWED_ROLES.has(user.role) ||
                !ALLOWED_ACCOUNT_STATUSES.has(user.accountStatus)) {
                return { success: false, message: "Account data contains an invalid record." };
            }

            const email = String(user.email || "").trim().toLowerCase().replace(/[\r\n]/g, "");
            if (!EMAIL_PATTERN.test(email) || ids.has(user.id) || emails.has(email)) {
                return { success: false, message: "Account IDs or emails are invalid or duplicated." };
            }
            ids.add(user.id);
            emails.add(email);
        }
        return { success: true };
    }

    function validateTeachers(teachers, users) {
        const profileIds = new Set();
        const userIds = new Set();
        for (const profile of teachers) {
            if (!isRecord(profile) || !isNonemptyString(profile.teacherId) ||
                !isNonemptyString(profile.userId) || !isValidTimestamp(profile.createdAt)) {
                return { success: false, message: "Teacher profile data contains an invalid record." };
            }
            const linkedUsers = users.filter((user) => user.id === profile.userId);
            if (linkedUsers.length !== 1 || linkedUsers[0].role !== "teacher" ||
                profileIds.has(profile.teacherId) || userIds.has(profile.userId)) {
                return { success: false, message: "A Teacher profile link is invalid or duplicated." };
            }
            profileIds.add(profile.teacherId);
            userIds.add(profile.userId);
        }
        return { success: true };
    }

    function validateCurriculum(courses) {
        const ids = new Set();
        const codes = new Set();
        for (const course of courses) {
            if (!isRecord(course) || !isNonemptyString(course.id) ||
                !isNonemptyString(course.code) || !isNonemptyString(course.name) ||
                typeof course.description !== "string" || !isValidTimestamp(course.createdAt)) {
                return { success: false, message: "Official curriculum data contains an invalid subject." };
            }
            const code = course.code.trim().toLowerCase();
            if (ids.has(course.id) || codes.has(code)) {
                return { success: false, message: "Official curriculum IDs or codes are duplicated." };
            }
            ids.add(course.id);
            codes.add(code);
        }
        return { success: true };
    }

    function validateSemesters(semesters, curriculumCourses) {
        const curriculumIds = new Set(curriculumCourses.map((course) => course.id));
        const semesterIds = new Set();
        const semesterBySubjectId = new Map();
        for (const semester of semesters) {
            if (!isRecord(semester) || !isNonemptyString(semester.id) ||
                !isNonemptyString(semester.name) || !isNonemptyString(semester.academicYear) ||
                !["active", "inactive"].includes(semester.status) ||
                !Array.isArray(semester.curriculumCourseIds) ||
                !isValidTimestamp(semester.createdAt) || semesterIds.has(semester.id)) {
                return { success: false, message: "Semester data contains an invalid or duplicated record." };
            }
            semesterIds.add(semester.id);

            const localSubjects = new Set();
            for (const subjectId of semester.curriculumCourseIds) {
                if (!isNonemptyString(subjectId) || !curriculumIds.has(subjectId) ||
                    localSubjects.has(subjectId) || semesterBySubjectId.has(subjectId)) {
                    return { success: false, message: "Semester curriculum placements are invalid or duplicated." };
                }
                localSubjects.add(subjectId);
                semesterBySubjectId.set(subjectId, semester.id);
            }
        }
        return { success: true, semesterBySubjectId };
    }

    function isOfferingRecord(record) {
        return isRecord(record) && OFFERING_FIELDS.some((field) =>
            Object.prototype.hasOwnProperty.call(record, field)
        );
    }

    function validateCourses(records, curriculumCourses, users, teachers) {
        const ids = new Set();
        const subjectIds = new Set(curriculumCourses.map((course) => course.id));
        const teacherProfileByUserId = new Map(teachers.map((profile) => [profile.userId, profile]));
        const teacherSubjectPairs = new Set();
        for (const record of records) {
            if (!isRecord(record) || !isNonemptyString(record.id) || ids.has(record.id)) {
                return { success: false, message: "Course data contains a malformed record or duplicate ID." };
            }
            ids.add(record.id);

            if (!isOfferingRecord(record)) {
                // Valid legacy courses remain in storage but are never returned
                // as Student-eligible offerings.
                if (!isNonemptyString(record.name) || typeof record.description !== "string" ||
                    (record.instructor !== undefined && typeof record.instructor !== "string")) {
                    return { success: false, message: "Legacy course data contains an invalid record." };
                }
                continue;
            }

            if (!OFFERING_FIELDS.every((field) => isNonemptyString(record[field])) ||
                !isNonemptyString(record.name) || typeof record.description !== "string" ||
                (record.instructor !== undefined && typeof record.instructor !== "string")) {
                return { success: false, message: "An offering is incomplete or malformed." };
            }
            if (!subjectIds.has(record.curriculumCourseId)) {
                return { success: false, message: "An offering refers to a missing curriculum subject." };
            }

            const linkedUsers = users.filter((user) => user.id === record.teacherUserId);
            const linkedProfile = teacherProfileByUserId.get(record.teacherUserId);
            if (linkedUsers.length !== 1 || linkedUsers[0].role !== "teacher" ||
                !linkedProfile || linkedProfile.teacherId !== record.teacherId) {
                return { success: false, message: "An offering has an invalid Teacher account/profile relationship." };
            }

            const pair = JSON.stringify([record.teacherUserId, record.curriculumCourseId]);
            if (teacherSubjectPairs.has(pair)) {
                return { success: false, message: "A Teacher has duplicate offerings for one subject." };
            }
            teacherSubjectPairs.add(pair);
        }
        return { success: true };
    }

    function readEligibleOfferings() {
        const evaluator = window.LearnSpaceStudentAccess;
        if (!evaluator || typeof evaluator.evaluateStudentAccess !== "function") {
            return { success: false, message: "Student access validation is unavailable." };
        }

        let access;
        try {
            access = evaluator.evaluateStudentAccess();
        } catch (error) {
            return { success: false, message: "Student access could not be verified." };
        }
        if (!access?.allowed || access.code !== "access_granted" ||
            !isNonemptyString(access.userId) || !isNonemptyString(access.studentId) ||
            !isNonemptyString(access.semesterId)) {
            return { success: false, message: access?.message || "Student academic access is unavailable." };
        }

        const snapshots = {
            courses: readArray(COURSE_KEY, true),
            curriculum: readArray(CURRICULUM_KEY),
            semesters: readArray(SEMESTER_KEY),
            users: readArray(USERS_KEY),
            teachers: readArray(TEACHERS_KEY, true)
        };
        for (const snapshot of Object.values(snapshots)) {
            if (!snapshot.success) return snapshot;
        }

        const usersValidation = validateUsers(snapshots.users.records);
        const teachersValidation = usersValidation.success
            ? validateTeachers(snapshots.teachers.records, snapshots.users.records)
            : usersValidation;
        const curriculumValidation = validateCurriculum(snapshots.curriculum.records);
        if (!usersValidation.success || !teachersValidation.success || !curriculumValidation.success) {
            return { success: false, message: usersValidation.message || teachersValidation.message || curriculumValidation.message };
        }

        const semesterValidation = validateSemesters(
            snapshots.semesters.records,
            snapshots.curriculum.records
        );
        if (!semesterValidation.success) return semesterValidation;

        for (const offering of snapshots.courses.records) {
            if (isOfferingRecord(offering) &&
                !semesterValidation.semesterBySubjectId.has(offering.curriculumCourseId)) {
                return { success: false, message: "An offered subject has no valid semester placement." };
            }
        }

        const studentSemesterMatches = snapshots.semesters.records.filter((semester) =>
            semester.id === access.semesterId && semester.status === "active"
        );
        if (studentSemesterMatches.length !== 1) {
            return { success: false, message: "The allocated active semester could not be verified." };
        }

        const courseValidation = validateCourses(
            snapshots.courses.records,
            snapshots.curriculum.records,
            snapshots.users.records,
            snapshots.teachers.records
        );
        if (!courseValidation.success) return courseValidation;

        const eligibleOfferings = snapshots.courses.records.filter((record) =>
            isOfferingRecord(record) &&
            semesterValidation.semesterBySubjectId.get(record.curriculumCourseId) === access.semesterId
        );

        // Recheck every relationship snapshot and the Student allocation after
        // resolving. localStorage does not offer atomic multi-key reads.
        try {
            for (const [key, snapshot] of [
                [COURSE_KEY, snapshots.courses],
                [CURRICULUM_KEY, snapshots.curriculum],
                [SEMESTER_KEY, snapshots.semesters],
                [USERS_KEY, snapshots.users],
                [TEACHERS_KEY, snapshots.teachers]
            ]) {
                if (localStorage.getItem(key) !== snapshot.rawValue) {
                    return { success: false, message: "Course eligibility data changed during validation." };
                }
            }
        } catch (error) {
            return { success: false, message: "Course eligibility data could not be rechecked safely." };
        }

        let latestAccess;
        try {
            latestAccess = evaluator.evaluateStudentAccess();
        } catch (error) {
            return { success: false, message: "Student access could not be rechecked." };
        }
        if (!latestAccess?.allowed || latestAccess.userId !== access.userId ||
            latestAccess.studentId !== access.studentId ||
            latestAccess.semesterId !== access.semesterId) {
            return { success: false, message: "Student access or semester allocation changed during validation." };
        }

        return { success: true, offerings: eligibleOfferings, access };
    }

    globalThis.LearnSpaceStudentOfferings = Object.freeze({
        isOfferingRecord,
        readEligibleOfferings
    });
})();
