//TEACHER COURSES
"use strict";

const COURSE_KEY = "learnspaceCourses";
const CONTENT_PREFIX = "learnspaceContent_";
const MAX_PDF_SIZE = 2 * 1024 * 1024; // 2 MB
const teacherAccess = window.LearnSpaceTeacherAccess;
const initialTeacherAccess = teacherAccess?.evaluate();
let teacherAccessRevoked = !initialTeacherAccess?.allowed;
const teacherUserId = initialTeacherAccess?.userId || null;
const teacherProfileId = initialTeacherAccess?.teacherId || null;
let courseOwnershipCheckEnabled = false;

function isCurrentOfferingOwned(currentAccess) {
    if (!course || !courseId || !currentAccess?.allowed || !teacherUserId || !teacherProfileId) {
        return false;
    }
    const offeringData = window.LearnSpaceTeacherOfferingData;
    if (!offeringData || typeof offeringData.readAndValidateOfferings !== "function") return false;
    const snapshot = offeringData.readAndValidateOfferings();
    if (!snapshot.success || snapshot.identity.userId !== teacherUserId ||
        snapshot.identity.teacherId !== teacherProfileId) return false;
    const latest = snapshot.records.find((record) => record.id === courseId);
    return Boolean(latest && offeringData.isOfferingRecord(latest) &&
        latest.teacherUserId === teacherUserId && latest.teacherId === teacherProfileId &&
        JSON.stringify(latest) === courseSnapshotValue);
}

function hasTeacherAccess() {
    if (teacherAccessRevoked || !teacherAccess) return false;
    const current = teacherAccess.evaluate();
    if (!current.allowed || current.userId !== teacherUserId || current.teacherId !== teacherProfileId) {
        revokeTeacherAccess();
        return false;
    }
    if (courseOwnershipCheckEnabled && !isCurrentOfferingOwned(current)) {
        revokeTeacherAccess();
        return false;
    }
    return true;
}

const $ = (selector) => document.querySelector(selector);

const courseTitle = $("#courseTitle");
const courseDescription = $("#courseDescription");
const courseInstructor = $("#courseInstructor");
const instructorAvatar = $(".course-instructor-avatar");
const studentCount = $("#studentCount");
const courseTabs = document.querySelectorAll(".course-tab");
const contentArea = $("#courseTabContent");

function revokeTeacherAccess() {
    teacherAccessRevoked = true;
    if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
    courseTabs.forEach((tab) => {
        tab.disabled = true;
        tab.setAttribute("aria-disabled", "true");
    });
    contentArea.replaceChildren();
    const message = element("p", "course-message error",
        "Teacher access is no longer available. Sign in again after your account is active.");
    message.setAttribute("role", "alert");
    contentArea.append(message);
}

const courseId = new URLSearchParams(window.location.search).get("id");
let deadlineTimer = null;
const CONTENT_COLLECTIONS = ["materials", "assignments", "quizzes", "submissions"];
let contentStorageRawValue = null;
let contentUnavailableMessage = null;

function loadCourses() {
    if (!hasTeacherAccess()) return [];
    const offeringData = window.LearnSpaceTeacherOfferingData;
    if (!offeringData || typeof offeringData.readAndValidateOfferings !== "function") return null;
    const snapshot = offeringData.readAndValidateOfferings();
    return snapshot.success ? snapshot : null;
}

const courseSnapshot = initialTeacherAccess?.allowed ? loadCourses() : null;
const course = courseSnapshot?.success
    ? courseSnapshot.records.find((item) =>
        item.id === courseId &&
        window.LearnSpaceTeacherOfferingData.isOfferingRecord(item) &&
        item.teacherUserId === teacherUserId &&
        item.teacherId === teacherProfileId
    ) || null
    : null;
const courseOfficialSubject = courseSnapshot?.success && course
    ? courseSnapshot.curriculumCourses.find((item) => item.id === course.curriculumCourseId)
    : null;
const courseSnapshotValue = course ? JSON.stringify(course) : null;
courseOwnershipCheckEnabled = true;

function contentStorageKey() {
    return CONTENT_PREFIX + courseId;
}

function createEmptyContent() {
    return { materials: [], assignments: [], quizzes: [], submissions: [] };
}

function isContentRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyContentText(value) {
    return typeof value === "string" && value.trim() !== "";
}

function hasValidOptionalText(record, key) {
    return !Object.prototype.hasOwnProperty.call(record, key) || typeof record[key] === "string";
}

function isValidContentDate(value) {
    return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function isConfiguredQuizFormUrl(value) {
    if (typeof value !== "string" || !value.trim() ||
        /placeholder|replace_me|your_form/i.test(value)) {
        return false;
    }

    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === "https:" &&
            !parsed.username && !parsed.password &&
            (parsed.hostname === "forms.gle" ||
             parsed.hostname === "docs.google.com");
    } catch {
        return false;
    }
}

