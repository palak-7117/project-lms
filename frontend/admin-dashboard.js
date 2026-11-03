"use strict";

const USER_STORAGE_KEY = "learnspaceUsers";
const STUDENT_STORAGE_KEY = "learnspaceStudents";
const TEACHER_STORAGE_KEY = "learnspaceTeachers";
const SEMESTER_STORAGE_KEY = "learnspaceSemesters";
const CURRICULUM_COURSE_STORAGE_KEY = "learnspaceCurriculumCourses";
const SESSION_STORAGE_KEY = "learnspaceSession";

const ADMIN_ARRAY_STORAGE_KEYS = new Set([
    USER_STORAGE_KEY,
    STUDENT_STORAGE_KEY,
    TEACHER_STORAGE_KEY,
    SEMESTER_STORAGE_KEY,
    CURRICULUM_COURSE_STORAGE_KEY
]);
const ORIGINAL_RECORD_ID = Symbol("originalRecordId");
const allowedRoles = new Set(["student", "teacher", "admin"]);
const allowedAccountStatuses = new Set(["active", "disabled", "pending"]);
const allowedAdmissionStatuses = new Set(["pending", "admitted", "rejected"]);
const allowedAuthorizationStatuses = new Set(["pending", "authorized", "revoked"]);
let selectedCurriculumCourseId = null;
let selectedCurriculumCourseSnapshot = null;
let selectedSemesterId = null;
let selectedSemesterSnapshot = null;

// These helpers support Admin accounts, profiles, semesters, and official
// curriculum. Teacher offerings and their content keys are not accepted here.
function readArrayFromStorage(key) {
    if (!ADMIN_ARRAY_STORAGE_KEYS.has(key)) {
        return {
            state: "unavailable",
            message: "This storage key is outside the Admin data helper scope."
        };
    }

    let savedValue;
    try {
        savedValue = localStorage.getItem(key);
    } catch (error) {
        return {
            state: "unavailable",
            message: "Browser storage is unavailable. No data was changed."
        };
    }

    if (savedValue === null) {
        return { state: "missing", rawValue: null };
    }

    let records;
    try {
        records = JSON.parse(savedValue);
    } catch (error) {
        return {
            state: "malformed-json",
            rawValue: savedValue,
            message: "Saved data is not valid JSON. It was left unchanged."
        };
    }

    if (!Array.isArray(records)) {
        return {
            state: "non-array",
            rawValue: savedValue,
            message: "Saved data is not a list. It was left unchanged."
        };
    }

    return {
        state: records.length === 0 ? "empty" : "populated",
        records,
        rawValue: savedValue
    };
}

function isReadableArrayState(state) {
    return state === "empty" || state === "populated";
}

function validateRecordIds(records, idField = "id") {
    if (!Array.isArray(records)) {
        return { success: false, message: "The proposed records must be a list." };
    }

    const seenIds = new Set();
    for (const record of records) {
        if (!record || typeof record !== "object" || Array.isArray(record)) {
            return { success: false, message: "A record is malformed." };
        }

        const id = record[idField];
        if (typeof id !== "string" || !id.trim()) {
            return { success: false, message: "A record is missing its required ID." };
        }

        if (seenIds.has(id)) {
            return { success: false, message: "Duplicate record IDs are not allowed." };
        }
        seenIds.add(id);
    }

    return { success: true, message: "" };
}

function validateUsers(users) {
    const idValidation = validateRecordIds(users, "id");
    if (!idValidation.success) return idValidation;

    const seenEmails = new Set();
    for (const user of users) {
        if (!allowedRoles.has(user.role)) {
            return { success: false, message: "An account has an invalid role." };
        }

        if (!allowedAccountStatuses.has(user.accountStatus)) {
            return { success: false, message: "An account has an invalid status." };
        }

        const emailInput = document.createElement("input");
        emailInput.type = "email";
        emailInput.required = true;
        emailInput.value = String(user.email || "").trim().toLowerCase();

        if (!emailInput.checkValidity()) {
            return { success: false, message: "An account has an invalid email address." };
        }

        if (seenEmails.has(emailInput.value)) {
            return { success: false, message: "Duplicate normalized account emails are not allowed." };
        }
        seenEmails.add(emailInput.value);
    }

    return { success: true, message: "" };
}

function hasValidCreatedAt(value) {
    return typeof value === "string" &&
        value.trim() !== "" &&
        !Number.isNaN(Date.parse(value));
}

function validateCurriculumCourses(courses) {
    const idValidation = validateRecordIds(courses, "id");
    if (!idValidation.success) return idValidation;

    const seenCodes = new Set();
    for (const course of courses) {
        if (typeof course.code !== "string" || !course.code.trim()) {
            return { success: false, message: "A curriculum course must have a nonempty code." };
        }

        if (typeof course.name !== "string" || !course.name.trim()) {
            return { success: false, message: "A curriculum course must have a nonempty name." };
        }

        if (typeof course.description !== "string") {
            return { success: false, message: "A curriculum course description must be text." };
        }

        if (!hasValidCreatedAt(course.createdAt)) {
            return { success: false, message: "A curriculum course has an invalid creation timestamp." };
        }

        const normalizedCode = course.code.trim().toLowerCase();
        if (seenCodes.has(normalizedCode)) {
            return { success: false, message: "Curriculum course codes must be unique, ignoring case and surrounding whitespace." };
        }
        seenCodes.add(normalizedCode);
    }

    return { success: true, message: "" };
}

function validateSemesterRecords(semesters, curriculumCourses = [], enforceGlobalCourseUniqueness = true) {
    const idValidation = validateRecordIds(semesters, "id");
    if (!idValidation.success) return idValidation;

    const courseValidation = validateCurriculumCourses(curriculumCourses);
    if (!courseValidation.success) {
        return {
            success: false,
            message: `Curriculum course data must be valid before semester links can be checked. ${courseValidation.message}`
        };
    }

    const curriculumCourseIds = new Set(curriculumCourses.map((course) => course.id));
    const semesterByCourseId = new Map();
    for (const semester of semesters) {
        if (typeof semester.name !== "string" || !semester.name.trim()) {
            return { success: false, message: "A semester must have a nonempty name." };
        }

        if (typeof semester.academicYear !== "string" || !semester.academicYear.trim()) {
            return { success: false, message: "A semester must have a nonempty academic year." };
        }

        if (semester.status !== "active" && semester.status !== "inactive") {
            return { success: false, message: "A semester status must be active or inactive." };
        }

        if (!Array.isArray(semester.curriculumCourseIds)) {
            return { success: false, message: "A semester's curriculumCourseIds must be a list." };
        }

        const seenCourseIds = new Set();
        for (const courseId of semester.curriculumCourseIds) {
            if (typeof courseId !== "string" || !courseId.trim()) {
                return { success: false, message: "Semester curriculum course IDs must be nonempty text values." };
            }

            if (seenCourseIds.has(courseId)) {
                return { success: false, message: "A semester cannot contain the same curriculum course more than once." };
            }

            if (!curriculumCourseIds.has(courseId)) {
                return { success: false, message: "A semester refers to a curriculum course that does not exist." };
            }

            if (enforceGlobalCourseUniqueness && semesterByCourseId.has(courseId)) {
                return { success: false, message: "A curriculum course can belong to only one semester." };
            }

            seenCourseIds.add(courseId);
            if (!semesterByCourseId.has(courseId)) semesterByCourseId.set(courseId, semester.id);
        }

        if (!hasValidCreatedAt(semester.createdAt)) {
            return { success: false, message: "A semester has an invalid creation timestamp." };
        }
    }

    return { success: true, message: "" };
}

function validateSemesters(semesters, curriculumCourses = []) {
    return validateSemesterRecords(semesters, curriculumCourses, true);
}

// Repair inspection may tolerate cross-semester duplicates only. All other
// semester and curriculum relationship rules remain enforced.
function validateSemestersForDuplicateRepair(semesters, curriculumCourses = []) {
    return validateSemesterRecords(semesters, curriculumCourses, false);
}

function getDuplicateCurriculumMemberships(semesters, curriculumCourses) {
    const validation = validateSemestersForDuplicateRepair(semesters, curriculumCourses);
    if (!validation.success) return { success: false, message: validation.message, duplicates: [] };

    const courseById = new Map(curriculumCourses.map((course) => [course.id, course]));
    const membershipsByCourseId = new Map();
    for (const semester of semesters) {
        for (const courseId of semester.curriculumCourseIds) {
            if (!membershipsByCourseId.has(courseId)) membershipsByCourseId.set(courseId, []);
            membershipsByCourseId.get(courseId).push({
                semesterId: semester.id,
                semesterName: semester.name,
                academicYear: semester.academicYear
            });
        }
    }

    const duplicates = [];
    for (const [courseId, memberships] of membershipsByCourseId) {
        if (memberships.length < 2) continue;
        const course = courseById.get(courseId);
        duplicates.push({
            courseId,
            courseCode: course.code,
            courseName: course.name,
            semesters: memberships,
            membershipCount: memberships.length
        });
    }

    return { success: true, message: "", duplicates };
}

function readCurriculumCoursesForRelationshipValidation() {
    const courseState = readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);

    // A missing curriculum collection is an empty read-only snapshot. It is
    // never created here; semester references will fail validation if present.
    if (courseState.state === "missing") {
        return { success: true, courses: [] };
    }

    if (!isReadableArrayState(courseState.state)) {
        return {
            success: false,
            message: courseState.message || "Curriculum course data is unavailable."
        };
    }

    const validation = validateCurriculumCourses(courseState.records);
    if (!validation.success) {
        return {
            success: false,
            message: `Curriculum course data is invalid. ${validation.message}`
        };
    }

    return { success: true, courses: courseState.records };
}

