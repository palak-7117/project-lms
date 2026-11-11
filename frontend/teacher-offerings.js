"use strict";

// Read-only offering model for the existing learnspaceCourses collection.
// An offering uses the course's existing id as its stable offering ID and adds
// curriculumCourseId, teacherUserId, and teacherId. Legacy courses with none
// of those fields are left untouched and are not treated as offerings.
(() => {
    const COURSE_STORAGE_KEY = "learnspaceCourses";
    const CURRICULUM_STORAGE_KEY = "learnspaceCurriculumCourses";
    const SEMESTER_STORAGE_KEY = "learnspaceSemesters";
    const OFFERING_FIELDS = ["curriculumCourseId", "teacherUserId", "teacherId"];

    function isRecord(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function isNonemptyString(value) {
        return typeof value === "string" && value.trim() !== "";
    }

    function readArray(key) {
        let rawValue;
        try {
            rawValue = localStorage.getItem(key);
        } catch (error) {
            return { success: false, state: "unavailable", message: `${key} could not be read.` };
        }
        if (rawValue === null) {
            return { success: true, state: "missing", records: [], rawValue };
        }
        let records;
        try {
            records = JSON.parse(rawValue);
        } catch (error) {
            return { success: false, state: "malformed-json", message: `${key} contains malformed JSON.` };
        }
        if (!Array.isArray(records)) {
            return { success: false, state: "non-array", message: `${key} must contain a list.` };
        }
        return { success: true, state: records.length ? "populated" : "empty", records, rawValue };
    }

    function validateOfficialCurriculum(records) {
        if (!Array.isArray(records)) return { success: false, message: "Curriculum data must be a list." };
        const ids = new Set();
        const codes = new Set();
        for (const course of records) {
            if (!isRecord(course) || !isNonemptyString(course.id)) {
                return { success: false, message: "Curriculum contains a malformed subject or missing ID." };
            }
            if (ids.has(course.id)) return { success: false, message: "Curriculum subject IDs must be unique." };
            if (!isNonemptyString(course.code) || !isNonemptyString(course.name) ||
                typeof course.description !== "string" || !isNonemptyString(course.createdAt) ||
                Number.isNaN(Date.parse(course.createdAt))) {
                return { success: false, message: "Curriculum contains an invalid subject record." };
            }
            const normalizedCode = course.code.trim().toLowerCase();
            if (codes.has(normalizedCode)) {
                return { success: false, message: "Curriculum subject codes must be unique." };
            }
            ids.add(course.id);
            codes.add(normalizedCode);
        }
        return { success: true, message: "" };
    }

    function validateSemesters(records, curriculumCourses) {
        if (!Array.isArray(records)) return { success: false, message: "Semester data must be a list." };
        const curriculumValidation = validateOfficialCurriculum(curriculumCourses);
        if (!curriculumValidation.success) return curriculumValidation;

        const semesterIds = new Set();
        const curriculumIds = new Set(curriculumCourses.map((course) => course.id));
        const semesterByCourseId = new Map();
        for (const semester of records) {
            if (!isRecord(semester) || !isNonemptyString(semester.id)) {
                return { success: false, message: "Semester data contains a malformed record or missing ID." };
            }
            if (semesterIds.has(semester.id)) {
                return { success: false, message: "Semester IDs must be unique." };
            }
            if (!isNonemptyString(semester.name) || !isNonemptyString(semester.academicYear) ||
                (semester.status !== "active" && semester.status !== "inactive") ||
                !Array.isArray(semester.curriculumCourseIds) || !isNonemptyString(semester.createdAt) ||
                Number.isNaN(Date.parse(semester.createdAt))) {
                return { success: false, message: "Semester data contains an invalid record." };
            }

            const localCourseIds = new Set();
            for (const courseId of semester.curriculumCourseIds) {
                if (!isNonemptyString(courseId) || localCourseIds.has(courseId) ||
                    !curriculumIds.has(courseId) || semesterByCourseId.has(courseId)) {
                    return {
                        success: false,
                        message: "Semester data contains an invalid or duplicate subject placement."
                    };
                }
                localCourseIds.add(courseId);
                semesterByCourseId.set(courseId, semester.id);
            }
            semesterIds.add(semester.id);
        }
        return { success: true, message: "", semesterByCourseId };
    }

    function isOfferingRecord(course) {
        return isRecord(course) && OFFERING_FIELDS.some((field) =>
            Object.prototype.hasOwnProperty.call(course, field)
        );
    }

    function validateCourseRecords(records) {
        if (!Array.isArray(records)) return { success: false, message: "Course data must be a list." };
        const allCourseIds = new Set();
        let hasOfferings = false;
        for (const course of records) {
            if (!isRecord(course) || !isNonemptyString(course.id)) {
                return { success: false, message: "Course data contains a malformed record or missing ID." };
            }
            if (allCourseIds.has(course.id)) {
                return { success: false, message: "Course and offering IDs must be unique." };
            }
            allCourseIds.add(course.id);

            if (isOfferingRecord(course)) {
                hasOfferings = true;
                if (!OFFERING_FIELDS.every((field) => isNonemptyString(course[field]))) {
                    return {
                        success: false,
                        message: "An offering must link a curriculum subject, Teacher account, and Teacher profile."
                    };
                }
                // Keep the fields the current Teacher dashboard and course-detail
                // page still consume until a later approved UI resolves these from
                // the linked curriculum and identity records.
                if (!isNonemptyString(course.name) || typeof course.description !== "string" ||
                    (course.instructor !== undefined && typeof course.instructor !== "string")) {
                    return { success: false, message: "An offering is missing required course display fields." };
                }
                continue;
            }

            // Existing dashboard records use id, name, instructor, and description.
            // instructor is optional in the course-detail view, but if present it
            // must remain text. Never coerce or repair malformed stored records.
            if (!isNonemptyString(course.name) || typeof course.description !== "string" ||
                (course.instructor !== undefined && typeof course.instructor !== "string")) {
                return { success: false, message: "A legacy course record is incomplete or malformed." };
            }
        }
        return { success: true, message: "", hasOfferings };
    }

    function validateOfferingCollection(records, curriculumCourses, semesters) {
        const courseValidation = validateCourseRecords(records);
        if (!courseValidation.success) return courseValidation;
        if (!courseValidation.hasOfferings) return { success: true, message: "" };

        const curriculumValidation = validateOfficialCurriculum(curriculumCourses);
        if (!curriculumValidation.success) return curriculumValidation;
        const semesterValidation = validateSemesters(semesters, curriculumCourses);
        if (!semesterValidation.success) return semesterValidation;

        const offeringsByTeacherSubject = new Set();
        const verifiedIdentities = new Set();
        const curriculumIds = new Set(curriculumCourses.map((course) => course.id));
        const teacherAccess = window.LearnSpaceTeacherAccess;

        for (const course of records) {
            if (!isOfferingRecord(course)) continue;
            if (!curriculumIds.has(course.curriculumCourseId)) {
                return { success: false, message: "An offering references a missing curriculum subject." };
            }
            if (!semesterValidation.semesterByCourseId.has(course.curriculumCourseId)) {
                return { success: false, message: "An offered subject must have one official semester placement." };
            }

            const relationKey = JSON.stringify([course.teacherUserId, course.curriculumCourseId]);
            if (offeringsByTeacherSubject.has(relationKey)) {
                return { success: false, message: "A Teacher cannot have duplicate offerings for the same subject." };
            }
            offeringsByTeacherSubject.add(relationKey);

            const identityKey = JSON.stringify([course.teacherUserId, course.teacherId]);
            if (verifiedIdentities.has(identityKey)) continue;
            if (!teacherAccess || typeof teacherAccess.validateTeacherIdentity !== "function") {
                return { success: false, message: "Teacher identity validation is unavailable." };
            }
            const identity = teacherAccess.validateTeacherIdentity(course.teacherUserId, course.teacherId);
            if (!identity || identity.valid !== true) {
                return { success: false, message: "An offering has an invalid Teacher account/profile relationship." };
            }
            verifiedIdentities.add(identityKey);
        }
        return { success: true, message: "" };
    }

    function validateStoredCourseCollection(records) {
        const recordValidation = validateCourseRecords(records);
        if (!recordValidation.success || !recordValidation.hasOfferings) return recordValidation;

        const curriculumSnapshot = readArray(CURRICULUM_STORAGE_KEY);
        const semesterSnapshot = readArray(SEMESTER_STORAGE_KEY);
        if (!curriculumSnapshot.success) return curriculumSnapshot;
        if (!semesterSnapshot.success) return semesterSnapshot;

        const validation = validateOfferingCollection(
            records,
            curriculumSnapshot.records,
            semesterSnapshot.records
        );
        if (!validation.success) return validation;
        try {
            if (localStorage.getItem(CURRICULUM_STORAGE_KEY) !== curriculumSnapshot.rawValue ||
                localStorage.getItem(SEMESTER_STORAGE_KEY) !== semesterSnapshot.rawValue) {
                return { success: false, state: "changed", message: "Curriculum or semester data changed during validation." };
            }
        } catch (error) {
            return { success: false, state: "unavailable", message: "Curriculum or semester data could not be rechecked safely." };
        }
        return validation;
    }

    function readAndValidateOfferings() {
        const courseSnapshot = readArray(COURSE_STORAGE_KEY);
        if (!courseSnapshot.success) return courseSnapshot;
        const validation = validateStoredCourseCollection(courseSnapshot.records);
        if (!validation.success) return { ...validation, state: "invalid" };

        try {
            if (localStorage.getItem(COURSE_STORAGE_KEY) !== courseSnapshot.rawValue) {
                return { success: false, state: "changed", message: "Offering data changed during validation." };
            }
        } catch (error) {
            return { success: false, state: "unavailable", message: "Offering data could not be rechecked safely." };
        }
        return { success: true, state: courseSnapshot.state, records: courseSnapshot.records };
    }

    globalThis.LearnSpaceTeacherOfferingData = Object.freeze({
        isOfferingRecord,
        validateCourseRecords,
        validateStoredCourseCollection,
        validateOfficialCurriculum,
        validateSemesters,
        validateOfferingCollection,
        readAndValidateOfferings
    });
})();
