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

function validateSemesters(semesters, curriculumCourses = []) {
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

            seenCourseIds.add(courseId);
        }

        if (!hasValidCreatedAt(semester.createdAt)) {
            return { success: false, message: "A semester has an invalid creation timestamp." };
        }
    }

    return { success: true, message: "" };
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

// A missing key is only treated as an empty list when the caller explicitly
// opts into creation. localStorage has no atomic compare-and-swap operation;
// the re-read reduces, but cannot eliminate, cross-tab races.
// Update callbacks must mutate the supplied draft objects and return those
// same objects in their original order, followed only by newly created records.
// Replacing, removing, or reordering an existing object is rejected.
function updateArrayInStorage(key, updateRecords, { allowMissing = false } = {}) {
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

    const existingValidation = validateCollectionForKey(
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

    const proposedValidation = validateCollectionForKey(
        key,
        proposedRecords,
        relationshipSnapshot.records
    );
    if (!proposedValidation.success) {
        return { success: false, message: `The proposed update is invalid: ${proposedValidation.message} No data was changed.` };
    }

    let nextValue;
    try {
        nextValue = JSON.stringify(proposedRecords);
    } catch (error) {
        return { success: false, message: "The proposed records could not be saved. No data was changed." };
    }

    if (nextValue === snapshot.rawValue) {
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
}

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

function renderSemesterCards(semesters, courses, listElement) {
    const courseById = new Map(courses.map((course) => [course.id, course]));

    for (const semester of semesters) {
        const card = createRecordCard();
        const header = document.createElement("div");
        const title = document.createElement("h3");
        const status = document.createElement("span");
        const details = document.createElement("dl");
        const includedCourses = document.createElement("ul");

        header.className = "record-card-header semester-card-header";
        status.className = `status-badge${semester.status === "active" ? " is-active" : ""}`;
        status.textContent = semester.status;
        title.textContent = semester.name;
        header.append(title, status);

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
                item.textContent = `${course.code} — ${course.name}`;
                includedCourses.append(item);
            }
            courseDescription.append(includedCourses);
        }

        courseRow.append(courseLabel, courseDescription);
        details.append(courseRow);
        card.append(header, details);
        listElement.append(card);
    }
}

function renderCurriculumCards(
    courses,
    semesters,
    membershipVerified,
    semesterCollectionState,
    listElement
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

function renderAcademicStructure() {
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
    const semesterRelationshipsVerified =
        semesterSnapshot.state === "missing" ||
        (semestersReadable && curriculumUsable && semesterValidation.success);

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
        setAcademicViewState(
            semesterStatus,
            semesterList,
            `Semester records could not be displayed: ${semesterValidation.message}`,
            true
        );
    } else if (semesterSnapshot.state === "empty") {
        setAcademicViewState(semesterStatus, semesterList, "No semesters have been created yet.");
    } else {
        semesterStatus.textContent = `Showing ${semesterSnapshot.records.length} semester${semesterSnapshot.records.length === 1 ? "" : "s"}.`;
        semesterStatus.classList.remove("is-error");
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
            curriculumList
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
    const feedback = document.querySelector("#semesterFormStatus");

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        feedback.textContent = "Semester creation will be enabled in a later subphase.";
        feedback.classList.remove("is-error");
    });
    form.addEventListener("reset", () => {
        feedback.textContent = "";
        feedback.classList.remove("is-error");
    });
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