function validateProfiles(profiles, role, users) {
    if (role !== "student" && role !== "teacher") {
        return { success: false, message: "A profile role must be Student or Teacher." };
    }

    const userValidation = validateUsers(users);
    if (!userValidation.success) {
        return { success: false, message: "Account data must be valid before profile links can be checked." };
    }

    const profileIdKey = role === "student" ? "studentId" : "teacherId";
    const idValidation = validateRecordIds(profiles, profileIdKey);
    if (!idValidation.success) return idValidation;

    const seenUserIds = new Set();
    for (const profile of profiles) {
        if (typeof profile.userId !== "string" || !profile.userId.trim()) {
            return { success: false, message: `A ${role} profile is missing its linked user ID.` };
        }

        const linkedUsers = users.filter((user) => user.id === profile.userId);
        if (linkedUsers.length !== 1 || linkedUsers[0].role !== role) {
            return { success: false, message: `A ${role} profile does not link to exactly one matching account.` };
        }

        if (!hasValidCreatedAt(profile.createdAt)) {
            return { success: false, message: `A ${role} profile has an invalid creation timestamp.` };
        }

        if (seenUserIds.has(profile.userId)) {
            return { success: false, message: `More than one ${role} profile links to the same account.` };
        }
        seenUserIds.add(profile.userId);

        if (role === "student") {
            const hasSemesterId = Object.prototype.hasOwnProperty.call(profile, "semesterId");
            const semesterIsValid = profile.semesterId === null ||
                (typeof profile.semesterId === "string" && profile.semesterId.trim());

            if (!allowedAdmissionStatuses.has(profile.admissionStatus) ||
                !allowedAuthorizationStatuses.has(profile.authorizationStatus) ||
                !hasSemesterId || !semesterIsValid) {
                return { success: false, message: "A Student profile has invalid admission, authorization, or semester data." };
            }
        }
    }

    return { success: true, message: "" };
}

function validateExistingProfilesForUsers(users) {
    for (const [key, role] of [
        [STUDENT_STORAGE_KEY, "student"],
        [TEACHER_STORAGE_KEY, "teacher"]
    ]) {
        const profileState = readArrayFromStorage(key);

        // A missing profile key contains no saved profiles. Do not write or
        // convert it here; only validate profile records that actually exist.
        if (profileState.state === "missing") continue;
        if (!isReadableArrayState(profileState.state)) {
            return { success: false, message: profileState.message };
        }

        const validation = validateProfiles(profileState.records, role, users);
        if (!validation.success) return validation;
    }

    return { success: true, message: "" };
}

function validateCollectionForKey(key, records, relationshipRecords = null) {
    if (key === USER_STORAGE_KEY) {
        const validation = validateUsers(records);
        if (!validation.success) return validation;
        return validateExistingProfilesForUsers(records);
    }

    const role = key === STUDENT_STORAGE_KEY
        ? "student"
        : key === TEACHER_STORAGE_KEY
            ? "teacher"
            : null;
    if (!role) {
        if (key === CURRICULUM_COURSE_STORAGE_KEY) {
            const courseValidation = validateCurriculumCourses(records);
            if (!courseValidation.success) return courseValidation;

            const semesters = relationshipRecords === null
                ? readArrayFromStorage(SEMESTER_STORAGE_KEY)
                : { state: "populated", records: relationshipRecords };
            if (semesters.state === "missing") return { success: true, message: "" };
            if (!isReadableArrayState(semesters.state)) {
                return {
                    success: false,
                    message: semesters.message || "Semester data is unavailable, so curriculum relationships could not be checked."
                };
            }
            return validateSemesters(semesters.records, records);
        }

        if (key === SEMESTER_STORAGE_KEY) {
            let courses;
            if (relationshipRecords !== null) {
                courses = relationshipRecords;
            } else {
                const curriculumSnapshot = readCurriculumCoursesForRelationshipValidation();
                if (!curriculumSnapshot.success) {
                    return { success: false, message: curriculumSnapshot.message };
                }
                courses = curriculumSnapshot.courses;
            }
            return validateSemesters(records, courses);
        }

        return { success: false, message: "This storage key is outside the Admin data helper scope." };
    }

    const usersState = readArrayFromStorage(USER_STORAGE_KEY);
    if (!isReadableArrayState(usersState.state)) {
        return { success: false, message: "Valid account data is required to verify profile links." };
    }

    return validateProfiles(records, role, usersState.records);
}

function readRelationshipSnapshotForUpdate(key) {
    if (key === SEMESTER_STORAGE_KEY) {
        const result = readCurriculumCoursesForRelationshipValidation();
        return result.success
            ? { success: true, records: result.courses }
            : result;
    }

    if (key === CURRICULUM_COURSE_STORAGE_KEY) {
        const semesterState = readArrayFromStorage(SEMESTER_STORAGE_KEY);
        if (semesterState.state === "missing") {
            return { success: true, records: [] };
        }
        if (!isReadableArrayState(semesterState.state)) {
            return {
                success: false,
                message: semesterState.message || "Semester data is unavailable, so curriculum relationships could not be checked."
            };
        }
        return { success: true, records: semesterState.records };
    }

    return { success: true, records: null };
}

function getRecordIdField(key) {
    if (key === STUDENT_STORAGE_KEY) return "studentId";
    if (key === TEACHER_STORAGE_KEY) return "teacherId";
    return "id";
}

function createUpdateDraft(records, idField) {
    return JSON.parse(JSON.stringify(records)).map((record, index) => {
        Object.defineProperty(record, ORIGINAL_RECORD_ID, {
            value: records[index][idField],
            enumerable: false
        });
        return record;
    });
}

function validateUpdateDraftIdentity(proposedRecords, draftRecords, idField) {
    if (!Array.isArray(proposedRecords)) {
        return { success: false, message: "The update must return a complete record list." };
    }

    const draftSet = new Set(draftRecords);
    const existingIds = new Set(draftRecords.map((record) => record[ORIGINAL_RECORD_ID]));
    let nextDraftIndex = 0;
    let newRecordsStarted = false;

    for (const record of proposedRecords) {
        if (!record || typeof record !== "object" || Array.isArray(record)) {
            return { success: false, message: "A proposed record is malformed." };
        }

        if (draftSet.has(record)) {
            if (newRecordsStarted) {
                return { success: false, message: "Existing records must remain in their original order before appended records." };
            }
            if (record !== draftRecords[nextDraftIndex]) {
                return { success: false, message: "Existing draft records cannot be replaced, removed, or reordered." };
            }
            if (record[idField] !== record[ORIGINAL_RECORD_ID]) {
                return { success: false, message: "Existing record IDs are immutable." };
            }
            nextDraftIndex += 1;
            continue;
        }

        if (record[ORIGINAL_RECORD_ID] !== undefined || existingIds.has(record[idField])) {
            return { success: false, message: "An existing record cannot be replaced by a new object." };
        }
        newRecordsStarted = true;
    }

    if (nextDraftIndex !== draftRecords.length) {
        return { success: false, message: "Existing records cannot be removed by this update helper." };
    }

    return { success: true, message: "" };
}

function preserveExistingFields(proposedRecords, existingRecords, idField) {
    const existingById = new Map(
        existingRecords.map((record) => [record[idField], record])
    );

    return proposedRecords.map((record) => {
        const previous = existingById.get(record && record[idField]);
        return previous ? { ...previous, ...record } : record;
    });
}

function restoreSingleKeyIfStillOurs(key, previousValue, attemptedValue) {
    try {
        const currentValue = localStorage.getItem(key);
        if (currentValue === previousValue) return { success: true };
        if (currentValue !== attemptedValue) {
            return {
                success: false,
                message: "The value changed during recovery and was left untouched."
            };
        }

        if (previousValue === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, previousValue);
        }

        if (localStorage.getItem(key) !== previousValue) {
            return { success: false, message: "The previous value could not be verified after recovery." };
        }
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: "Browser storage prevented recovery; check the affected data before retrying."
        };
    }
}

function haveSameJsonValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") {
        return false;
    }

    const leftIsArray = Array.isArray(left);
    if (leftIsArray !== Array.isArray(right)) return false;
    if (leftIsArray) {
        return left.length === right.length &&
            left.every((value, index) => haveSameJsonValue(value, right[index]));
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
        leftKeys.every((key, index) =>
            key === rightKeys[index] && haveSameJsonValue(left[key], right[key])
        );
}

