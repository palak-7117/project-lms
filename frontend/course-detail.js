//TEACHER COURSES
"use strict";

const COURSE_KEY = "learnspaceCourses";
const CONTENT_PREFIX = "learnspaceContent_";
const MAX_PDF_SIZE = 2 * 1024 * 1024; // 2 MB
const teacherAccess = window.LearnSpaceTeacherAccess;
const initialTeacherAccess = teacherAccess?.evaluate();
let teacherAccessRevoked = !initialTeacherAccess?.allowed;
const teacherUserId = initialTeacherAccess?.userId || null;

function hasTeacherAccess() {
    if (teacherAccessRevoked || !teacherAccess) return false;
    const current = teacherAccess.evaluate();
    if (!current.allowed || current.userId !== teacherUserId) {
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

function loadCourses() {
    if (!hasTeacherAccess()) return [];
    try {
        const data = JSON.parse(localStorage.getItem(COURSE_KEY) || "[]");
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Could not load courses:", error);
        return [];
    }
}

const course = initialTeacherAccess?.allowed
    ? loadCourses().find((item) => item.id === courseId)
    : null;

function contentStorageKey() {
    return CONTENT_PREFIX + courseId;
}

// Read the full stored course record so additional fields are preserved.
function readStoredContent() {
    if (!hasTeacherAccess()) return {};
    try {
        const data = JSON.parse(
            localStorage.getItem(contentStorageKey()) || "{}"
        );

        return data && typeof data === "object" && !Array.isArray(data)
            ? data
            : {};
    } catch (error) {
        console.error("Could not load course content:", error);
        return {};
    }
}

// Keep the raw value with a parsed snapshot so saves can reject stale data.
function readStoredContentSnapshot() {
    if (!hasTeacherAccess()) return null;
    try {
        const rawValue = localStorage.getItem(contentStorageKey());
        if (rawValue === null) return { rawValue, data: {} };
        if (typeof rawValue !== "string") return null;

        const data = JSON.parse(rawValue);
        if (!data || typeof data !== "object" || Array.isArray(data) ||
            (Object.prototype.hasOwnProperty.call(data, "submissions") &&
             !Array.isArray(data.submissions))) {
            return null;
        }
        return { rawValue, data };
    } catch (error) {
        console.error("Could not verify course content before saving:", error);
        return null;
    }
}

function loadContent() {
    if (!hasTeacherAccess()) return { materials: [], assignments: [], quizzes: [], submissions: [] };
    const data = readStoredContent();

    return {
        ...data,
        materials: Array.isArray(data.materials) ? data.materials : [],
        assignments: Array.isArray(data.assignments) ? data.assignments : [],
        quizzes: Array.isArray(data.quizzes) ? data.quizzes : [],
        submissions: Array.isArray(data.submissions) ? data.submissions : []
    };
}

let content = courseId
    ? loadContent()
    : { materials: [], assignments: [], quizzes: [], submissions: [] };

// By default, merge in the latest submissions before saving. This prevents
// a teacher page left open in another tab from overwriting student submissions.
function saveContent() {
    if (!hasTeacherAccess()) return false;
    try {
        const snapshot = readStoredContentSnapshot();
        if (!snapshot) return false;
        const latest = snapshot.data;
        const latestSubmissions = Array.isArray(latest.submissions)
            ? latest.submissions
            : [];

        const submissions = latestSubmissions;

        const updatedContent = {
            ...latest,
            ...content,
            submissions
        };

        if (!hasTeacherAccess() ||
            localStorage.getItem(contentStorageKey()) !== snapshot.rawValue) {
            return false;
        }
        localStorage.setItem(contentStorageKey(), JSON.stringify(updatedContent));

        content.submissions = submissions;
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

    courseTitle.textContent = course.name;
    courseInstructor.textContent = course.instructor || "Not specified";
    instructorAvatar.textContent = getInitials(course.instructor || "Teacher");
    courseDescription.textContent =
        course.description || "No course description added yet.";

    // Student enrollment will be connected to the backend later.
    studentCount.textContent = "0";
    document.title = `${course.name} | LearnSpace`;
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
    if (!snapshot) return false;

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
        try {
            if (!hasTeacherAccess() || localStorage.getItem(contentStorageKey()) !== snapshot.rawValue) {
                return false;
            }
            localStorage.setItem(contentStorageKey(), JSON.stringify({
                ...latest,
                submissions
            }));
        } catch (error) {
            console.error("Could not save automatic submission updates:", error);
            return false;
        }
    }

    content.submissions = submissions;

    return changed;
}

function syncSubmissionsFromStorage() {
    if (!hasTeacherAccess()) return;
    const latest = readStoredContent();
    content.submissions = Array.isArray(latest.submissions)
        ? latest.submissions
        : [];
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
        if (hasTeacherAccess()) callback(...args);
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

            content[collection] = content[collection].filter(
                (item) => item.id !== id
            );

            if (saveContent()) {
                renderTab(currentTab);
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
        } else if (item.url) {
            const openLink = element(
                "a",
                "course-resource-link",
                "Open resource"
            );
            openLink.href = item.url;
            openLink.target = "_blank";
            openLink.rel = "noopener noreferrer";
            card.appendChild(openLink);
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
        if (!hasTeacherAccess()) return;
        message.textContent = "";

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

        if (!selectedFile && !url.value.trim()) {
            message.textContent =
                "Attach a PDF or provide an external resource link.";
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

        content.materials.push({
            id: crypto.randomUUID(),
            type: type.value,
            title: title.value.trim(),
            description: description.value.trim(),
            fileName: selectedFile ? selectedFile.name : "",
            fileData,
            url: url.value.trim(),
            createdAt: new Date().toISOString()
        });

        if (saveContent()) {
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
    if (!hasTeacherAccess()) return;

    // Pick up submissions written by the student page in another tab.
    syncSubmissionsFromStorage();

    // Catch review drafts whose deadline passed while this page was closed.
    processAutomaticSubmissions();
    if (!hasTeacherAccess()) return;

    const header = makeSectionHeader(
        "Assignments",
        "Create tasks, set deadlines, and keep course work organized.",
        "＋ Create assignment",
        showAssignmentForm
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

                if (saveContent()) {
                    renderAssignments();
                }
            }
        ));

        addDeleteButton(card, "assignments", item.id, item.title);

        // The renderer filters out under-review submissions.
        card.appendChild(renderAssignmentSubmissions(item));
        list.appendChild(card);
    });

    contentArea.appendChild(list);
    scheduleDeadlineCheck();
}

function showAssignmentForm() {
    const { form, message } = makeForm(
        "Create assignment",
        "Add the instructions, schedule, and marks for your students."
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

    form.append(
        makeField("Assignment title", title, true),
        makeField("Instructions", description, true),
        makeField("Available from", startAt, true),
        makeField("Due date and time", dueAt, true),
        makeField("Maximum marks", marks, true)
    );

    const actions = element("div", "course-form-actions");
    actions.append(
        makeButton("Cancel", "course-secondary-btn", renderAssignments)
    );

    const submit = element("button", "course-primary-btn", "Save assignment");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!hasTeacherAccess()) return;

        if (new Date(dueAt.value) < new Date(startAt.value)) {
            message.textContent =
                "The due date cannot be earlier than the availability date.";
            return;
        }

        const assignment = {
            id: crypto.randomUUID(),
            title: title.value.trim(),
            description: description.value.trim(),
            startAt: startAt.value,
            dueAt: dueAt.value,
            marks: Number(marks.value),
            published: false,
            createdAt: new Date().toISOString()
        };

        content.assignments.push(assignment);

        if (saveContent()) {
            renderAssignments();
        } else {
            content.assignments.pop();
        }
    });
}

function renderQuizzes() {
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

                if (saveContent()) {
                    renderQuizzes();
                }
            }
        ));

        addDeleteButton(card, "quizzes", item.id, item.title);
        list.appendChild(card);
    });

    contentArea.appendChild(list);
}

function showQuizForm() {
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
        if (!hasTeacherAccess()) return;

        if (new Date(dueAt.value) <= new Date(startAt.value)) {
            message.textContent =
                "The quiz closing time must be after its opening time.";
            return;
        }

        const quiz = {
            id: crypto.randomUUID(),
            title: title.value.trim(),
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
            formUrl: formUrl.value.trim()
        };

        content.quizzes.push(quiz);

        if (saveContent()) {
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
    if (!hasTeacherAccess()) return;
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

if (initialTeacherAccess?.allowed) {
    initializeCourse();
    processAutomaticSubmissions();
    renderTab("materials");
    scheduleDeadlineCheck();
} else {
    revokeTeacherAccess();
}