function validateContentRecords(collection, records) {
    if (!Array.isArray(records)) {
        return { success: false, message: `Saved ${collection} must be a list. Nothing was changed.` };
    }

    const ids = new Set();
    const submissionPairs = new Set();
    for (const record of records) {
        if (!isContentRecord(record)) {
            return { success: false, message: `Saved ${collection} contains a malformed record. Nothing was changed.` };
        }
        if (["materials", "assignments", "quizzes"].includes(collection) &&
            !isNonemptyContentText(record.id)) {
            return { success: false, message: `A saved ${collection} record is missing its ID. Nothing was changed.` };
        }
        if (record.id !== undefined && !isNonemptyContentText(record.id)) {
            return { success: false, message: `Saved ${collection} contains an invalid ID. Nothing was changed.` };
        }
        if (typeof record.id === "string") {
            if (ids.has(record.id)) {
                return { success: false, message: `Saved ${collection} contains duplicate IDs. Nothing was changed.` };
            }
            ids.add(record.id);
        }

        if (collection === "materials") {
            if (!isNonemptyContentText(record.title) || !isNonemptyContentText(record.type) ||
                !["book", "notes", "resource"].includes(record.type) ||
                !hasValidOptionalText(record, "description") ||
                !hasValidOptionalText(record, "fileName") ||
                !hasValidOptionalText(record, "fileData") ||
                !hasValidOptionalText(record, "url") ||
                (record.createdAt !== undefined && !isValidContentDate(record.createdAt))) {
                return { success: false, message: "Saved study materials contain invalid fields. Nothing was changed." };
            }
        } else if (collection === "assignments") {
            if (!isNonemptyContentText(record.title) || !isNonemptyContentText(record.description) ||
                (record.startAt !== undefined && !isValidContentDate(record.startAt)) ||
                (record.dueAt !== undefined && !isValidContentDate(record.dueAt)) ||
                (record.due !== undefined && typeof record.due !== "string") ||
                (!isValidContentDate(record.dueAt) && !isValidContentDate(record.due)) ||
                (record.marks !== undefined && (!Number.isFinite(record.marks) || record.marks < 1)) ||
                (record.published !== undefined && typeof record.published !== "boolean") ||
                (record.createdAt !== undefined && !isValidContentDate(record.createdAt))) {
                return { success: false, message: "Saved assignments contain invalid fields. Nothing was changed." };
            }
        } else if (collection === "quizzes") {
            if (!isNonemptyContentText(record.title) || typeof record.description !== "string" ||
                !isNonemptyContentText(record.type) ||
                !Number.isInteger(record.questionCount) || record.questionCount < 1 ||
                !Number.isInteger(record.duration) || record.duration < 1 ||
                !isValidContentDate(record.startAt) || !isValidContentDate(record.dueAt) ||
                (record.published !== undefined && typeof record.published !== "boolean") ||
                (record.formUrl !== undefined && typeof record.formUrl !== "string") ||
                (record.createdAt !== undefined && !isValidContentDate(record.createdAt))) {
                return { success: false, message: "Saved quizzes contain invalid fields. Nothing was changed." };
            }
        } else if (collection === "submissions") {
            if (!isNonemptyContentText(record.assignmentId) || !isNonemptyContentText(record.studentId) ||
                (record.courseId !== undefined &&
                 (typeof record.courseId !== "string" || record.courseId !== courseId)) ||
                (record.status !== undefined && typeof record.status !== "string") ||
                (record.files !== undefined && !Array.isArray(record.files)) ||
                !hasValidOptionalText(record, "fileData") ||
                !hasValidOptionalText(record, "fileName") ||
                !hasValidOptionalText(record, "fileType") ||
                (record.fileSize !== undefined && !Number.isFinite(record.fileSize))) {
                return { success: false, message: "Saved submissions contain invalid fields. Nothing was changed." };
            }
            if (Array.isArray(record.files)) {
                for (const file of record.files) {
                    if (!isContentRecord(file) || !isNonemptyContentText(file.id) ||
                        !hasValidOptionalText(file, "fileName") ||
                        !hasValidOptionalText(file, "fileType") ||
                        !hasValidOptionalText(file, "fileData") ||
                        (file.fileSize !== undefined && !Number.isFinite(file.fileSize))) {
                        return { success: false, message: "A saved submission file is malformed. Nothing was changed." };
                    }
                }
            }
            const pair = `${record.studentId}\u0000${record.assignmentId}`;
            if (submissionPairs.has(pair)) {
                return { success: false, message: "Saved submissions contain duplicate student assignments. Nothing was changed." };
            }
            submissionPairs.add(pair);
        }
    }
    return { success: true, message: "" };
}

function validateCourseContent(data) {
    if (!isContentRecord(data)) {
        return { success: false, message: "Saved course content is malformed. Nothing was changed." };
    }
    const normalized = { ...data };
    for (const collection of CONTENT_COLLECTIONS) {
        if (!Object.prototype.hasOwnProperty.call(data, collection)) {
            normalized[collection] = [];
            continue;
        }
        const validation = validateContentRecords(collection, data[collection]);
        if (!validation.success) return validation;
        normalized[collection] = data[collection];
    }
    return { success: true, data: normalized, message: "" };
}

function showContentUnavailable(message) {
    contentUnavailableMessage = message || "Course content could not be verified. Nothing was changed.";
    if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }
    if (contentArea) {
        const note = element("p", "course-message error", contentUnavailableMessage);
        note.setAttribute("role", "alert");
        contentArea.replaceChildren(note);
    }
}

function clearContentUnavailable() {
    contentUnavailableMessage = null;
}

// Validate known collections while preserving unrelated saved metadata.
function readStoredContentSnapshot() {
    if (!hasTeacherAccess()) return { success: false, message: "Teacher access is unavailable." };
    try {
        const rawValue = localStorage.getItem(contentStorageKey());
        if (rawValue === null) {
            return { success: true, rawValue, missing: true, data: createEmptyContent() };
        }
        if (typeof rawValue !== "string") {
            return { success: false, state: "invalid", message: "Saved course content is unavailable or malformed. Nothing was changed." };
        }
        let parsed;
        try {
            parsed = JSON.parse(rawValue);
        } catch (error) {
            return { success: false, state: "invalid", message: "Saved course content contains malformed JSON. Nothing was changed." };
        }
        const validation = validateCourseContent(parsed);
        if (!validation.success) return { ...validation, state: "invalid" };
        return { success: true, rawValue, missing: false, data: validation.data };
    } catch (error) {
        console.error("Could not verify course content:", error);
        return { success: false, state: "unavailable", message: "Course content could not be read safely. Nothing was changed." };
    }
}