// A missing key is only treated as an empty list when the caller explicitly
// opts into creation. localStorage has no atomic compare-and-swap operation;
// the re-read reduces, but cannot eliminate, cross-tab races.
// Update callbacks must mutate the supplied draft objects and return those
// same objects in their original order, followed only by newly created records.
// Replacing, removing, or reordering an existing object is rejected.
const runSafeArrayUpdate = (
    key,
    updateRecords,
    { allowMissing = false } = {},
    validateExisting = validateCollectionForKey,
    validateProposed = validateCollectionForKey
) => {
    if (!ADMIN_ARRAY_STORAGE_KEYS.has(key)) {
        return { success: false, message: "This storage key is outside the Admin data helper scope." };
    }
    if (typeof updateRecords !== "function") {
        return { success: false, message: "A record update function is required." };
    }

    const snapshot = readArrayFromStorage(key);
    let existingRecords;
    if (snapshot.state === "missing" && allowMissing === true) {
        existingRecords = [];
    } else if (isReadableArrayState(snapshot.state)) {
        existingRecords = snapshot.records;
    } else if (snapshot.state === "missing") {
        return { success: false, message: "No saved list exists. Explicit creation permission is required." };
    } else {
        return { success: false, message: snapshot.message || "Saved data is unavailable and was left unchanged." };
    }

    const relationshipSnapshot = readRelationshipSnapshotForUpdate(key);
    if (!relationshipSnapshot.success) {
        return { success: false, message: `Related data cannot be safely checked: ${relationshipSnapshot.message}` };
    }

    const existingValidation = validateExisting(
        key,
        existingRecords,
        relationshipSnapshot.records
    );
    if (!existingValidation.success) {
        return { success: false, message: `Saved data cannot be safely updated: ${existingValidation.message}` };
    }

    let draftRecords;
    let originalDraftRecords;
    let proposedRecords;
    try {
        draftRecords = createUpdateDraft(existingRecords, getRecordIdField(key));
        originalDraftRecords = [...draftRecords];
        proposedRecords = updateRecords(draftRecords);
    } catch (error) {
        return { success: false, message: "The proposed update could not be prepared. No data was changed." };
    }

    if (!Array.isArray(proposedRecords)) {
        return { success: false, message: "The update must return a complete record list. No data was changed." };
    }

    const identityValidation = validateUpdateDraftIdentity(
        proposedRecords,
        originalDraftRecords,
        getRecordIdField(key)
    );
    if (!identityValidation.success) {
        return { success: false, message: `${identityValidation.message} No data was changed.` };
    }

    try {
        proposedRecords = preserveExistingFields(
            proposedRecords,
            existingRecords,
            getRecordIdField(key)
        );
    } catch (error) {
        return { success: false, message: "The proposed records could not be checked. No data was changed." };
    }

    const proposedValidation = validateProposed(
        key,
        proposedRecords,
        relationshipSnapshot.records,
        existingRecords
    );
    if (!proposedValidation.success) {
        return { success: false, message: `The proposed update is invalid: ${proposedValidation.message} No data was changed.` };
    }

    let nextValue;
    let normalizedProposedRecords;
    try {
        nextValue = JSON.stringify(proposedRecords);
        normalizedProposedRecords = JSON.parse(nextValue);
    } catch (error) {
        return { success: false, message: "The proposed records could not be saved. No data was changed." };
    }

    if (haveSameJsonValue(normalizedProposedRecords, existingRecords)) {
        return { success: true, message: "No changes were needed." };
    }

    try {
        if (localStorage.getItem(key) !== snapshot.rawValue) {
            return { success: false, message: "Saved data changed in another tab. Refresh and try again; no values were overwritten." };
        }

        localStorage.setItem(key, nextValue);
        if (localStorage.getItem(key) !== nextValue) {
            const recovery = restoreSingleKeyIfStillOurs(key, snapshot.rawValue, nextValue);
            return {
                success: false,
                message: recovery.success
                    ? "The saved update could not be verified; the previous value was restored."
                    : `The saved update could not be verified. ${recovery.message}`
            };
        }
    } catch (error) {
        const recovery = restoreSingleKeyIfStillOurs(key, snapshot.rawValue, nextValue);
        return {
            success: false,
            message: recovery.success
                ? "The update failed. The previous value was preserved."
                : `The update failed. ${recovery.message}`
        };
    }

    return { success: true, message: "The record list was saved." };
};

function updateArrayInStorage(key, updateRecords, options = {}) {
    return runSafeArrayUpdate(key, updateRecords, options);
}

function getMembershipCounts(semesters) {
    const counts = new Map();
    for (const semester of semesters) {
        for (const courseId of semester.curriculumCourseIds) {
            counts.set(courseId, (counts.get(courseId) || 0) + 1);
        }
    }
    return counts;
}

function validateDuplicateRepairProposal(proposedRecords, existingRecords, curriculumCourses, semesterId, courseId) {
    const existingValidation = validateSemestersForDuplicateRepair(existingRecords, curriculumCourses);
    if (!existingValidation.success) return existingValidation;
    const proposedValidation = validateSemestersForDuplicateRepair(proposedRecords, curriculumCourses);
    if (!proposedValidation.success) return proposedValidation;

    const existingCounts = getMembershipCounts(existingRecords);
    const proposedCounts = getMembershipCounts(proposedRecords);
    if ((existingCounts.get(courseId) || 0) < 2 ||
        proposedCounts.get(courseId) !== existingCounts.get(courseId) - 1) {
        return { success: false, message: "The selected duplicate membership did not decrease exactly once." };
    }

    for (const [otherCourseId, count] of existingCounts) {
        if (otherCourseId !== courseId && (proposedCounts.get(otherCourseId) || 0) > count) {
            return { success: false, message: "The repair would increase another course's duplicate memberships." };
        }
    }

    const targetIndex = existingRecords.findIndex((semester) => semester.id === semesterId);
    if (targetIndex < 0 || proposedRecords.length !== existingRecords.length) {
        return { success: false, message: "The repair must preserve every existing semester." };
    }

    const expectedRecords = JSON.parse(JSON.stringify(existingRecords));
    const expectedTarget = expectedRecords[targetIndex];
    const membershipIndex = expectedTarget.curriculumCourseIds.indexOf(courseId);
    if (membershipIndex < 0 || expectedTarget.curriculumCourseIds.lastIndexOf(courseId) !== membershipIndex) {
        return { success: false, message: "The selected duplicate membership no longer exists exactly once in that semester." };
    }
    expectedTarget.curriculumCourseIds.splice(membershipIndex, 1);

    if (!haveSameJsonValue(proposedRecords, expectedRecords)) {
        return { success: false, message: "A duplicate repair may remove only the selected course membership." };
    }

    const remainingDuplicates = getDuplicateCurriculumMemberships(proposedRecords, curriculumCourses);
    if (!remainingDuplicates.success) return remainingDuplicates;
    if (remainingDuplicates.duplicates.length === 0) {
        return validateSemesters(proposedRecords, curriculumCourses);
    }

    return { success: true, message: "" };
}

// Private repair-only operation. Unlike the public updater, this path accepts
// existing cross-semester duplicates for inspection, but permits only one
// selected duplicate membership removal and applies all shared write safeguards.
const repairDuplicateSemesterMembership = (
    semesterId,
    courseId,
    expectedSemesterSnapshot,
    expectedDuplicateSemesterIds
) => {
    if (typeof semesterId !== "string" || !semesterId.trim() ||
        typeof courseId !== "string" || !courseId.trim() ||
        !expectedSemesterSnapshot || typeof expectedSemesterSnapshot !== "object" ||
        !Array.isArray(expectedDuplicateSemesterIds)) {
        return { success: false, message: "A semester, course, and duplicate snapshot are required." };
    }

    const currentSemesters = readArrayFromStorage(SEMESTER_STORAGE_KEY);
    if (!isReadableArrayState(currentSemesters.state)) {
        return { success: false, message: currentSemesters.message || "Semester data is unavailable." };
    }
    const courseSnapshot = readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    if (!isReadableArrayState(courseSnapshot.state)) {
        return { success: false, message: courseSnapshot.message || "Curriculum data is unavailable." };
    }
    const courseValidation = validateCurriculumCourses(courseSnapshot.records);
    if (!courseValidation.success) return { success: false, message: `Curriculum data is invalid. ${courseValidation.message}` };

    const duplicateResult = getDuplicateCurriculumMemberships(currentSemesters.records, courseSnapshot.records);
    if (!duplicateResult.success) return { success: false, message: duplicateResult.message };
    const duplicate = duplicateResult.duplicates.find((item) => item.courseId === courseId);
    if (!duplicate || duplicate.membershipCount < 2) {
        return { success: false, message: "That course no longer has a duplicate membership to repair." };
    }

    const expectedIds = [...expectedDuplicateSemesterIds].sort();
    const currentIds = duplicate.semesters.map((membership) => membership.semesterId).sort();
    if (!haveSameJsonValue(expectedIds, currentIds)) {
        return { success: false, message: "Duplicate memberships changed. Refresh the semester list before repairing." };
    }

    const selectedSemester = currentSemesters.records.find((semester) => semester.id === semesterId);
    if (!selectedSemester || !duplicate.semesters.some((membership) => membership.semesterId === semesterId) ||
        !haveSameJsonValue(selectedSemester, expectedSemesterSnapshot)) {
        return { success: false, message: "The selected semester changed. Refresh the semester list before repairing." };
    }

    let membershipRemoved = false;
    const result = runSafeArrayUpdate(
        SEMESTER_STORAGE_KEY,
        (draftRecords) => {
            const target = draftRecords.find((semester) => semester.id === semesterId);
            const draftDuplicates = getDuplicateCurriculumMemberships(draftRecords, courseSnapshot.records);
            const draftDuplicate = draftDuplicates.success &&
                draftDuplicates.duplicates.find((item) => item.courseId === courseId);
            if (!target || !haveSameJsonValue(target, expectedSemesterSnapshot) ||
                !draftDuplicate || draftDuplicate.membershipCount < 2 ||
                !haveSameJsonValue(
                    draftDuplicate.semesters.map((membership) => membership.semesterId).sort(),
                    expectedIds
                )) {
                return draftRecords;
            }

            const membershipIndex = target.curriculumCourseIds.indexOf(courseId);
            if (membershipIndex < 0 || target.curriculumCourseIds.lastIndexOf(courseId) !== membershipIndex) {
                return draftRecords;
            }
            target.curriculumCourseIds.splice(membershipIndex, 1);
            membershipRemoved = true;
            return draftRecords;
        },
        {},
        (key, records, courses) => key === SEMESTER_STORAGE_KEY
            ? validateSemestersForDuplicateRepair(records, courses)
            : validateCollectionForKey(key, records, courses),
        (key, records, courses, existingRecords) => key === SEMESTER_STORAGE_KEY
            ? validateDuplicateRepairProposal(records, existingRecords, courses, semesterId, courseId)
            : validateCollectionForKey(key, records, courses)
    );

    if (!result.success) return result;
    if (!membershipRemoved) {
        return { success: false, message: "The duplicate membership changed before the repair. No data was changed." };
    }
    return { success: true, message: "The selected duplicate membership was removed." };
};

