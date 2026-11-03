"use strict";

const USER_STORAGE_KEY = "learnspaceUsers";
const STUDENT_STORAGE_KEY = "learnspaceStudents";
const TEACHER_STORAGE_KEY = "learnspaceTeachers";
const SESSION_STORAGE_KEY = "learnspaceSession";

const ADMIN_ARRAY_STORAGE_KEYS = new Set([
    USER_STORAGE_KEY,
    STUDENT_STORAGE_KEY,
    TEACHER_STORAGE_KEY
]);
const ORIGINAL_RECORD_ID = Symbol("originalRecordId");
const allowedRoles = new Set(["student", "teacher", "admin"]);
const allowedAccountStatuses = new Set(["active", "disabled", "pending"]);
const allowedAdmissionStatuses = new Set(["pending", "admitted", "rejected"]);
const allowedAuthorizationStatuses = new Set(["pending", "authorized", "revoked"]);

// These helpers are intentionally limited to Admin account/profile storage.
// Course, offering, and content keys are not accepted by this API.
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

function validateCollectionForKey(key, records) {
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
        return { success: false, message: "This storage key is outside the Admin data helper scope." };
    }

    const usersState = readArrayFromStorage(USER_STORAGE_KEY);
    if (!isReadableArrayState(usersState.state)) {
        return { success: false, message: "Valid account data is required to verify profile links." };
    }

    return validateProfiles(records, role, usersState.records);
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

    const existingValidation = validateCollectionForKey(key, existingRecords);
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

    const proposedValidation = validateCollectionForKey(key, proposedRecords);
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

// Reusable by future Admin workflows. The array-key allowlist prevents these
// helpers from reading or writing courses, offerings, or course content.
window.LearnSpaceAdminData = Object.freeze({
    readArrayFromStorage,
    validateRecordIds,
    validateUsers,
    validateProfiles,
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