function loadContent() {
    if (!hasTeacherAccess()) return createEmptyContent();
    const snapshot = readStoredContentSnapshot();
    if (!snapshot.success) {
        showContentUnavailable(snapshot.message);
        return createEmptyContent();
    }
    contentStorageRawValue = snapshot.rawValue;
    clearContentUnavailable();
    return snapshot.data;
}

let content = courseId
    ? loadContent()
    : createEmptyContent();

function ensureContentReady() {
    if (!hasTeacherAccess() || contentUnavailableMessage) return false;
    const snapshot = readStoredContentSnapshot();
    if (!snapshot.success) {
        showContentUnavailable(snapshot.message);
        return false;
    }
    if (snapshot.rawValue !== contentStorageRawValue) {
        showContentUnavailable("Course content changed in another tab. Reload before making more changes.");
        return false;
    }
    return true;
}

// By default, merge in the latest submissions before saving. This prevents
// a teacher page left open in another tab from overwriting student submissions.
function saveContent() {
    if (!hasTeacherAccess() || contentUnavailableMessage) return false;
    try {
        const snapshot = readStoredContentSnapshot();
        if (!snapshot.success) {
            showContentUnavailable(snapshot.message);
            return false;
        }
        if (snapshot.rawValue !== contentStorageRawValue) {
            showContentUnavailable("Course content changed in another tab. Reload before making more changes.");
            return false;
        }
        const latest = snapshot.data;
        const updatedContent = {
            ...latest,
            ...content
        };
        const validation = validateCourseContent(updatedContent);
        if (!validation.success) {
            showContentUnavailable(validation.message);
            return false;
        }

        if (!hasTeacherAccess() ||
            localStorage.getItem(contentStorageKey()) !== snapshot.rawValue) {
            showContentUnavailable("Course content changed before it could be saved. Reload before making more changes.");
            return false;
        }
        const serialized = JSON.stringify(validation.data);
        localStorage.setItem(contentStorageKey(), serialized);
        if (localStorage.getItem(contentStorageKey()) !== serialized) {
            showContentUnavailable("The updated course content could not be verified. Nothing else was changed.");
            return false;
        }
        content = validation.data;
        contentStorageRawValue = serialized;
        clearContentUnavailable();
        return true;
    } catch (error) {
        console.error("Could not save course content:", error);
        alert(
            "Browser storage is full. Try smaller files or remove an old attachment."
        );
        return false;
    }
}