// Reusable by Admin workflows. The allowlist excludes legacy teacher course
// offerings and all course-content keys.
window.LearnSpaceAdminData = Object.freeze({
    readArrayFromStorage,
    validateRecordIds,
    validateUsers,
    validateProfiles,
    validateSemesters,
    validateCurriculumCourses,
    updateArrayInStorage
});

function getProfileCount(profileKey, role, usersState) {
    const profileState = readArrayFromStorage(profileKey);

    if (profileState.state === "missing" || profileState.state === "empty") {
        return "0";
    }

    if (profileState.state !== "populated") {
        return "Unavailable";
    }

    if (!isReadableArrayState(usersState.state) || !validateUsers(usersState.records).success) {
        return "Unavailable";
    }

    const validation = validateProfiles(profileState.records, role, usersState.records);
    return validation.success ? String(profileState.records.length) : "Unavailable";
}

function getDemoSessionMessage(usersState) {
    let savedSession;

    try {
        savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    } catch (error) {
        return "Warning: browser storage is unavailable, so the demo session could not be checked.";
    }

    if (savedSession === null) {
        return "Warning: no demo session was found. This page remains a demo and is not access-controlled.";
    }

    let session;
    try {
        session = JSON.parse(savedSession);
    } catch (error) {
        return "Warning: the saved demo session is malformed.";
    }

    if (!session || typeof session !== "object" || Array.isArray(session) ||
        typeof session.userId !== "string" || !session.userId.trim()) {
        return "Warning: the saved demo session is malformed.";
    }

    if (session.role !== "admin") {
        return "Warning: the current demo session is not an Admin session.";
    }

    if (!isReadableArrayState(usersState.state) || !validateUsers(usersState.records).success) {
        return "Warning: Admin account data is missing or unavailable; the demo session could not be verified.";
    }

    const matchingUsers = usersState.records.filter((user) => user.id === session.userId);
    if (matchingUsers.length !== 1 ||
        matchingUsers[0].role !== "admin" ||
        matchingUsers[0].accountStatus !== "active") {
        return "Warning: this session is not linked to exactly one active Admin account.";
    }

    const adminLabel = matchingUsers[0].name || matchingUsers[0].email || matchingUsers[0].id;
    return `Demo Admin session found for ${adminLabel}. This is only a local indicator, not secure authentication.`;
}

function isReadableAcademicCollection(snapshot) {
    return snapshot.state === "empty" || snapshot.state === "populated";
}

function getCollectionStateMessage(label, snapshot) {
    if (snapshot.state === "missing") {
        return label === "Curriculum"
            ? "Curriculum has not been configured yet."
            : "Semesters have not been configured yet.";
    }
    if (snapshot.state === "malformed-json") {
        return `Saved ${label.toLowerCase()} data is malformed JSON. It has not been changed.`;
    }
    if (snapshot.state === "non-array") {
        return `Saved ${label.toLowerCase()} data is not a list. It has not been changed.`;
    }
    if (snapshot.state === "unavailable") {
        return `${label} data is unavailable in browser storage.`;
    }
    return `${label} data could not be read.`;
}

function setAcademicViewState(statusElement, listElement, message, isError = false) {
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", isError);
    statusElement.classList.remove("is-warning");
    listElement.replaceChildren();
}

function addRecordDetail(details, label, value) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    details.append(row);
}

function createRecordCard() {
    const card = document.createElement("article");
    card.className = "record-card";
    return card;
}

function renderDuplicateMappingWarning(duplicateGroups, listElement) {
    const warning = document.createElement("div");
    const title = document.createElement("h3");
    const description = document.createElement("p");
    const duplicateList = document.createElement("ul");

    warning.className = "mapping-repair-warning";
    title.textContent = "Curriculum mappings need repair";
    description.textContent =
        "Each course must belong to one semester. Choose the specific membership to remove; no semester will be selected automatically.";
    duplicateList.className = "mapping-repair-summary-list";

    for (const duplicate of duplicateGroups) {
        const item = document.createElement("li");
        const membershipNames = duplicate.semesters.map((semester) =>
            `${semester.semesterName} (${semester.academicYear})`
        );
        item.textContent = `${duplicate.courseCode} — ${duplicate.courseName}: ${duplicate.membershipCount} memberships in ${membershipNames.join(", ")}.`;
        duplicateList.append(item);
    }

    warning.append(title, description, duplicateList);
    listElement.append(warning);
}

function handleDuplicateMembershipRepair(semester, duplicate) {
    let result;
    try {
        result = repairDuplicateSemesterMembership(
            semester.id,
            duplicate.courseId,
            JSON.parse(JSON.stringify(semester)),
            duplicate.semesters.map((membership) => membership.semesterId)
        );
    } catch (error) {
        setSemesterFormFeedback(
            "The duplicate membership could not be repaired safely. Refresh the semester list and try again.",
            true
        );
        return;
    }

    if (!result || !result.success) {
        setSemesterFormFeedback(
            result && result.message
                ? result.message
                : "The duplicate membership could not be repaired safely.",
            true
        );
        renderAcademicStructure();
        return;
    }

    renderAcademicStructure();
    setSemesterFormFeedback(
        `Removed ${duplicate.courseCode} from ${semester.name}. Review the remaining semester memberships.`
    );
}

function readCurrentMappingData() {
    const adminData = window.LearnSpaceAdminData;
    let semesterSnapshot;
    let courseSnapshot;
    try {
        semesterSnapshot = adminData.readArrayFromStorage(SEMESTER_STORAGE_KEY);
        courseSnapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        return { success: false, message: "Academic data could not be read safely. No changes were made." };
    }

    if (semesterSnapshot.state === "missing") {
        return { success: false, message: "Semester storage is not configured. Create a semester before mapping courses." };
    }
    if (!isReadableAcademicCollection(semesterSnapshot)) {
        return { success: false, message: getCollectionStateMessage("Semester", semesterSnapshot) };
    }
    if (courseSnapshot.state === "missing") {
        return { success: false, message: "Curriculum storage is not configured. Create curriculum courses before mapping." };
    }
    if (!isReadableAcademicCollection(courseSnapshot)) {
        return { success: false, message: getCollectionStateMessage("Curriculum", courseSnapshot) };
    }

    const courseValidation = adminData.validateCurriculumCourses(courseSnapshot.records);
    if (!courseValidation.success) {
        return { success: false, message: `Curriculum data is invalid. ${courseValidation.message}` };
    }
    const semesterValidation = adminData.validateSemesters(
        semesterSnapshot.records,
        courseSnapshot.records
    );
    if (!semesterValidation.success) {
        const duplicates = getDuplicateCurriculumMemberships(
            semesterSnapshot.records,
            courseSnapshot.records
        );
        return {
            success: false,
            message: duplicates.success && duplicates.duplicates.length > 0
                ? "Resolve duplicate course memberships using the repair controls before normal mapping."
                : `Semester data is invalid. ${semesterValidation.message}`
        };
    }

    return {
        success: true,
        semesters: semesterSnapshot.records,
        courses: courseSnapshot.records
    };
}

function verifyExpectedCourseSnapshot(courseId, expectedCourse) {
    if (!expectedCourse || expectedCourse.id !== courseId) {
        return { success: false, message: "The selected course is not available in the current course list." };
    }

    let courseSnapshot;
    try {
        courseSnapshot = window.LearnSpaceAdminData.readArrayFromStorage(
            CURRICULUM_COURSE_STORAGE_KEY
        );
    } catch (error) {
        return { success: false, message: "Curriculum data could not be reread safely." };
    }
    if (!isReadableAcademicCollection(courseSnapshot)) {
        return { success: false, message: getCollectionStateMessage("Curriculum", courseSnapshot) };
    }
    const validation = window.LearnSpaceAdminData.validateCurriculumCourses(courseSnapshot.records);
    if (!validation.success) {
        return { success: false, message: `Curriculum data is invalid. ${validation.message}` };
    }

    const currentCourse = courseSnapshot.records.find((course) => course.id === courseId);
    if (!currentCourse) {
        return { success: false, message: "The selected curriculum course no longer exists." };
    }
    if (!haveSameJsonValue(currentCourse, expectedCourse)) {
        return { success: false, message: "The selected curriculum course changed. Refresh the semester list and try again." };
    }
    return { success: true, course: currentCourse };
}

function setMappingActionError(message) {
    setSemesterFormFeedback(message, true);
    renderAcademicStructure();
}

