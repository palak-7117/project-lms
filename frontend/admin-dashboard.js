"use strict";

const USER_STORAGE_KEY = "learnspaceUsers";
const STUDENT_STORAGE_KEY = "learnspaceStudents";
const TEACHER_STORAGE_KEY = "learnspaceTeachers";
const SESSION_STORAGE_KEY = "learnspaceSession";

const allowedRoles = new Set(["student", "teacher", "admin"]);
const allowedAccountStatuses = new Set(["active", "disabled", "pending"]);
const allowedAdmissionStatuses = new Set(["pending", "admitted", "rejected"]);
const allowedAuthorizationStatuses = new Set(["pending", "authorized", "revoked"]);

function readArrayFromStorage(key) {
    let savedValue;

    try {
        savedValue = localStorage.getItem(key);
    } catch (error) {
        return { state: "unavailable" };
    }

    if (savedValue === null) {
        return { state: "missing", records: [] };
    }

    try {
        const records = JSON.parse(savedValue);
        return Array.isArray(records)
            ? { state: "available", records }
            : { state: "unavailable" };
    } catch (error) {
        return { state: "unavailable" };
    }
}

function validateUsers(users) {
    const seenIds = new Set();
    const seenEmails = new Set();

    for (const user of users) {
        if (!user || typeof user !== "object" || Array.isArray(user)) {
            return false;
        }

        if (typeof user.id !== "string" || !user.id.trim()) {
            return false;
        }

        if (!allowedRoles.has(user.role) ||
            !allowedAccountStatuses.has(user.accountStatus)) {
            return false;
        }

        const emailInput = document.createElement("input");
        emailInput.type = "email";
        emailInput.required = true;
        emailInput.value = String(user.email || "").trim().toLowerCase();

        if (!emailInput.checkValidity()) {
            return false;
        }

        if (seenIds.has(user.id) || seenEmails.has(emailInput.value)) {
            return false;
        }

        seenIds.add(user.id);
        seenEmails.add(emailInput.value);
    }

    return true;
}

function hasValidCreatedAt(value) {
    return typeof value === "string" &&
        value.trim() !== "" &&
        !Number.isNaN(Date.parse(value));
}

function isValidProfile(profile, role, users) {
    const profileIdKey = role === "student" ? "studentId" : "teacherId";

    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        return false;
    }

    if (typeof profile[profileIdKey] !== "string" ||
        !profile[profileIdKey].trim() ||
        typeof profile.userId !== "string" ||
        !profile.userId.trim() ||
        !hasValidCreatedAt(profile.createdAt)) {
        return false;
    }

    const linkedUsers = users.filter((user) => user.id === profile.userId);
    if (linkedUsers.length !== 1 || linkedUsers[0].role !== role) {
        return false;
    }

    if (role === "student") {
        const hasSemesterId = Object.prototype.hasOwnProperty.call(profile, "semesterId");
        const semesterIsValid = profile.semesterId === null ||
            (typeof profile.semesterId === "string" && profile.semesterId.trim());

        if (!allowedAdmissionStatuses.has(profile.admissionStatus) ||
            !allowedAuthorizationStatuses.has(profile.authorizationStatus) ||
            !hasSemesterId ||
            !semesterIsValid) {
            return false;
        }
    }

    return true;
}

function getProfileCount(profileKey, role, usersState) {
    const profileState = readArrayFromStorage(profileKey);

    if (profileState.state === "missing") {
        return "0";
    }

    if (profileState.state !== "available") {
        return "Unavailable";
    }

    if (profileState.records.length === 0) {
        return "0";
    }

    if (usersState.state !== "available" || !validateUsers(usersState.records)) {
        return "Unavailable";
    }

    const seenProfileIds = new Set();
    const seenUserIds = new Set();

    for (const profile of profileState.records) {
        if (!isValidProfile(profile, role, usersState.records)) {
            return "Unavailable";
        }

        const profileId = profile[role === "student" ? "studentId" : "teacherId"];
        if (seenProfileIds.has(profileId) || seenUserIds.has(profile.userId)) {
            return "Unavailable";
        }

        seenProfileIds.add(profileId);
        seenUserIds.add(profile.userId);
    }

    return String(profileState.records.length);
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

    if (usersState.state !== "available" || !validateUsers(usersState.records)) {
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