function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function getInitials(name) {
    return name.trim().split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function initializeCourse() {
    if (!course) {
        courseTitle.textContent = "Course not found";
        courseInstructor.textContent = "No course selected";
        courseDescription.textContent =
            "Return to the dashboard and open a valid course.";
        instructorAvatar.textContent = "?";
        studentCount.textContent = "—";

        courseTabs.forEach((tab) => {
            tab.disabled = true;
        });

        contentArea.replaceChildren(
            element("p", "course-message", "This course could not be found.")
        );

        return;
    }

    const displayName = courseOfficialSubject?.name || course.name;
    courseTitle.textContent = displayName;
    courseInstructor.textContent = course.instructor || "Not specified";
    instructorAvatar.textContent = getInitials(course.instructor || "Teacher");
    courseDescription.textContent =
        course.description || "No course description added yet.";

    // Student enrollment will be connected to the backend later.
    studentCount.textContent = "0";
    document.title = `${displayName} | LearnSpace`;
}

function formatDateTime(value) {
    if (!value) return "Not set";

    const date = new Date(String(value).replace("·", ""));
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function getDeadlineTimestamp(assignment) {
    if (!assignment?.dueAt) return null;

    const date = new Date(assignment.dueAt);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// Convert old single-file submissions to the multiple-file record shape.
// Older saved files are treated as manually submitted.
function normalizeSubmission(submission) {
    let files = Array.isArray(submission.files)
        ? submission.files
        : [];

    if (!files.length && submission.fileData) {
        files = [{
            id: submission.fileId || crypto.randomUUID(),
            fileName: submission.fileName || "Submitted file",
            fileType: submission.fileType || "application/pdf",
            fileSize: Number(submission.fileSize) || 0,
            fileData: submission.fileData
        }];
    }

    let status = submission.status;
    if (!["under-review", "submitted", "auto-submitted"].includes(status)) {
        status = files.length ? "submitted" : "under-review";
    }

    return {
        ...submission,
        id: submission.id,
        courseId: submission.courseId || courseId,
        files,
        status,
        submittedAt: submission.submittedAt || null,
        submissionType: submission.submissionType ||
            (status === "submitted" ? "manual" :
                status === "auto-submitted" ? "automatic" : null)
    };
}

// Promote saved review drafts after their assignment deadline.
// Drafts with no files are removed and are never shown as submissions.
function processAutomaticSubmissions() {
    if (!hasTeacherAccess()) return false;
    const snapshot = readStoredContentSnapshot();
    if (!snapshot.success) {
        showContentUnavailable(snapshot.message);
        return false;
    }
    if (snapshot.rawValue !== contentStorageRawValue) {
        showContentUnavailable("Course content changed in another tab. Reload before making more changes.");
        return false;
    }

    const latest = snapshot.data;
    const assignments = Array.isArray(latest.assignments)
        ? latest.assignments
        : [];
    const assignmentById = new Map(
        assignments.map((assignment) => [assignment.id, assignment])
    );
    let changed = false;

    const currentSubmissions = Array.isArray(latest.submissions)
        ? latest.submissions
        : [];
    const submissions = currentSubmissions.flatMap((record) => {
        const hasKnownStudentId = typeof record.studentId === "string" &&
            record.studentId.trim() !== "" &&
            record.studentId.trim() !== "demo-student";
        if (!hasKnownStudentId) return [record];

        const submission = normalizeSubmission(record);
        if (submission.status === "under-review" &&
            submission.files.length === 0) {
            changed = true;
            return [];
        }

        const assignment = assignmentById.get(submission.assignmentId);
        const deadline = getDeadlineTimestamp(assignment);

        if (
            submission.status === "under-review" &&
            submission.files.length > 0 &&
            deadline !== null &&
            Date.now() >= deadline
        ) {
            changed = true;
            return [{
                ...record,
                status: "auto-submitted",
                submittedAt: new Date().toISOString(),
                submissionType: "automatic"
            }];
        }

        return [record];
    });

    if (changed) {
        const updatedContent = validateCourseContent({
            ...latest,
            submissions
        });
        if (!updatedContent.success) {
            showContentUnavailable(updatedContent.message);
            return false;
        }
        try {
            if (!hasTeacherAccess() || localStorage.getItem(contentStorageKey()) !== snapshot.rawValue) {
                showContentUnavailable("Course content changed before automatic updates could be saved. Reload before continuing.");
                return false;
            }
            const serialized = JSON.stringify(updatedContent.data);
            localStorage.setItem(contentStorageKey(), serialized);
            if (localStorage.getItem(contentStorageKey()) !== serialized) {
                showContentUnavailable("Automatic submission updates could not be verified safely.");
                return false;
            }
            contentStorageRawValue = serialized;
            content = updatedContent.data;
        } catch (error) {
            console.error("Could not save automatic submission updates:", error);
            showContentUnavailable("Automatic submission updates could not be saved safely.");
            return false;
        }
    }

    content.submissions = submissions;

    return changed;
}

function syncSubmissionsFromStorage() {
    if (!hasTeacherAccess()) return;
    const snapshot = readStoredContentSnapshot();
    if (!snapshot.success) {
        showContentUnavailable(snapshot.message);
        return false;
    }
    content = snapshot.data;
    contentStorageRawValue = snapshot.rawValue;
    clearContentUnavailable();
    return true;
}

function setMessage(message, isError = false) {
    const existing = contentArea.querySelector(".course-message");
    if (existing) existing.remove();

    const note = element(
        "p",
        isError ? "course-message error" : "course-message",
        message
    );

    contentArea.prepend(note);
}

function makeButton(text, className, callback) {
    const button = element("button", className, text);
    button.type = "button";
    button.addEventListener("click", (...args) => {
        if (ensureContentReady()) callback(...args);
    });
    return button;
}

function makeField(labelText, input, required = false) {
    const wrapper = element("div", "course-field");
    const label = element("label", "", labelText);

    label.htmlFor = input.id;
    input.required = required;

    wrapper.append(label, input);
    return wrapper;
}

function makeInput(id, type, placeholder = "") {
    const input = document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = type;
    input.placeholder = placeholder;
    return input;
}

function makeTextarea(id, placeholder = "") {
    const input = document.createElement("textarea");
    input.id = id;
    input.name = id;
    input.rows = 3;
    input.placeholder = placeholder;
    return input;
}

function makeSelect(id, options) {
    const select = document.createElement("select");
    select.id = id;
    select.name = id;

    options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });

    return select;
}

function makeForm(title, description) {
    contentArea.replaceChildren();

    const heading = element("h2", "course-section-title", title);
    const intro = element("p", "course-section-intro", description);
    const form = element("form", "course-editor-form");
    const message = element("p", "course-form-message");

    message.setAttribute("aria-live", "polite");
    form.appendChild(message);
    contentArea.append(heading, intro, form);

    return { form, message };
}

function makeSectionHeader(title, description, buttonText, callback) {
    const header = element("div", "course-section-heading");
    const textBlock = element("div", "course-section-heading-text");

    textBlock.append(
        element("h2", "", title),
        element("p", "", description)
    );

    header.append(
        textBlock,
        makeButton(buttonText, "course-primary-btn", callback)
    );

    return header;
}

function makeEmptyState(title, description) {
    const box = element("div", "course-empty-state");
    box.append(
        element("h3", "", title),
        element("p", "", description)
    );
    return box;
}

function makeCard(title, description, details = []) {
    const card = element("article", "course-content-card");

    const main = element("div", "course-content-card-main");
    main.append(
        element("h3", "", title),
        element("p", "course-content-description", description || "")
    );

    card.appendChild(main);

    if (details.length) {
        const detailList = element("div", "course-content-details");

        details.forEach((detail) => {
            detailList.appendChild(element("span", "", detail));
        });

        card.appendChild(detailList);
    }

    return card;
}

function addDeleteButton(card, collection, id, itemName) {
    card.appendChild(
        makeButton("Remove", "course-danger-btn", () => {
            const confirmed = window.confirm(
                `Remove "${itemName}" from this course?`
            );

            if (!confirmed) return;

            if (!ensureContentReady()) return;
            const originalRecords = content[collection];
            content[collection] = originalRecords.filter(
                (item) => item.id !== id
            );

            if (saveContent(collection)) {
                renderTab(currentTab);
            } else {
                content[collection] = originalRecords;
            }
        })
    );
}

function decodePdfDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") return null;

    const match = dataUrl.match(
        /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/i
    );

    if (!match) return null;

    try {
        const binary = atob(match[1]);
        const headerLength = Math.min(binary.length, 1024);

        if (!binary.slice(0, headerLength).includes("%PDF-")) return null;

        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        return bytes;
    } catch (error) {
        return null;
    }
}

function getExternalResourceUrl(value) {
    if (typeof value !== "string" || !value.trim() || /placeholder|replace_me|your_form/i.test(value)) {
        return "";
    }
    try {
        const parsed = new URL(value.trim());
        if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname) {
            return parsed.href;
        }
    } catch (error) {
        return "";
    }
    return "";
}