function handleSemesterCourseAssignment(semesterSnapshot, courseId, expectedCourse, expectedSemester) {
    if (typeof courseId !== "string" || !courseId.trim()) {
        setMappingActionError("Choose an available curriculum course before assigning it.");
        return;
    }

    const currentData = readCurrentMappingData();
    if (!currentData.success) {
        setMappingActionError(currentData.message);
        return;
    }
    const semester = currentData.semesters.find((record) => record.id === semesterSnapshot.id);
    if (!semester) {
        setMappingActionError("This semester no longer exists. Refresh the dashboard before mapping courses.");
        return;
    }
    if (!haveSameJsonValue(semester, expectedSemester)) {
        setMappingActionError("This semester changed. Refresh the dashboard before mapping courses.");
        return;
    }
    const courseCheck = verifyExpectedCourseSnapshot(courseId, expectedCourse);
    if (!courseCheck.success) {
        setMappingActionError(courseCheck.message);
        return;
    }
    if (currentData.semesters.some((record) => record.curriculumCourseIds.includes(courseId))) {
        setMappingActionError("This course is already assigned to a semester. Refresh the dashboard before continuing.");
        return;
    }

    let membershipAdded = false;
    let callbackFailureMessage = "";
    let result;
    try {
        result = window.LearnSpaceAdminData.updateArrayInStorage(
            SEMESTER_STORAGE_KEY,
            (draftRecords) => {
                const target = draftRecords.find((record) => record.id === semesterSnapshot.id);
                if (!target || !haveSameJsonValue(target, expectedSemester)) {
                    callbackFailureMessage = "This semester changed before the course could be assigned.";
                    return draftRecords;
                }
                const latestCourseCheck = verifyExpectedCourseSnapshot(courseId, expectedCourse);
                if (!latestCourseCheck.success) {
                    callbackFailureMessage = latestCourseCheck.message;
                    return draftRecords;
                }
                if (draftRecords.some((record) => record.curriculumCourseIds.includes(courseId))) {
                    callbackFailureMessage = "This course became assigned before the update. Refresh the dashboard and try again.";
                    return draftRecords;
                }

                target.curriculumCourseIds.push(courseId);
                membershipAdded = true;
                return draftRecords;
            }
        );
    } catch (error) {
        setMappingActionError("The course could not be assigned safely. Existing data was left unchanged.");
        return;
    }

    if (!result || !result.success) {
        setMappingActionError(
            result && result.message
                ? result.message
                : "The course could not be assigned safely. Existing data was left unchanged."
        );
        return;
    }
    if (!membershipAdded) {
        setMappingActionError(
            callbackFailureMessage || "The course or semester changed before the update. No membership was added."
        );
        return;
    }

    renderAcademicStructure();
    setSemesterFormFeedback(`Course ${expectedCourse.code} was assigned to ${expectedSemester.name}.`);
}

function handleSemesterCourseRemoval(semesterSnapshot, course, expectedSemester, expectedCourse) {
    const courseId = course && course.id;
    const currentData = readCurrentMappingData();
    if (!currentData.success) {
        setMappingActionError(currentData.message);
        return;
    }

    const semester = currentData.semesters.find((record) => record.id === semesterSnapshot.id);
    if (!semester) {
        setMappingActionError("This semester no longer exists. Refresh the dashboard before removing courses.");
        return;
    }
    if (!haveSameJsonValue(semester, expectedSemester)) {
        setMappingActionError("This semester changed. Refresh the dashboard before removing courses.");
        return;
    }
    const courseCheck = verifyExpectedCourseSnapshot(courseId, expectedCourse);
    if (!courseCheck.success) {
        setMappingActionError(courseCheck.message);
        return;
    }
    if (!semester.curriculumCourseIds.includes(courseId)) {
        setMappingActionError("This course is no longer assigned to this semester.");
        return;
    }

    let membershipRemoved = false;
    let callbackFailureMessage = "";
    let result;
    try {
        result = window.LearnSpaceAdminData.updateArrayInStorage(
            SEMESTER_STORAGE_KEY,
            (draftRecords) => {
                const target = draftRecords.find((record) => record.id === semesterSnapshot.id);
                if (!target || !haveSameJsonValue(target, expectedSemester)) {
                    callbackFailureMessage = "This semester changed before the course could be removed.";
                    return draftRecords;
                }
                const latestCourseCheck = verifyExpectedCourseSnapshot(courseId, expectedCourse);
                if (!latestCourseCheck.success) {
                    callbackFailureMessage = latestCourseCheck.message;
                    return draftRecords;
                }
                const membershipIndex = target.curriculumCourseIds.indexOf(courseId);
                if (membershipIndex < 0 || target.curriculumCourseIds.lastIndexOf(courseId) !== membershipIndex) {
                    callbackFailureMessage = "This course membership changed before it could be removed.";
                    return draftRecords;
                }

                target.curriculumCourseIds.splice(membershipIndex, 1);
                membershipRemoved = true;
                return draftRecords;
            }
        );
    } catch (error) {
        setMappingActionError("The course could not be removed safely. Existing data was left unchanged.");
        return;
    }

    if (!result || !result.success) {
        setMappingActionError(
            result && result.message
                ? result.message
                : "The course could not be removed safely. Existing data was left unchanged."
        );
        return;
    }
    if (!membershipRemoved) {
        setMappingActionError(
            callbackFailureMessage || "The course or semester changed before the update. No membership was removed."
        );
        return;
    }

    renderAcademicStructure();
    setSemesterFormFeedback(`Course ${expectedCourse.code} was removed from ${expectedSemester.name}.`);
}

function renderSemesterCards(semesters, courses, listElement, { repairMode = false, duplicateGroups = [] } = {}) {
    const courseById = new Map(courses.map((course) => [course.id, course]));
    const duplicateByCourseId = new Map(duplicateGroups.map((duplicate) => [duplicate.courseId, duplicate]));
    const assignedCourseIds = new Set(
        semesters.flatMap((semester) => semester.curriculumCourseIds)
    );

    if (repairMode) renderDuplicateMappingWarning(duplicateGroups, listElement);

    for (const [semesterIndex, semester] of semesters.entries()) {
        const card = createRecordCard();
        const header = document.createElement("div");
        const title = document.createElement("h3");
        const status = document.createElement("span");
        const editButton = document.createElement("button");
        const statusButton = document.createElement("button");
        const details = document.createElement("dl");
        const includedCourses = document.createElement("ul");

        header.className = "record-card-header semester-card-header";
        status.className = `status-badge${semester.status === "active" ? " is-active" : ""}`;
        status.textContent = semester.status;
        title.textContent = semester.name;
        editButton.className = "course-edit-button";
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.disabled = repairMode;
        editButton.setAttribute(
            "aria-label",
            `Edit semester ${semester.name} (${semester.academicYear})`
        );
        editButton.addEventListener("click", () => startSemesterEditing(semester.id));
        const nextStatus = semester.status === "active" ? "inactive" : "active";
        const statusAction = nextStatus === "active" ? "Activate" : "Deactivate";
        statusButton.className = "course-edit-button semester-status-button";
        statusButton.type = "button";
        statusButton.textContent = statusAction;
        statusButton.disabled = repairMode;
        statusButton.setAttribute(
            "aria-label",
            `${statusAction} semester ${semester.name} (${semester.academicYear})`
        );
        statusButton.addEventListener("click", () =>
            changeSemesterStatus(semester.id, JSON.stringify(semester))
        );
        header.append(title, status, editButton, statusButton);

        details.className = "record-details";
        addRecordDetail(details, "Academic year", semester.academicYear);
        addRecordDetail(
            details,
            "Curriculum courses",
            String(semester.curriculumCourseIds.length)
        );

        const courseRow = document.createElement("div");
        const courseLabel = document.createElement("dt");
        const courseDescription = document.createElement("dd");
        courseLabel.textContent = "Included courses";
        includedCourses.className = "relationship-list";

        if (semester.curriculumCourseIds.length === 0) {
            courseDescription.textContent = "No curriculum courses are included.";
        } else {
            for (const courseId of semester.curriculumCourseIds) {
                const course = courseById.get(courseId);
                const item = document.createElement("li");
                const courseText = document.createElement("span");
                const membershipAction = document.createElement("button");
                const duplicate = duplicateByCourseId.get(courseId);

                item.className = "mapping-course-item";
                courseText.textContent = `${course.code} — ${course.name}`;
                membershipAction.type = "button";
                membershipAction.className = duplicate
                    ? "course-edit-button mapping-membership-action mapping-repair-action"
                    : "course-edit-button mapping-membership-action";
                membershipAction.textContent = duplicate ? "Repair: remove" : "Remove";
                if (duplicate) {
                    membershipAction.setAttribute(
                        "aria-label",
                        `Repair duplicate: remove ${course.code} — ${course.name} from semester ${semester.name} (${semester.academicYear})`
                    );
                    membershipAction.addEventListener("click", () =>
                        handleDuplicateMembershipRepair(semester, duplicate)
                    );
                } else {
                    membershipAction.setAttribute(
                        "aria-label",
                        `Remove ${course.code} — ${course.name} from semester ${semester.name} (${semester.academicYear})`
                    );
                    membershipAction.disabled = repairMode;
                    if (!repairMode) {
                        membershipAction.addEventListener("click", () =>
                            handleSemesterCourseRemoval(
                                semester,
                                course,
                                JSON.parse(JSON.stringify(semester)),
                                JSON.parse(JSON.stringify(course))
                            )
                        );
                    }
                }
                item.append(courseText, membershipAction);
                includedCourses.append(item);
            }
            courseDescription.append(includedCourses);
        }

        courseRow.append(courseLabel, courseDescription);
        details.append(courseRow);
        const assignmentPanel = document.createElement("div");
        const assignmentLabel = document.createElement("label");
        const assignmentSelect = document.createElement("select");
        const promptOption = document.createElement("option");
        const assignButton = document.createElement("button");

        assignmentPanel.className = "semester-mapping-controls";
        assignmentSelect.id = `semesterCourseSelect${semesterIndex + 1}`;
        const availableCourses = courses.filter((course) => !assignedCourseIds.has(course.id));
        assignmentSelect.disabled = repairMode || availableCourses.length === 0;
        promptOption.value = "";
        promptOption.textContent = courses.length === 0
            ? "No curriculum courses are configured"
            : availableCourses.length === 0
                ? "All curriculum courses are assigned"
                : "Choose an unassigned course";
        promptOption.selected = true;
        assignmentSelect.append(promptOption);
        for (const course of availableCourses) {
            const option = document.createElement("option");
            option.value = course.id;
            option.textContent = `${course.code} — ${course.name}`;
            assignmentSelect.append(option);
        }
        assignmentLabel.htmlFor = assignmentSelect.id;
        assignmentLabel.textContent = `Course to assign to ${semester.name}`;
        assignButton.type = "button";
        assignButton.className = "course-submit-button mapping-assign-button";
        assignButton.textContent = "Assign Course";
        assignButton.disabled = repairMode || availableCourses.length === 0;
        assignButton.setAttribute("aria-label", `Assign course to semester ${semester.name} (${semester.academicYear})`);
        if (!repairMode && availableCourses.length > 0) {
            assignButton.addEventListener("click", () => {
                const selectedCourseId = assignmentSelect.value;
                const expectedCourse = availableCourses.find((course) => course.id === selectedCourseId);
                handleSemesterCourseAssignment(
                    semester,
                    selectedCourseId,
                    expectedCourse,
                    JSON.parse(JSON.stringify(semester))
                );
            });
        }
        assignmentPanel.append(assignmentLabel, assignmentSelect, assignButton);

        card.append(header, details, assignmentPanel);
        listElement.append(card);
    }
}

