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

    function getCurrentTeacherIdentity() {
        const teacherAccess = window.LearnSpaceTeacherAccess;
        if (!teacherAccess || typeof teacherAccess.evaluate !== "function") {
            return { success: false, message: "Teacher access validation is unavailable." };
        }
        const identity = teacherAccess.evaluate();
        if (!identity?.allowed || !isNonemptyString(identity.userId) ||
            !isNonemptyString(identity.teacherId)) {
            return { success: false, message: "A valid active Teacher session is required." };
        }
        return { success: true, identity };
    }

    function readAndValidateOfferings() {
        const identityResult = getCurrentTeacherIdentity();
        if (!identityResult.success) return { ...identityResult, state: "unavailable" };

        const courseSnapshot = readArray(COURSE_STORAGE_KEY);
        const curriculumSnapshot = readArray(CURRICULUM_STORAGE_KEY);
        const semesterSnapshot = readArray(SEMESTER_STORAGE_KEY);
        for (const snapshot of [courseSnapshot, curriculumSnapshot, semesterSnapshot]) {
            if (!snapshot.success) return snapshot;
        }

        const courseValidation = validateCourseRecords(courseSnapshot.records);
        if (!courseValidation.success) return { ...courseValidation, state: "invalid" };
        const curriculumValidation = validateOfficialCurriculum(curriculumSnapshot.records);
        if (!curriculumValidation.success) return { ...curriculumValidation, state: "invalid" };
        const semesterValidation = validateSemesters(semesterSnapshot.records, curriculumSnapshot.records);
        if (!semesterValidation.success) return { ...semesterValidation, state: "invalid" };
        const offeringValidation = validateOfferingCollection(
            courseSnapshot.records,
            curriculumSnapshot.records,
            semesterSnapshot.records
        );
        if (!offeringValidation.success) return { ...offeringValidation, state: "invalid" };

        const rawValues = {
            courses: courseSnapshot.rawValue,
            curriculum: curriculumSnapshot.rawValue,
            semesters: semesterSnapshot.rawValue
        };
        if (!areSnapshotsCurrent(rawValues, identityResult.identity)) {
            return { success: false, state: "changed", message: "Teacher, course, or curriculum data changed during validation." };
        }
        return {
            success: true,
            state: courseSnapshot.state,
            records: courseSnapshot.records,
            curriculumCourses: curriculumSnapshot.records,
            semesters: semesterSnapshot.records,
            rawValues,
            identity: identityResult.identity
        };
    }

    function areSnapshotsCurrent(rawValues, expectedIdentity) {
        const currentIdentity = getCurrentTeacherIdentity();
        if (!currentIdentity.success ||
            currentIdentity.identity.userId !== expectedIdentity.userId ||
            currentIdentity.identity.teacherId !== expectedIdentity.teacherId) return false;
        try {
            return localStorage.getItem(COURSE_STORAGE_KEY) === rawValues.courses &&
                localStorage.getItem(CURRICULUM_STORAGE_KEY) === rawValues.curriculum &&
                localStorage.getItem(SEMESTER_STORAGE_KEY) === rawValues.semesters;
        } catch (error) {
            return false;
        }
    }

    function commitCourseRecords(snapshot, records) {
        const validation = validateOfferingCollection(
            records,
            snapshot.curriculumCourses,
            snapshot.semesters
        );
        if (!validation.success) return validation;
        if (!areSnapshotsCurrent(snapshot.rawValues, snapshot.identity)) {
            return { success: false, state: "changed", message: "Course or curriculum data changed before saving." };
        }

        const serialized = JSON.stringify(records);
        try {
            localStorage.setItem(COURSE_STORAGE_KEY, serialized);
            if (localStorage.getItem(COURSE_STORAGE_KEY) !== serialized) {
                return { success: false, state: "changed", message: "The updated course list could not be verified." };
            }
        } catch (error) {
            return { success: false, state: "unavailable", message: "The course list could not be saved." };
        }
        return { success: true, records, rawValue: serialized };
    }

    function createOffering(curriculumCourseId, description = "") {
        const snapshot = readAndValidateOfferings();
        if (!snapshot.success) return snapshot;
        if (!isNonemptyString(curriculumCourseId) || typeof description !== "string") {
            return { success: false, message: "Choose a valid official curriculum subject." };
        }
        const subject = snapshot.curriculumCourses.find((item) => item.id === curriculumCourseId);
        if (!subject) return { success: false, message: "The selected curriculum subject is unavailable." };

        const semesterValidation = validateSemesters(snapshot.semesters, snapshot.curriculumCourses);
        const semester = snapshot.semesters.find((item) => item.curriculumCourseIds.includes(subject.id));
        if (!semesterValidation.success || !semester || semester.status !== "active") {
            return { success: false, message: "The subject must have one valid active semester placement." };
        }

        if (snapshot.records.some((record) => isOfferingRecord(record) &&
            record.teacherUserId === snapshot.identity.userId &&
            record.teacherId === snapshot.identity.teacherId &&
            record.curriculumCourseId === subject.id)) {
            return { success: false, message: "You already offer this official subject." };
        }

        let id;
        try {
            id = crypto.randomUUID();
        } catch (error) {
            return { success: false, message: "A unique offering ID could not be generated." };
        }
        if (!isNonemptyString(id) || snapshot.records.some((record) => record.id === id)) {
            return { success: false, message: "A unique offering ID could not be generated." };
        }
        const offering = {
            id,
            name: subject.name,
            description: description.trim() || subject.description,
            curriculumCourseId: subject.id,
            teacherUserId: snapshot.identity.userId,
            teacherId: snapshot.identity.teacherId
        };
        const result = commitCourseRecords(snapshot, [...snapshot.records, offering]);
        return result.success ? { ...result, offering } : result;
    }

    function updateOfferingDescription(offeringId, expectedOfferingSnapshot, description) {
        if (typeof expectedOfferingSnapshot !== "string" || typeof description !== "string") {
            return { success: false, message: "The offering edit snapshot is invalid." };
        }
        const snapshot = readAndValidateOfferings();
        if (!snapshot.success) return snapshot;
        const index = snapshot.records.findIndex((record) => record.id === offeringId);
        const current = snapshot.records[index];
        if (!current || !isOfferingRecord(current) ||
            current.teacherUserId !== snapshot.identity.userId ||
            current.teacherId !== snapshot.identity.teacherId) {
            return { success: false, message: "This offering is not owned by the current Teacher." };
        }
        if (JSON.stringify(current) !== expectedOfferingSnapshot) {
            return { success: false, state: "changed", message: "This offering changed before it could be saved. Reload and try again." };
        }

        const updatedOffering = { ...current, description: description.trim() };
        const updatedRecords = snapshot.records.slice();
        updatedRecords[index] = updatedOffering;
        const result = commitCourseRecords(snapshot, updatedRecords);
        return result.success ? { ...result, offering: updatedOffering } : result;
    }

    function validateContentForDeletion(rawValue) {
        if (rawValue === null) return { success: true, data: null };
        let data;
        try {
            data = JSON.parse(rawValue);
        } catch (error) {
            return { success: false, message: "The offering content is malformed. Nothing was deleted." };
        }
        if (!isRecord(data)) {
            return { success: false, message: "The offering content is not a valid record. Nothing was deleted." };
        }
        for (const key of ["materials", "assignments", "quizzes", "submissions"]) {
            if (Object.prototype.hasOwnProperty.call(data, key) &&
                (!Array.isArray(data[key]) || data[key].some((item) => !isRecord(item)))) {
                return { success: false, message: "The offering content contains malformed records. Nothing was deleted." };
            }
        }
        return { success: true, data };
    }

    function restoreCourseSnapshot(snapshot, updatedRawValue) {
        try {
            if (localStorage.getItem(COURSE_STORAGE_KEY) !== updatedRawValue ||
                !areSnapshotsCurrent({ ...snapshot.rawValues, courses: updatedRawValue }, snapshot.identity)) {
                return false;
            }
            if (snapshot.rawValues.courses === null) localStorage.removeItem(COURSE_STORAGE_KEY);
            else localStorage.setItem(COURSE_STORAGE_KEY, snapshot.rawValues.courses);
            return localStorage.getItem(COURSE_STORAGE_KEY) === snapshot.rawValues.courses;
        } catch (error) {
            return false;
        }
    }

    function deleteOffering(offeringId, expectedOfferingSnapshot) {
        if (typeof expectedOfferingSnapshot !== "string") {
            return { success: false, message: "The offering deletion snapshot is invalid." };
        }
        const snapshot = readAndValidateOfferings();
        if (!snapshot.success) return snapshot;
        const index = snapshot.records.findIndex((record) => record.id === offeringId);
        const current = snapshot.records[index];
        if (!current || !isOfferingRecord(current) ||
            current.teacherUserId !== snapshot.identity.userId ||
            current.teacherId !== snapshot.identity.teacherId) {
            return { success: false, message: "This offering is not owned by the current Teacher." };
        }
        if (JSON.stringify(current) !== expectedOfferingSnapshot) {
            return { success: false, state: "changed", message: "This offering changed before deletion. Reload and try again." };
        }

        const contentKey = `learnspaceContent_${offeringId}`;
        let contentRawValue;
        try {
            contentRawValue = localStorage.getItem(contentKey);
        } catch (error) {
            return { success: false, message: "Offering content could not be read. Nothing was deleted." };
        }
        const contentValidation = validateContentForDeletion(contentRawValue);
        if (!contentValidation.success) return contentValidation;

        const updatedRecords = snapshot.records.filter((record) => record.id !== offeringId);
        const validation = validateOfferingCollection(
            updatedRecords,
            snapshot.curriculumCourses,
            snapshot.semesters
        );
        if (!validation.success) return validation;
        if (!areSnapshotsCurrent(snapshot.rawValues, snapshot.identity)) {
            return { success: false, state: "changed", message: "Course or curriculum data changed before deletion." };
        }
        try {
            if (localStorage.getItem(contentKey) !== contentRawValue) {
                return { success: false, state: "changed", message: "Offering content changed before deletion." };
            }
        } catch (error) {
            return { success: false, message: "Offering content could not be rechecked. Nothing was deleted." };
        }

        const serialized = JSON.stringify(updatedRecords);
        try {
            localStorage.setItem(COURSE_STORAGE_KEY, serialized);
            if (localStorage.getItem(COURSE_STORAGE_KEY) !== serialized) {
                return { success: false, state: "changed", message: "Offering deletion could not be verified." };
            }
        } catch (error) {
            return { success: false, message: "Offering deletion could not be saved." };
        }

        if (contentRawValue !== null) {
            try {
                if (!areSnapshotsCurrent({ ...snapshot.rawValues, courses: serialized }, snapshot.identity) ||
                    localStorage.getItem(contentKey) !== contentRawValue) {
                    const restored = restoreCourseSnapshot(snapshot, serialized);
                    return {
                        success: false,
                        state: "changed",
                        message: restored
                            ? "Data changed during deletion. The offering was retained and no content was deleted."
                            : "Data changed during deletion. Content was preserved, but the offering list may need reloading."
                    };
                }
                localStorage.removeItem(contentKey);
                if (localStorage.getItem(contentKey) !== null) {
                    const restored = restoreCourseSnapshot(snapshot, serialized);
                    return {
                        success: false,
                        state: "changed",
                        message: restored
                            ? "Content deletion could not be verified. The offering was retained."
                            : "Content deletion could not be verified. Reload the offering list before continuing."
                    };
                }
            } catch (error) {
                const restored = restoreCourseSnapshot(snapshot, serialized);
                return {
                    success: false,
                    message: restored
                        ? "Content could not be deleted. The offering was retained."
                        : "Content deletion failed and the offering list could not be restored safely. Reload before continuing."
                };
            }
        }
        return { success: true, records: updatedRecords };
    }

    globalThis.LearnSpaceTeacherOfferingData = Object.freeze({
        isOfferingRecord,
        validateCourseRecords,
        validateStoredCourseCollection,
        validateOfficialCurriculum,
        validateSemesters,
        validateOfferingCollection,
        readAndValidateOfferings,
        createOffering,
        updateOfferingDescription,
        deleteOffering
    });
})();