function openPdfInNewTab(dataUrl) {
    const bytes = decodePdfDataUrl(dataUrl);

    if (!bytes) {
        alert("This PDF is missing or invalid. Please upload it again.");
        return;
    }

    let pdfUrl;

    try {
        pdfUrl = URL.createObjectURL(
            new Blob([bytes], { type: "application/pdf" })
        );
    } catch (error) {
        alert("This PDF could not be opened in your browser.");
        return;
    }

    const pdfWindow = window.open("about:blank", "_blank");

    if (!pdfWindow) {
        URL.revokeObjectURL(pdfUrl);
        alert("The PDF tab could not be opened. Please allow pop-ups and try again.");
        return;
    }

    pdfWindow.opener = null;

    try {
        pdfWindow.location.replace(pdfUrl);
    } catch (error) {
        pdfWindow.close();
        URL.revokeObjectURL(pdfUrl);
        alert("This PDF could not be opened in your browser.");
        return;
    }

    const cleanupTimer = window.setInterval(() => {
        if (!pdfWindow.closed) return;

        window.clearInterval(cleanupTimer);
        URL.revokeObjectURL(pdfUrl);
    }, 1000);
}

function renderMaterials() {
    if (!ensureContentReady()) return;
    const header = makeSectionHeader(
        "Books & Notes",
        "Add course books, lecture notes, PDFs, and recommended resources.",
        "＋ Add material",
        showMaterialForm
    );

    contentArea.replaceChildren(header);

    const list = element("div", "course-content-list");

    if (content.materials.length === 0) {
        list.appendChild(makeEmptyState(
            "No materials added yet",
            "Add a book, PDF, lecture note, or learning resource for this course."
        ));
    }

    content.materials.forEach((item) => {
        const typeLabel = item.type === "book" ? "BOOK" :
            item.type === "notes" ? "NOTES" : "RESOURCE";

        const details = [typeLabel];

        if (item.fileName) details.push(item.fileName);
        if (item.url) details.push("External link");

        const card = makeCard(item.title, item.description, details);

        if (item.fileData) {
            const openLink = element("a", "course-resource-link", "Open PDF");
            openLink.href = "#";
            openLink.setAttribute("aria-label", `Open ${item.fileName}`);
            openLink.addEventListener("click", (event) => {
                event.preventDefault();
                if (!hasTeacherAccess()) return;
                openPdfInNewTab(item.fileData);
            });
            card.appendChild(openLink);
        } else if (getExternalResourceUrl(item.url)) {
            const openLink = element(
                "a",
                "course-resource-link",
                "Open resource"
            );
            openLink.href = getExternalResourceUrl(item.url);
            openLink.target = "_blank";
            openLink.rel = "noopener noreferrer";
            card.appendChild(openLink);
        } else if (item.url) {
            const unavailable = element("span", "course-resource-link", "Resource link unavailable");
            unavailable.setAttribute("aria-disabled", "true");
            unavailable.title = "The saved resource URL is invalid. Its record was left unchanged.";
            card.appendChild(unavailable);
        }

        addDeleteButton(card, "materials", item.id, item.title);
        list.appendChild(card);
    });

    contentArea.appendChild(list);
}

function showMaterialForm() {
    const { form, message } = makeForm(
        "Add course material",
        "Add a book, lecture notes, or a recommended resource."
    );

    const type = makeSelect("materialType", [
        ["book", "Book / Reading material"],
        ["notes", "Lecture notes"],
        ["resource", "Recommended resource"]
    ]);

    const title = makeInput(
        "materialTitle",
        "text",
        "e.g. Design Fundamentals"
    );
    const description = makeTextarea(
        "materialDescription",
        "Describe this material"
    );
    const file = makeInput("materialFile", "file");
    file.accept = ".pdf,application/pdf";

    const fileHelp = element(
        "small",
        "course-field-help",
        "PDF only, maximum 2 MB per file in this browser prototype."
    );

    const url = makeInput(
        "materialUrl",
        "url",
        "https://example.com/resource"
    );

    form.append(
        makeField("Material type", type, true),
        makeField("Title", title, true),
        makeField("Description", description),
        makeField("Attach PDF (optional)", file),
        fileHelp,
        makeField("External resource link (optional)", url)
    );

    const actions = element("div", "course-form-actions");
    actions.append(
        makeButton("Cancel", "course-secondary-btn", renderMaterials)
    );

    const submit = element("button", "course-primary-btn", "Save material");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!ensureContentReady()) return;
        message.textContent = "";

        const materialTitle = title.value.trim();
        const resourceUrl = url.value.trim();
        if (!materialTitle) {
            message.textContent = "Enter a material title.";
            return;
        }
        const selectedFile = file.files[0];

        if (selectedFile && selectedFile.type !== "application/pdf") {
            message.textContent = "Please select a PDF file.";
            return;
        }

        if (selectedFile && selectedFile.size > MAX_PDF_SIZE) {
            message.textContent =
                "This PDF is larger than 2 MB. Choose a smaller file.";
            return;
        }

        if (!selectedFile && !resourceUrl) {
            message.textContent =
                "Attach a PDF or provide an external resource link.";
            return;
        }
        if (resourceUrl && !getExternalResourceUrl(resourceUrl)) {
            message.textContent = "Enter a valid HTTP or HTTPS resource link.";
            return;
        }

        let fileData = "";

        if (selectedFile) {
            try {
                fileData = await readFileAsDataURL(selectedFile);
            } catch (error) {
                message.textContent = "Could not read the selected PDF.";
                return;
            }
        }

        if (!ensureContentReady()) return;

        content.materials.push({
            id: crypto.randomUUID(),
            type: type.value,
            title: materialTitle,
            description: description.value.trim(),
            fileName: selectedFile ? selectedFile.name : "",
            fileData,
            url: resourceUrl ? getExternalResourceUrl(resourceUrl) : "",
            createdAt: new Date().toISOString()
        });

        if (saveContent("materials")) {
            renderMaterials();
        } else {
            content.materials.pop();
        }
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);

        reader.readAsDataURL(file);
    });
}