function renderCurriculumCards(
    courses,
    semesters,
    membershipVerified,
    semesterCollectionState,
    listElement,
    disableManagement = false
) {
    for (const course of courses) {
        const card = createRecordCard();
        const header = document.createElement("div");
        const code = document.createElement("span");
        const editButton = document.createElement("button");
        const title = document.createElement("h3");
        const details = document.createElement("dl");
        const membershipRow = document.createElement("div");
        const membershipLabel = document.createElement("dt");
        const membershipDescription = document.createElement("dd");

        code.className = "course-code";
        code.textContent = course.code;
        editButton.className = "course-edit-button";
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.disabled = disableManagement;
        editButton.setAttribute("aria-label", `Edit ${course.code} — ${course.name}`);
        editButton.addEventListener("click", () => startCourseEditing(course.id));
        header.className = "record-card-header";
        header.append(code, editButton);
        title.textContent = course.name;
        details.className = "record-details";
        addRecordDetail(
            details,
            "Description",
            course.description.trim() || "No description provided."
        );

        membershipLabel.textContent = "Included in semesters";
        if (!membershipVerified) {
            membershipDescription.textContent = "Semester membership could not be verified.";
        } else {
            const memberships = semesters.filter((semester) =>
                semester.curriculumCourseIds.includes(course.id)
            );

            if (memberships.length === 0) {
                membershipDescription.textContent = semesterCollectionState === "missing"
                    ? "Semester membership has not been configured yet."
                    : "Not included in any configured semester.";
            } else {
                const membershipList = document.createElement("ul");
                membershipList.className = "relationship-list";
                for (const semester of memberships) {
                    const item = document.createElement("li");
                    item.textContent = `${semester.name} (${semester.academicYear})`;
                    membershipList.append(item);
                }
                membershipDescription.append(membershipList);
            }
        }

        membershipRow.append(membershipLabel, membershipDescription);
        details.append(membershipRow);
        card.append(header, title, details);
        listElement.append(card);
    }
}

function setAcademicManagementControlsDisabled(disabled) {
    for (const selector of ["#addSemesterForm", "#addCourseForm"]) {
        const form = document.querySelector(selector);
        if (!form) continue;
        for (const control of form.querySelectorAll("input, textarea, button")) {
            control.disabled = disabled;
        }
    }
}

function renderAcademicStructure() {
    setAcademicManagementControlsDisabled(false);
    const adminData = window.LearnSpaceAdminData;
    const semesterStatus = document.querySelector("#semesterViewStatus");
    const semesterList = document.querySelector("#semesterList");
    const curriculumStatus = document.querySelector("#curriculumViewStatus");
    const curriculumList = document.querySelector("#curriculumList");
    let semesterSnapshot;
    let courseSnapshot;

    try {
        semesterSnapshot = adminData.readArrayFromStorage(SEMESTER_STORAGE_KEY);
        courseSnapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        setAcademicViewState(
            semesterStatus,
            semesterList,
            "Semester data could not be read safely.",
            true
        );
        setAcademicViewState(
            curriculumStatus,
            curriculumList,
            "Curriculum data could not be read safely.",
            true
        );
        return;
    }

    const coursesReadable = isReadableAcademicCollection(courseSnapshot);
    const semestersReadable = isReadableAcademicCollection(semesterSnapshot);
    const courseValidation = coursesReadable
        ? adminData.validateCurriculumCourses(courseSnapshot.records)
        : { success: courseSnapshot.state === "missing", message: "" };
    const courses = coursesReadable && courseValidation.success
        ? courseSnapshot.records
        : [];
    const curriculumUsable = courseSnapshot.state === "missing" ||
        (coursesReadable && courseValidation.success);

    let semesterValidation = { success: false, message: "" };
    if (semestersReadable && curriculumUsable) {
        semesterValidation = adminData.validateSemesters(
            semesterSnapshot.records,
            courses
        );
    }
    const duplicateInspection = semestersReadable && curriculumUsable
        ? getDuplicateCurriculumMemberships(semesterSnapshot.records, courses)
        : { success: false, message: "", duplicates: [] };
    const duplicateRepairMode = !semesterValidation.success &&
        duplicateInspection.success && duplicateInspection.duplicates.length > 0;
    if (duplicateRepairMode) setAcademicManagementControlsDisabled(true);
    const semesterRelationshipsVerified =
        semesterSnapshot.state === "missing" ||
        (semestersReadable && curriculumUsable &&
            (semesterValidation.success || duplicateRepairMode));
    const semesterSummaryCount = document.querySelector("#semesterSummaryCount");

    if (semesterSnapshot.state === "missing") {
        semesterSummaryCount.textContent = "Not configured";
    } else if (!semestersReadable || !curriculumUsable || !semesterValidation.success) {
        semesterSummaryCount.textContent = "Unavailable";
    } else {
        semesterSummaryCount.textContent = String(semesterSnapshot.records.length);
    }

    if (semesterSnapshot.state === "missing") {
        setAcademicViewState(
            semesterStatus,
            semesterList,
            getCollectionStateMessage("Semesters", semesterSnapshot)
        );
    } else if (!semestersReadable) {
        setAcademicViewState(
            semesterStatus,
            semesterList,
            getCollectionStateMessage("Semester", semesterSnapshot),
            true
        );
    } else if (!curriculumUsable) {
        setAcademicViewState(
            semesterStatus,
            semesterList,
            "Semester records are not shown because curriculum data is invalid or unavailable, so course links cannot be verified.",
            true
        );
    } else if (!semesterValidation.success) {
        if (duplicateRepairMode) {
            semesterStatus.textContent =
                `${duplicateInspection.duplicates.length} curriculum course${duplicateInspection.duplicates.length === 1 ? " has" : "s have"} duplicate semester memberships. Only duplicate repair actions are available until they are resolved.`;
            semesterStatus.classList.remove("is-error");
            semesterStatus.classList.add("is-warning");
            semesterList.replaceChildren();
            renderSemesterCards(semesterSnapshot.records, courses, semesterList, {
                repairMode: true,
                duplicateGroups: duplicateInspection.duplicates
            });
        } else {
            setAcademicViewState(
                semesterStatus,
                semesterList,
                `Semester records could not be displayed: ${semesterValidation.message}`,
                true
            );
        }
    } else if (semesterSnapshot.state === "empty") {
        setAcademicViewState(semesterStatus, semesterList, "No semesters have been created yet.");
    } else {
        semesterStatus.textContent = `Showing ${semesterSnapshot.records.length} semester${semesterSnapshot.records.length === 1 ? "" : "s"}.`;
        semesterStatus.classList.remove("is-error");
        semesterStatus.classList.remove("is-warning");
        semesterList.replaceChildren();
        renderSemesterCards(semesterSnapshot.records, courses, semesterList);
    }

    if (!coursesReadable) {
        setAcademicViewState(
            curriculumStatus,
            curriculumList,
            getCollectionStateMessage("Curriculum", courseSnapshot),
            courseSnapshot.state !== "missing"
        );
    } else if (!courseValidation.success) {
        setAcademicViewState(
            curriculumStatus,
            curriculumList,
            `Curriculum records could not be displayed: ${courseValidation.message}`,
            true
        );
    } else if (courseSnapshot.state === "empty") {
        setAcademicViewState(curriculumStatus, curriculumList, "No curriculum courses have been created yet.");
    } else {
        curriculumStatus.textContent = semesterRelationshipsVerified
            ? `Showing ${courses.length} curriculum course${courses.length === 1 ? "" : "s"}.`
            : "Course details are valid, but semester membership could not be verified.";
        curriculumStatus.classList.toggle("is-error", !semesterRelationshipsVerified);
        curriculumList.replaceChildren();
        renderCurriculumCards(
            courses,
            semesterRelationshipsVerified && semestersReadable
                ? semesterSnapshot.records
                : [],
            semesterRelationshipsVerified,
            semesterSnapshot.state,
            curriculumList,
            duplicateRepairMode
        );
    }
}

function setCourseFormFeedback(message, isError = false) {
    const feedback = document.querySelector("#courseFormStatus");
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

function setCourseFormMode(isEditing) {
    document.querySelector("#courseFormTitle").textContent = isEditing
        ? "Edit official course"
        : "Add an official course";
    document.querySelector("#courseSubmitButton").textContent = isEditing
        ? "Save Changes"
        : "Add Course";
    document.querySelector("#courseResetButton").hidden = isEditing;
    document.querySelector("#cancelCourseEditButton").hidden = !isEditing;
}

function startCourseEditing(courseId) {
    const adminData = window.LearnSpaceAdminData;
    let snapshot;
    try {
        snapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        setCourseFormFeedback("Curriculum data could not be read. No data was changed.", true);
        return;
    }

    if (snapshot.state === "missing") {
        setCourseFormFeedback("This course is no longer available. Refresh the list before editing.", true);
        return;
    }

    if (!isReadableAcademicCollection(snapshot)) {
        setCourseFormFeedback(getCourseCreationStorageError(snapshot), true);
        return;
    }

    const validation = adminData.validateCurriculumCourses(snapshot.records);
    if (!validation.success) {
        setCourseFormFeedback(validation.message, true);
        return;
    }

    const course = snapshot.records.find((record) => record.id === courseId);
    if (!course) {
        setCourseFormFeedback("This course is no longer available. Refresh the list before editing.", true);
        return;
    }

    selectedCurriculumCourseId = course.id;
    selectedCurriculumCourseSnapshot = JSON.stringify(course);
    setCourseFormMode(true);
    document.querySelector("#courseCode").value = course.code;
    document.querySelector("#courseName").value = course.name;
    document.querySelector("#courseDescription").value = course.description;
    setCourseFormFeedback(`Editing ${course.code} — ${course.name}.`);
    document.querySelector("#courseCode").focus();
}

function cancelCourseEditing() {
    selectedCurriculumCourseId = null;
    selectedCurriculumCourseSnapshot = null;
    setCourseFormMode(false);
    document.querySelector("#addCourseForm").reset();
    setCourseFormFeedback("");
    document.querySelector("#courseCode").focus();
}

function getCourseCreationStorageError(snapshot) {
    if (snapshot.state === "malformed-json") {
        return "Saved curriculum data is malformed JSON. It was left unchanged.";
    }
    if (snapshot.state === "non-array") {
        return "Saved curriculum data is not a list. It was left unchanged.";
    }
    if (snapshot.state === "unavailable") {
        return "Curriculum storage is unavailable. No data was changed.";
    }
    return "Curriculum data could not be checked safely. No data was changed.";
}

function handleAddCourseSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const codeInput = document.querySelector("#courseCode");
    const nameInput = document.querySelector("#courseName");
    const descriptionInput = document.querySelector("#courseDescription");

    if (!form.checkValidity()) {
        setCourseFormFeedback("Enter a course code and course name before adding the course.", true);
        return;
    }

    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const description = descriptionInput.value;

    if (!code || !name) {
        setCourseFormFeedback("Course code and course name cannot contain only whitespace.", true);
        return;
    }

    if (selectedCurriculumCourseId !== null) {
        handleEditCourseSubmit(code, name, description);
        return;
    }

    const adminData = window.LearnSpaceAdminData;
    let snapshot;
    try {
        snapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        setCourseFormFeedback("Curriculum data could not be read. No data was changed.", true);
        return;
    }

    const allowMissing = snapshot.state === "missing";
    if (!allowMissing && !isReadableAcademicCollection(snapshot)) {
        setCourseFormFeedback(getCourseCreationStorageError(snapshot), true);
        return;
    }

    let courseRecord;
    try {
        courseRecord = {
            id: crypto.randomUUID(),
            code,
            name,
            description,
            createdAt: new Date().toISOString()
        };
    } catch (error) {
        setCourseFormFeedback("A course ID or creation timestamp could not be generated. No data was changed.", true);
        return;
    }
    const existingCourses = allowMissing ? [] : snapshot.records;
    const validation = adminData.validateCurriculumCourses([
        ...existingCourses,
        courseRecord
    ]);

    if (!validation.success) {
        setCourseFormFeedback(validation.message, true);
        return;
    }

    let result;
    try {
        result = adminData.updateArrayInStorage(
            CURRICULUM_COURSE_STORAGE_KEY,
            (draftRecords) => [...draftRecords, courseRecord],
            { allowMissing }
        );
    } catch (error) {
        setCourseFormFeedback("The course could not be saved safely. Existing data was left unchanged.", true);
        return;
    }

    if (!result.success) {
        setCourseFormFeedback(result.message, true);
        return;
    }

    form.reset();
    setCourseFormFeedback("Course added to the official curriculum.");
    try {
        renderAcademicStructure();
    } catch (error) {
        setCourseFormFeedback("Course added, but the list could not refresh. Reload the page to verify it.", true);
    }
}

function handleEditCourseSubmit(code, name, description) {
    const courseId = selectedCurriculumCourseId;
    const adminData = window.LearnSpaceAdminData;
    let snapshot;
    try {
        snapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        setCourseFormFeedback("Curriculum data could not be read. No data was changed.", true);
        return;
    }

    if (!isReadableAcademicCollection(snapshot)) {
        if (snapshot.state === "missing") {
            setCourseFormFeedback("This course no longer exists. No new course was created.", true);
        } else {
            setCourseFormFeedback(getCourseCreationStorageError(snapshot), true);
        }
        return;
    }

    const existingValidation = adminData.validateCurriculumCourses(snapshot.records);
    if (!existingValidation.success) {
        setCourseFormFeedback(existingValidation.message, true);
        return;
    }

    const selectedCourse = snapshot.records.find((course) => course.id === courseId);
    if (!selectedCourse) {
        setCourseFormFeedback("This course no longer exists. No new course was created.", true);
        return;
    }
    if (JSON.stringify(selectedCourse) !== selectedCurriculumCourseSnapshot) {
        setCourseFormFeedback(
            "This course changed in another tab. Cancel editing and reopen it before saving.",
            true
        );
        return;
    }

    let selectedCourseUpdated = false;
    let result;
    try {
        result = adminData.updateArrayInStorage(
            CURRICULUM_COURSE_STORAGE_KEY,
            (draftRecords) => {
                const course = draftRecords.find((record) => record.id === courseId);
                if (!course) return draftRecords;
                if (JSON.stringify(course) !== selectedCurriculumCourseSnapshot) {
                    return draftRecords;
                }

                course.code = code;
                course.name = name;
                course.description = description;
                selectedCourseUpdated = true;
                return draftRecords;
            }
        );
    } catch (error) {
        setCourseFormFeedback("The course could not be updated safely. Existing data was left unchanged.", true);
        return;
    }

    if (!result.success) {
        setCourseFormFeedback(result.message, true);
        return;
    }

    if (!selectedCourseUpdated) {
        setCourseFormFeedback(
            "This course changed or was removed before the update. Cancel editing and reopen it before saving.",
            true
        );
        return;
    }

    selectedCurriculumCourseId = null;
    selectedCurriculumCourseSnapshot = null;
    setCourseFormMode(false);
    document.querySelector("#addCourseForm").reset();
    try {
        renderAcademicStructure();
        setCourseFormFeedback("Course changes saved.");
    } catch (error) {
        setCourseFormFeedback("Course changes were saved, but the list could not refresh. Reload the page to verify them.", true);
    }
}

function initializeCourseForm() {
    const form = document.querySelector("#addCourseForm");
    form.addEventListener("submit", handleAddCourseSubmit);
    form.addEventListener("reset", () => setCourseFormFeedback(""));
    document.querySelector("#cancelCourseEditButton").addEventListener(
        "click",
        cancelCourseEditing
    );
}

function initializeSemesterForm() {
    const form = document.querySelector("#addSemesterForm");
    form.addEventListener("submit", handleAddSemesterSubmit);
    form.addEventListener("reset", () => {
        setSemesterFormFeedback("");
    });
    document.querySelector("#cancelSemesterEditButton").addEventListener(
        "click",
        cancelSemesterEditing
    );
}

function setSemesterFormMode(isEditing) {
    document.querySelector("#semesterFormTitle").textContent = isEditing
        ? "Edit semester"
        : "Add a semester";
    document.querySelector("#addSemesterSubmitButton").textContent = isEditing
        ? "Update Semester"
        : "Add Semester";
    document.querySelector("#addSemesterResetButton").hidden = isEditing;
    document.querySelector("#cancelSemesterEditButton").hidden = !isEditing;
}

function readSemesterDataForEditing() {
    const adminData = window.LearnSpaceAdminData;
    let semesterSnapshot;
    let courseSnapshot;

    try {
        semesterSnapshot = adminData.readArrayFromStorage(SEMESTER_STORAGE_KEY);
        courseSnapshot = adminData.readArrayFromStorage(CURRICULUM_COURSE_STORAGE_KEY);
    } catch (error) {
        return { success: false, message: "Semester data could not be read safely." };
    }

    if (semesterSnapshot.state === "missing") {
        return { success: false, message: "This semester is no longer available." };
    }
    if (!isReadableAcademicCollection(semesterSnapshot)) {
        return { success: false, message: getSemesterCreationStorageError(semesterSnapshot) };
    }

    let courses;
    if (courseSnapshot.state === "missing") {
        courses = [];
    } else if (!isReadableAcademicCollection(courseSnapshot)) {
        return { success: false, message: getCourseCreationStorageError(courseSnapshot) };
    } else {
        courses = courseSnapshot.records;
    }

    const courseValidation = adminData.validateCurriculumCourses(courses);
    if (!courseValidation.success) {
        return {
            success: false,
            message: `Curriculum data is invalid. ${courseValidation.message}`
        };
    }

    const semesterValidation = adminData.validateSemesters(
        semesterSnapshot.records,
        courses
    );
    if (!semesterValidation.success) {
        return { success: false, message: semesterValidation.message };
    }

    return { success: true, records: semesterSnapshot.records };
}