function formatFileSize(size) {
    if (!Number.isFinite(size) || size < 0) return "Size unavailable";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

// Return only manually or automatically submitted work.
// Under-review files are never rendered in this teacher interface.
function getVisibleSubmissions(assignmentId) {
    return content.submissions
        .map(normalizeSubmission)
        .filter((submission) =>
            submission.assignmentId === assignmentId &&
            ["submitted", "auto-submitted"].includes(submission.status) &&
            submission.files.length > 0
        );
}

// Add submitted files to the matching assignment card.
function renderAssignmentSubmissions(assignment) {
    const submissions = getVisibleSubmissions(assignment.id);
    const section = element("div", "course-content-list");

    section.appendChild(element("h3", "course-section-title", "Student submissions"));

    if (!submissions.length) {
        section.appendChild(element(
            "p",
            "course-content-description",
            "No submitted files yet."
        ));
        return section;
    }

    submissions.forEach((submission) => {
        const automatic = submission.status === "auto-submitted";
        const submittedAt = submission.submittedAt || submission.uploadedAt;
        const studentLabel = typeof submission.studentId === "string" &&
            submission.studentId.trim() !== "" &&
            submission.studentId.trim() !== "demo-student"
            ? submission.studentId
            : "Unknown student";

        const submissionCard = makeCard(
            `Student: ${studentLabel}`,
            `Assignment: ${assignment.title}`,
            [
                automatic ? "Automatically submitted" : "Manually submitted",
                `Submitted: ${formatDateTime(submittedAt)}`
            ]
        );

        submission.files.forEach((file) => {
            const link = element(
                "a",
                "course-resource-link",
                `Open / download ${file.fileName || "file"} (${formatFileSize(file.fileSize)})`
            );

            if (file.fileData) {
                link.href = file.fileData;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.download = file.fileName || "submission-file";
            } else {
                link.setAttribute("aria-disabled", "true");
                link.title = "The saved file data is unavailable.";
            }

            submissionCard.appendChild(link);
        });

        section.appendChild(submissionCard);
    });

    return section;
}

function renderAssignments() {
    if (!ensureContentReady()) return;

    // Pick up submissions written by the student page in another tab.
    if (!syncSubmissionsFromStorage()) return;

    // Catch review drafts whose deadline passed while this page was closed.
    processAutomaticSubmissions();
    if (!hasTeacherAccess()) return;

    const header = makeSectionHeader(
        "Assignments",
        "Create tasks, set deadlines, and keep course work organized.",
        "＋ Create assignment",
        () => showAssignmentForm(null)
    );

    contentArea.replaceChildren(header);

    const list = element("div", "course-content-list");

    if (content.assignments.length === 0) {
        list.appendChild(makeEmptyState(
            "No assignments yet",
            "Create your first assignment and set its due date, time, and marks."
        ));
    }

    content.assignments.forEach((item) => {
        const status = item.published ? "Published" : "Draft";

        const card = makeCard(item.title, item.description, [
            `Starts: ${formatDateTime(item.startAt)}`,
            `Due: ${formatDateTime(item.dueAt)}`,
            `${item.marks} marks`,
            status
        ]);

        card.appendChild(makeButton(
            item.published ? "Unpublish" : "Publish",
            "course-secondary-btn",
            () => {
                item.published = !item.published;

                if (saveContent("assignments")) {
                    renderAssignments();
                } else {
                    item.published = !item.published;
                }
            }
        ));

        card.appendChild(makeButton(
            "Edit",
            "course-secondary-btn",
            () => showAssignmentForm(item.id)
        ));

        addDeleteButton(card, "assignments", item.id, item.title);

        // The renderer filters out under-review submissions.
        card.appendChild(renderAssignmentSubmissions(item));
        list.appendChild(card);
    });

    contentArea.appendChild(list);
    scheduleDeadlineCheck();
}

function showAssignmentForm(assignmentId = null) {
    if (!ensureContentReady()) return;
    const editing = assignmentId !== null;
    const currentAssignment = editing
        ? content.assignments.find((item) => item.id === assignmentId)
        : null;
    if (editing && !currentAssignment) {
        showContentUnavailable("This assignment is no longer available. Reload before continuing.");
        return;
    }
    const expectedAssignmentSnapshot = currentAssignment ? JSON.stringify(currentAssignment) : null;
    const { form, message } = makeForm(
        editing ? "Edit assignment" : "Create assignment",
        editing
            ? "Update the assignment details while preserving its ID, publication state, and submissions."
            : "Add the instructions, schedule, and marks for your students."
    );

    const title = makeInput(
        "assignmentTitle",
        "text",
        "e.g. Visual Analysis Essay"
    );
    const description = makeTextarea(
        "assignmentDescription",
        "Write assignment instructions"
    );
    const startAt = makeInput("assignmentStart", "datetime-local");
    const dueAt = makeInput("assignmentDue", "datetime-local");
    const marks = makeInput("assignmentMarks", "number", "e.g. 20");

    marks.min = "1";
    marks.max = "10000";
    marks.step = "1";
    marks.disabled = editing;
    if (currentAssignment) {
        title.value = currentAssignment.title;
        description.value = currentAssignment.description;
        startAt.value = currentAssignment.startAt || "";
        dueAt.value = currentAssignment.dueAt || currentAssignment.due || "";
        marks.value = currentAssignment.marks ?? "";
    }

    form.append(
        makeField("Assignment title", title, true),
        makeField("Instructions", description, true),
        makeField("Available from", startAt, true),
        makeField("Due date and time", dueAt, true),
        makeField("Maximum marks", marks, !editing)
    );

    const actions = element("div", "course-form-actions");
    actions.append(
        makeButton("Cancel", "course-secondary-btn", renderAssignments)
    );

    const submit = element("button", "course-primary-btn", editing ? "Save changes" : "Save assignment");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!ensureContentReady()) return;
        const trimmedTitle = title.value.trim();
        const trimmedDescription = description.value.trim();
        if (!trimmedTitle) {
            message.textContent = "Enter an assignment title.";
            return;
        }
        if (!trimmedDescription) {
            message.textContent = "Enter assignment instructions.";
            return;
        }
        const startTimestamp = new Date(startAt.value).getTime();
        const dueTimestamp = new Date(dueAt.value).getTime();
        if (!Number.isFinite(startTimestamp) || !Number.isFinite(dueTimestamp)) {
            message.textContent = "Enter valid availability and due dates.";
            return;
        }
        if (dueTimestamp < startTimestamp) {
            message.textContent =
                "The due date cannot be earlier than the availability date.";
            return;
        }

        let originalAssignments;
        if (editing) {
            const snapshot = readStoredContentSnapshot();
            if (!snapshot.success) {
                showContentUnavailable(snapshot.message);
                return;
            }
            if (snapshot.rawValue !== contentStorageRawValue) {
                showContentUnavailable("Course content changed in another tab. Reload before editing this assignment.");
                return;
            }
            const index = snapshot.data.assignments.findIndex((item) => item.id === assignmentId);
            const latestAssignment = snapshot.data.assignments[index];
            if (!latestAssignment || JSON.stringify(latestAssignment) !== expectedAssignmentSnapshot) {
                showContentUnavailable("This assignment changed in another tab. Reload before editing it.");
                return;
            }
            originalAssignments = content.assignments;
            content.assignments = snapshot.data.assignments.slice();
            content.assignments[index] = {
                ...latestAssignment,
                title: trimmedTitle,
                description: trimmedDescription,
                startAt: startAt.value,
                dueAt: dueAt.value
            };
        } else {
            originalAssignments = content.assignments;
            content.assignments.push({
                id: crypto.randomUUID(),
                title: trimmedTitle,
                description: trimmedDescription,
                startAt: startAt.value,
                dueAt: dueAt.value,
                marks: Number(marks.value),
                published: false,
                createdAt: new Date().toISOString()
            });
        }

        if (saveContent("assignments")) {
            renderAssignments();
        } else {
            content.assignments = originalAssignments;
        }
    });
}