function changeSemesterStatus(semesterId, expectedSnapshot) {
    const readResult = readSemesterDataForEditing();
    if (!readResult.success) {
        setSemesterFormFeedback(readResult.message, true);
        return;
    }

    const selectedSemester = readResult.records.find((record) => record.id === semesterId);
    if (!selectedSemester) {
        setSemesterFormFeedback(
            "This semester was removed. Refresh the list before changing its status.",
            true
        );
        return;
    }

    if (JSON.stringify(selectedSemester) !== expectedSnapshot) {
        setSemesterFormFeedback(
            "This semester changed elsewhere. Refresh the list before changing its status.",
            true
        );
        return;
    }

    const nextStatus = selectedSemester.status === "active" ? "inactive" : "active";
    let selectedSemesterUpdated = false;
    let updateResult;
    try {
        updateResult = window.LearnSpaceAdminData.updateArrayInStorage(
            SEMESTER_STORAGE_KEY,
            (draftRecords) => {
                const semester = draftRecords.find((record) => record.id === semesterId);
                if (!semester || JSON.stringify(semester) !== expectedSnapshot) {
                    return draftRecords;
                }

                semester.status = nextStatus;
                selectedSemesterUpdated = true;
                return draftRecords;
            }
        );
    } catch (error) {
        setSemesterFormFeedback(
            "The semester status could not be updated safely. Existing data was left unchanged.",
            true
        );
        return;
    }

    if (!updateResult || !updateResult.success) {
        setSemesterFormFeedback(
            updateResult && updateResult.message
                ? updateResult.message
                : "The semester status could not be updated safely. Existing data was left unchanged.",
            true
        );
        return;
    }
    if (!selectedSemesterUpdated) {
        setSemesterFormFeedback(
            "This semester changed or was removed before the status update. Refresh and try again.",
            true
        );
        return;
    }

    if (selectedSemesterId === semesterId) {
        selectedSemesterSnapshot = JSON.stringify({
            ...selectedSemester,
            status: nextStatus
        });
    }

    try {
        renderAcademicStructure();
        setSemesterFormFeedback(
            `Semester ${selectedSemester.name} ${nextStatus === "active" ? "activated" : "deactivated"}.`
        );
    } catch (error) {
        setSemesterFormFeedback(
            `Semester status was saved, but the list could not refresh. Reload the page to verify it.`,
            true
        );
    }
}

function startSemesterEditing(semesterId) {
    const result = readSemesterDataForEditing();
    if (!result.success) {
        setSemesterFormFeedback(result.message, true);
        return;
    }

    const semester = result.records.find((record) => record.id === semesterId);
    if (!semester) {
        setSemesterFormFeedback("This semester is no longer available. Refresh the list before editing.", true);
        return;
    }

    selectedSemesterId = semester.id;
    selectedSemesterSnapshot = JSON.stringify(semester);
    setSemesterFormMode(true);
    document.querySelector("#semesterName").value = semester.name;
    document.querySelector("#semesterAcademicYear").value = semester.academicYear;
    setSemesterFormFeedback(`Editing ${semester.name} (${semester.academicYear}).`);
    document.querySelector("#semesterName").focus();
}

function cancelSemesterEditing() {
    selectedSemesterId = null;
    selectedSemesterSnapshot = null;
    setSemesterFormMode(false);
    document.querySelector("#addSemesterForm").reset();
    setSemesterFormFeedback("");
    document.querySelector("#semesterName").focus();
}

function handleEditSemesterSubmit(name, academicYear) {
    const semesterId = selectedSemesterId;
    const result = readSemesterDataForEditing();
    if (!result.success) {
        setSemesterFormFeedback(result.message, true);
        return;
    }

    const selectedSemester = result.records.find((record) => record.id === semesterId);
    if (!selectedSemester) {
        setSemesterFormFeedback(
            "This semester was removed before the update. Cancel editing and refresh the list.",
            true
        );
        return;
    }
    if (JSON.stringify(selectedSemester) !== selectedSemesterSnapshot) {
        setSemesterFormFeedback(
            "This semester changed elsewhere. Cancel editing and reopen it before saving.",
            true
        );
        return;
    }

    let selectedSemesterUpdated = false;
    let updateResult;
    try {
        updateResult = window.LearnSpaceAdminData.updateArrayInStorage(
            SEMESTER_STORAGE_KEY,
            (draftRecords) => {
                const semester = draftRecords.find((record) => record.id === semesterId);
                if (!semester || JSON.stringify(semester) !== selectedSemesterSnapshot) {
                    return draftRecords;
                }

                semester.name = name;
                semester.academicYear = academicYear;
                selectedSemesterUpdated = true;
                return draftRecords;
            }
        );
    } catch (error) {
        setSemesterFormFeedback(
            "The semester could not be updated safely. Existing data was left unchanged.",
            true
        );
        return;
    }

    if (!updateResult || !updateResult.success) {
        setSemesterFormFeedback(
            updateResult && updateResult.message
                ? updateResult.message
                : "The semester could not be updated safely. Existing data was left unchanged.",
            true
        );
        return;
    }
    if (!selectedSemesterUpdated) {
        setSemesterFormFeedback(
            "This semester changed or was removed before the update. Cancel editing and reopen it.",
            true
        );
        return;
    }

    selectedSemesterId = null;
    selectedSemesterSnapshot = null;
    setSemesterFormMode(false);
    document.querySelector("#addSemesterForm").reset();
    try {
        renderAcademicStructure();
        setSemesterFormFeedback("Semester details updated.");
    } catch (error) {
        setSemesterFormFeedback(
            "Semester details were saved, but the list could not refresh. Reload the page to verify them.",
            true
        );
    }
}

function setSemesterFormFeedback(message, isError = false) {
    const feedback = document.querySelector("#semesterFormStatus");
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

function getSemesterCreationStorageError(snapshot) {
    if (snapshot.state === "malformed-json") {
        return "Saved semester data is malformed JSON. It was left unchanged.";
    }
    if (snapshot.state === "non-array") {
        return "Saved semester data is not a list. It was left unchanged.";
    }
    if (snapshot.state === "unavailable") {
        return "Semester storage is unavailable. No data was changed.";
    }
    return "Semester data could not be checked safely. No data was changed.";
}

function handleAddSemesterSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const name = document.querySelector("#semesterName").value.trim();
    const academicYear = document.querySelector("#semesterAcademicYear").value.trim();

    if (!form.checkValidity()) {
        setSemesterFormFeedback("Enter a semester name and academic year.", true);
        return;
    }

    if (!name || !academicYear) {
        setSemesterFormFeedback(
            "Semester name and academic year cannot contain only whitespace.",
            true
        );
        return;
    }

    if (selectedSemesterId !== null) {
        handleEditSemesterSubmit(name, academicYear);
        return;
    }

    const adminData = window.LearnSpaceAdminData;
    let snapshot;
    try {
        snapshot = adminData.readArrayFromStorage(SEMESTER_STORAGE_KEY);
    } catch (error) {
        setSemesterFormFeedback("Semester data could not be read. No data was changed.", true);
        return;
    }

    const allowMissing = snapshot.state === "missing";
    if (!allowMissing && !isReadableAcademicCollection(snapshot)) {
        setSemesterFormFeedback(getSemesterCreationStorageError(snapshot), true);
        return;
    }

    let semesterRecord;
    try {
        semesterRecord = {
            id: crypto.randomUUID(),
            name,
            academicYear,
            status: "active",
            curriculumCourseIds: [],
            createdAt: new Date().toISOString()
        };
    } catch (error) {
        setSemesterFormFeedback(
            "A semester ID or creation timestamp could not be generated. No data was changed.",
            true
        );
        return;
    }

    const existingSemesters = allowMissing ? [] : snapshot.records;
    const idValidation = adminData.validateRecordIds([
        ...existingSemesters,
        semesterRecord
    ]);
    if (!idValidation.success) {
        setSemesterFormFeedback(idValidation.message, true);
        return;
    }

    let result;
    try {
        result = adminData.updateArrayInStorage(
            SEMESTER_STORAGE_KEY,
            (draftRecords) => [...draftRecords, semesterRecord],
            { allowMissing }
        );
    } catch (error) {
        setSemesterFormFeedback(
            "The semester could not be saved safely. Existing data was left unchanged.",
            true
        );
        return;
    }

    if (!result || !result.success) {
        setSemesterFormFeedback(
            result && result.message
                ? result.message
                : "The semester could not be saved safely. Existing data was left unchanged.",
            true
        );
        return;
    }

    form.reset();
    try {
        renderAcademicStructure();
        setSemesterFormFeedback("Semester added successfully.");
    } catch (error) {
        setSemesterFormFeedback(
            "Semester saved, but the list could not refresh. Reload the page to verify it.",
            true
        );
    }
}

function renderDashboardSummary() {
    const usersState = readArrayFromStorage(USER_STORAGE_KEY);
    const studentCount = getProfileCount(STUDENT_STORAGE_KEY, "student", usersState);
    const teacherCount = getProfileCount(TEACHER_STORAGE_KEY, "teacher", usersState);
    const sessionIndicator = document.querySelector("#sessionIndicator");

    document.querySelector("#studentProfileCount").textContent = studentCount;
    document.querySelector("#teacherProfileCount").textContent = teacherCount;
    sessionIndicator.textContent = getDemoSessionMessage(usersState);
    sessionIndicator.classList.toggle(
        "is-warning",
        sessionIndicator.textContent.startsWith("Warning:")
    );
}

renderDashboardSummary();
renderAcademicStructure();
initializeCourseForm();
initializeSemesterForm();