function renderQuizzes() {
    if (!ensureContentReady()) return;
    const header = makeSectionHeader(
        "Quizzes",
        "Create assessments, set their type and schedule, and manage publication.",
        "＋ Create quiz",
        showQuizForm
    );

    contentArea.replaceChildren(header);

    const list = element("div", "course-content-list");

    if (content.quizzes.length === 0) {
        list.appendChild(makeEmptyState(
            "No quizzes yet",
            "Create a quiz with a type, duration, opening date, and deadline."
        ));
    }

    content.quizzes.forEach((item) => {
        const card = makeCard(item.title, item.description, [
            `Type: ${item.type}`,
            `${item.questionCount} questions`,
            `${item.duration} minutes`,
            `Opens: ${formatDateTime(item.startAt)}`,
            `Closes: ${formatDateTime(item.dueAt)}`,
            item.published ? "Published" : "Draft"
        ]);

        card.appendChild(makeButton(
            item.published ? "Unpublish" : "Publish",
            "course-secondary-btn",
            () => {
                item.published = !item.published;

                if (saveContent("quizzes")) {
                    renderQuizzes();
                } else {
                    item.published = !item.published;
                }
            }
        ));

        addDeleteButton(card, "quizzes", item.id, item.title);
        list.appendChild(card);
    });

    contentArea.appendChild(list);
}

function showQuizForm() {
    if (!ensureContentReady()) return;
    const { form, message } = makeForm(
        "Create quiz",
        "Choose the assessment format and schedule when students can attempt it."
    );

    const title = makeInput(
        "quizTitle",
        "text",
        "e.g. Design Principles Quiz"
    );
    const description = makeTextarea("quizDescription", "Describe the quiz");
    const type = makeSelect("quizType", [
        ["multiple-choice", "Multiple choice"],
        ["true-false", "True / False"],
        ["short-answer", "Short answer"],
        ["mixed", "Mixed question types"]
    ]);

    const questionCount = makeInput("quizQuestions", "number", "e.g. 10");
    questionCount.min = "1";
    questionCount.max = "200";
    questionCount.step = "1";

    const duration = makeInput("quizDuration", "number", "e.g. 15");
    duration.min = "1";
    duration.max = "600";
    duration.step = "1";

    const startAt = makeInput("quizStart", "datetime-local");
    const dueAt = makeInput("quizDue", "datetime-local");

    const resultVisibility = makeSelect("quizResultVisibility", [
        ["immediate", "Show marks immediately after submission"],
        ["teacher-release", "Show marks after I release results"]
    ]);

    const formUrl = makeInput(
        "quizFormUrl",
        "url",
        "https://forms.gle/..."
    );

    form.append(
        makeField("Quiz title", title, true),
        makeField("Description", description),
        makeField("Quiz type", type, true),
        makeField("Number of questions", questionCount, true),
        makeField("Duration (minutes)", duration, true),
        makeField("Opening date and time", startAt, true),
        makeField("Closing date and time", dueAt, true),
        makeField("When students can see marks", resultVisibility, true),
        makeField("Google Forms URL (optional)", formUrl),
    );

    const actions = element("div", "course-form-actions");
    actions.append(
        makeButton("Cancel", "course-secondary-btn", renderQuizzes)
    );

    const submit = element("button", "course-primary-btn", "Save quiz");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!ensureContentReady()) return;

        const trimmedTitle = title.value.trim();
        if (!trimmedTitle) {
            message.textContent = "Enter a quiz title.";
            return;
        }

        const trimmedFormUrl = formUrl.value.trim();
        if (trimmedFormUrl && !isConfiguredQuizFormUrl(trimmedFormUrl)) {
            message.textContent =
                "Use an HTTPS Google Forms link from forms.gle or docs.google.com.";
            return;
        }

        const startTimestamp = new Date(startAt.value).getTime();
        const dueTimestamp = new Date(dueAt.value).getTime();
        if (!Number.isFinite(startTimestamp) || !Number.isFinite(dueTimestamp)) {
            message.textContent = "Enter valid opening and closing dates.";
            return;
        }
        if (dueTimestamp <= startTimestamp) {
            message.textContent =
                "The quiz closing time must be after its opening time.";
            return;
        }

        const quiz = {
            id: crypto.randomUUID(),
            title: trimmedTitle,
            description: description.value.trim(),
            type: type.value,
            questionCount: Number(questionCount.value),
            duration: Number(duration.value),
            startAt: startAt.value,
            dueAt: dueAt.value,
            published: false,
            createdAt: new Date().toISOString(),
            resultVisibility: resultVisibility.value,
            resultsReleased: false,
            formUrl: trimmedFormUrl
        };

        content.quizzes.push(quiz);

        if (saveContent("quizzes")) {
            renderQuizzes();
        } else {
            content.quizzes.pop();
        }
    });
}

function renderAttendance() {
    contentArea.replaceChildren(
        makeSectionHeader(
            "Attendance",
            "Attendance management will connect to your enrolled student roster.",
            "Coming next",
            () => {
                alert(
                    "Attendance will be implemented after the student roster and enrollment flow."
                );
            }
        ),
        makeEmptyState(
            "Student roster required",
            "We'll build class dates, Present/Absent/Late options, saved attendance records, and attendance percentages once student enrollment is available."
        )
    );
}

let currentTab = "materials";

function renderTab(tabName) {
    if (!ensureContentReady()) return;
    currentTab = tabName;

    if (!course) return;

    switch (tabName) {
        case "materials":
            renderMaterials();
            break;
        case "assignments":
            renderAssignments();
            break;
        case "quizzes":
            renderQuizzes();
            break;
        case "attendance":
            renderAttendance();
            break;
        default:
            renderMaterials();
    }
}

// Recheck deadlines while the teacher workspace remains open.
function scheduleDeadlineCheck() {
    if (!hasTeacherAccess()) return;
    if (deadlineTimer) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }

    const pendingDeadlines = content.submissions
        .map(normalizeSubmission)
        .filter((submission) =>
            submission.status === "under-review" &&
            submission.files.length > 0
        )
        .map((submission) => {
            const assignment = content.assignments.find(
                (item) => item.id === submission.assignmentId
            );
            return getDeadlineTimestamp(assignment);
        })
        .filter((deadline) => deadline !== null && deadline > Date.now());

    if (!pendingDeadlines.length) return;

    const nextDeadline = Math.min(...pendingDeadlines);
    const delay = Math.min(
        Math.max(nextDeadline - Date.now() + 50, 0),
        2147483647
    );

    deadlineTimer = window.setTimeout(() => {
        processAutomaticSubmissions();
        if (!hasTeacherAccess()) return;

        if (currentTab === "assignments") {
            renderAssignments();
        } else {
            scheduleDeadlineCheck();
        }
    }, delay);
}

// A submission from another tab triggers a refresh. Pending files remain hidden.
window.addEventListener("storage", (event) => {
    if (teacherAccess?.isRelevantStorageChange(event.key)) {
        recheckTeacherAccess();
        if (!hasTeacherAccess()) return;
    }
    if (event.key === COURSE_KEY || event.key === "learnspaceCurriculumCourses" ||
        event.key === "learnspaceSemesters") {
        recheckTeacherAccess();
        if (!hasTeacherAccess()) return;
    }
    if (event.key !== contentStorageKey()) return;

    syncSubmissionsFromStorage();
    processAutomaticSubmissions();
    if (!hasTeacherAccess()) return;

    if (currentTab === "assignments") {
        renderAssignments();
    } else {
        scheduleDeadlineCheck();
    }
});

// Catch deadlines when the teacher returns to the workspace after it was idle.
window.addEventListener("focus", () => {
    recheckTeacherAccess();
    if (!hasTeacherAccess()) return;
    syncSubmissionsFromStorage();
    processAutomaticSubmissions();

    if (currentTab === "assignments") {
        renderAssignments();
    } else {
        scheduleDeadlineCheck();
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    recheckTeacherAccess();
    if (!hasTeacherAccess()) return;

    syncSubmissionsFromStorage();
    processAutomaticSubmissions();

    if (currentTab === "assignments") {
        renderAssignments();
    } else {
        scheduleDeadlineCheck();
    }
});

courseTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        if (!hasTeacherAccess()) return;
        if (!course) return;

        courseTabs.forEach((item) => {
            const active = item === tab;
            item.classList.toggle("active", active);
            item.setAttribute("aria-selected", String(active));
        });

        renderTab(tab.dataset.tab);
    });
});

// Run the automatic deadline check as soon as the teacher workspace loads.
function recheckTeacherAccess() {
    if (!hasTeacherAccess()) revokeTeacherAccess();
}

window.addEventListener("pageshow", recheckTeacherAccess);

if (initialTeacherAccess?.allowed && course && hasTeacherAccess()) {
    initializeCourse();
    processAutomaticSubmissions();
    renderTab("materials");
    scheduleDeadlineCheck();
} else {
    revokeTeacherAccess();
}
