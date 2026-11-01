//STUDENT COURSES
"use strict";

// These keys match the teacher pages' localStorage structure.
const COURSE_STORAGE_KEY = "learnspaceCourses";
const CONTENT_STORAGE_PREFIX = "learnspaceContent_";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_SUBMISSION_SIZE = 2 * 1024 * 1024;

const DEMO_STUDENT_ID = "demo-student";
const ATTENDANCE_THRESHOLD = 75; // Example only; not an official rule.

const courseId = new URLSearchParams(window.location.search).get("course");
const sampleCourses = Array.isArray(window.courseCatalog)
    ? window.courseCatalog
    : [];

const courseContent = document.querySelector("#courseContent");
const pageMessage = document.querySelector("#pageMessage");
const assignmentDialog = document.querySelector("#assignmentDialog");

let activeAssignment = null;
let activeCourse = null;
let selectedSubmissionFiles = [];
let deadlineTimer = null;

// Read teacher-created courses from localStorage.
function readTeacherCourses() {
    try {
        const courses = JSON.parse(
            localStorage.getItem(COURSE_STORAGE_KEY) || "[]"
        );
        return Array.isArray(courses) ? courses : [];
    } catch (error) {
        console.error("Could not load teacher courses:", error);
        return [];
    }
}

// Read a course record without dropping any additional properties.
function readCourseContent(selectedCourseId) {
    try {
        const data = JSON.parse(
            localStorage.getItem(
                `${CONTENT_STORAGE_PREFIX}${selectedCourseId}`
            ) || "{}"
        );

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return {
                materials: [],
                assignments: [],
                quizzes: [],
                submissions: []
            };
        }

        return {
            ...data,
            materials: Array.isArray(data.materials) ? data.materials : [],
            assignments: Array.isArray(data.assignments) ? data.assignments : [],
            quizzes: Array.isArray(data.quizzes) ? data.quizzes : [],
            submissions: Array.isArray(data.submissions) ? data.submissions : []
        };
    } catch (error) {
        console.error("Could not load course content:", error);
        return {
            materials: [],
            assignments: [],
            quizzes: [],
            submissions: []
        };
    }
}

// Save the record under its existing course-specific key.
function writeCourseContent(selectedCourseId, content) {
    try {
        localStorage.setItem(
            `${CONTENT_STORAGE_PREFIX}${selectedCourseId}`,
            JSON.stringify(content)
        );
        return true;
    } catch (error) {
        console.error("Could not save course content:", error);
        return false;
    }
}

// Read a file as a data URL, using the same approach as teacher PDF uploads.
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// Make teacher-entered dates readable on the student page.
function formatTeacherDate(value) {
    if (!value) return "Date not set";

    const date = new Date(String(value).replace("·", ""));

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

// Return the assignment deadline as a timestamp, if one is available.
function getDeadlineTimestamp(assignment) {
    const value = assignment?.dueAt || assignment?.due;

    if (!value) return null;

    const date = new Date(String(value).replace("·", ""));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function isDeadlinePassed(assignment) {
    const deadline = getDeadlineTimestamp(assignment);
    return deadline !== null && Date.now() >= deadline;
}

// Convert previous single-file records to the current multiple-file shape.
// Older submissions made with the earlier demo code are treated as submitted.
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

    const allowedStatuses = [
        "under-review",
        "submitted",
        "auto-submitted"
    ];

    let status = submission.status;

    if (!allowedStatuses.includes(status)) {
        status = files.length ? "submitted" : "under-review";
    }

    return {
        ...submission,
        id: submission.id || crypto.randomUUID(),
        courseId: submission.courseId || courseId,
        studentId: submission.studentId || DEMO_STUDENT_ID,
        files,
        status,
        uploadedAt: submission.uploadedAt || submission.submittedAt || null,
        submittedAt: submission.submittedAt || null,
        submissionType: submission.submissionType || null
    };
}

// If a saved review draft is past its due date, submit it automatically.
// Empty drafts are discarded and never become empty submissions.
function processAutomaticSubmissions(selectedCourseId, assignments, content) {
    let changed = false;
    const now = Date.now();
    const assignmentById = new Map(
        assignments.map((assignment) => [assignment.id, assignment])
    );

    const normalized = content.submissions
        .map((item) => normalizeSubmission(item))
        .filter((submission) => {
            const old = content.submissions.find((item) => item.id === submission.id);

            if (JSON.stringify(old) !== JSON.stringify(submission)) {
                changed = true;
            }

            if (submission.status === "under-review" &&
                submission.files.length === 0) {
                changed = true;
                return false;
            }

            const assignment = assignmentById.get(submission.assignmentId);
            const deadline = getDeadlineTimestamp(assignment);

            if (
                submission.status === "under-review" &&
                submission.files.length > 0 &&
                deadline !== null &&
                now >= deadline
            ) {
                submission.status = "auto-submitted";
                submission.submittedAt = new Date().toISOString();
                submission.submissionType = "automatic";
                changed = true;
            }

            return true;
        });

    if (changed) {
        const saved = writeCourseContent(selectedCourseId, {
            ...content,
            submissions: normalized
        });

        if (!saved) {
            console.error(
                "Automatic submission could not be saved. Browser storage may be full."
            );
        }
    }

    return {
        ...content,
        submissions: normalized
    };
}

// Convert teacher material types to the labels used by the student page.
function normalizeMaterialType(type) {
    const types = {
        book: "Book",
        notes: "Lecture notes",
        resource: "Recommended resource"
    };

    return types[(type || "").toLowerCase()] || type || "Material";
}

// Find the saved submission for this demo student and assignment.
function findStudentSubmission(submissions, assignmentId) {
    return submissions
        .map(normalizeSubmission)
        .find((item) =>
            item.assignmentId === assignmentId &&
            item.studentId === DEMO_STUDENT_ID
        ) || null;
}

// Convert a teacher assignment to the shape used by student cards.
function mapTeacherAssignments(assignments, submissions) {
    return assignments
        .filter((item) => item.published === true)
        .map((item) => {
            const submission = findStudentSubmission(submissions, item.id);

            let status = "Available";
            if (submission?.status === "under-review") {
                status = "Under review";
            } else if (submission?.status === "submitted") {
                status = "Submitted";
            } else if (submission?.status === "auto-submitted") {
                status = "Auto-submitted";
            } else if (isDeadlinePassed(item)) {
                status = "Deadline passed";
            }

            return {
                ...item,
                due: formatTeacherDate(item.dueAt),
                status,
                submission,
                referenceFiles: []
            };
        });
}

// Find the selected course and adapt teacher data for the student interface.
function getSelectedCourse() {
    if (!courseId) return null;

    const teacherCourse = readTeacherCourses()
        .find((item) => String(item.id) === courseId);

    if (teacherCourse) {
        let content = readCourseContent(courseId);

        // Run the deadline check when this course page loads.
        content = processAutomaticSubmissions(
            courseId,
            content.assignments,
            content
        );

        // Preserve matching sample attendance records without changing their data.
        const matchingSample = sampleCourses.find((item) =>
            (item.title || "").trim().toLowerCase() ===
            (teacherCourse.name || "").trim().toLowerCase()
        );

        const attendance = (matchingSample?.attendance || []).map((record) => ({
            ...record,
            courseId
        }));

        return {
            id: courseId,
            teacherManaged: true,
            title: teacherCourse.name || teacherCourse.title || "Untitled course",
            description: teacherCourse.description || "",
            icon: teacherCourse.icon || "✳",
            image: teacherCourse.image || teacherCourse.coverUrl || "",
            instructor: {
                name: teacherCourse.instructor || "Instructor not listed",
                photo: ""
            },
            attendance,

            resources: content.materials.map((item) => ({
                title: item.title || item.fileName || "Untitled material",
                type: normalizeMaterialType(item.type),
                filename: item.fileName || "",
                fileData: item.fileData || "",
                url: item.url || ""
            })),

            assignments: mapTeacherAssignments(
                content.assignments,
                content.submissions
            ),

            quizzes: content.quizzes
                .filter((item) => item.published === true)
                .map((item) => ({
                    ...item,
                    questions: item.questionCount,
                    timeLimit: item.duration
                        ? `${item.duration} minutes`
                        : "",
                    due: formatTeacherDate(item.dueAt),
                    formUrl: item.formUrl || ""
                }))
        };
    }

    // Keep the existing sample courses and attendance available as fallback.
    const sampleCourse = sampleCourses.find((item) => item.id === courseId);
    if (!sampleCourse) return null;

    let content = readCourseContent(courseId);
    content = processAutomaticSubmissions(
        courseId,
        sampleCourse.assignments || [],
        content
    );

    return {
        ...sampleCourse,
        teacherManaged: false,
        assignments: (sampleCourse.assignments || []).map((assignment) => {
            const submission = findStudentSubmission(
                content.submissions,
                assignment.id
            );

            let status = assignment.status || "Available";
            if (submission?.status === "under-review") status = "Under review";
            if (submission?.status === "submitted") status = "Submitted";
            if (submission?.status === "auto-submitted") {
                status = "Auto-submitted";
            }

            return { ...assignment, status, submission };
        })
    };
}

activeCourse = getSelectedCourse();

// Save or replace this student's submission without overwriting other course data.
function saveStudentSubmission(assignment, files, status) {
    const content = readCourseContent(courseId);
    const existing = findStudentSubmission(
        content.submissions,
        assignment.id
    );

    const submission = {
        id: existing?.id || crypto.randomUUID(),
        courseId,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        studentId: DEMO_STUDENT_ID,
        files,
        status,
        uploadedAt: existing?.uploadedAt || new Date().toISOString(),
        submittedAt: status === "under-review"
            ? null
            : new Date().toISOString(),
        submissionType: status === "submitted" ? "manual" : null
    };

    const submissions = content.submissions
        .map(normalizeSubmission)
        .filter((item) =>
            !(item.assignmentId === assignment.id &&
              item.studentId === DEMO_STUDENT_ID)
        );

    if (files.length > 0) {
        submissions.push(submission);
    }

    const saved = writeCourseContent(courseId, {
        ...content,
        submissions
    });

    if (!saved) {
        throw new Error(
            "Browser storage is full. Remove a file or choose smaller files."
        );
    }

    return files.length > 0 ? submission : null;
}

// Remove a saved review draft when its final file is removed.
function removeStudentSubmission(assignmentId) {
    const content = readCourseContent(courseId);
    const submissions = content.submissions
        .map(normalizeSubmission)
        .filter((item) =>
            !(item.assignmentId === assignmentId &&
              item.studentId === DEMO_STUDENT_ID &&
              item.status === "under-review")
        );

    return writeCourseContent(courseId, {
        ...content,
        submissions
    });
}

// Display an error and return link if the selected course is unavailable.
function showMessage(message) {
    pageMessage.replaceChildren();

    const messageText = document.createTextNode(`${message} `);
    const returnLink = document.createElement("a");
    returnLink.href = "student_courses.html";
    returnLink.textContent = "Return to Courses";

    pageMessage.append(messageText, returnLink);
    pageMessage.hidden = false;
    courseContent.hidden = true;
}

function getInitials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
}

// Render course overview and preserve the existing attendance display.
function renderOverview(selectedCourse) {
    document.title = `LearnSpace | ${selectedCourse.title}`;
    document.querySelector("#courseTitle").textContent = selectedCourse.title;
    document.querySelector("#courseIcon").textContent =
        selectedCourse.icon || "✳";

    const cover = document.querySelector("#courseCover");
    const imageUrl = selectedCourse.image || selectedCourse.coverUrl || "";

    if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = `${selectedCourse.title} course cover`;
        cover.replaceChildren(image);
        cover.classList.add("has-image");
        cover.removeAttribute("aria-hidden");
    }

    const instructorName =
        selectedCourse.instructor?.name || "Instructor not listed";
    document.querySelector("#instructorName").textContent = instructorName;

    const instructorPhoto = document.querySelector("#instructorPhoto");
    const instructorInitials = document.querySelector("#instructorInitials");

    if (selectedCourse.instructor?.photo) {
        instructorPhoto.src = selectedCourse.instructor.photo;
        instructorPhoto.alt = `${instructorName}, instructor`;
        instructorPhoto.hidden = false;
        instructorInitials.hidden = true;
    } else {
        instructorInitials.textContent = getInitials(instructorName);
        instructorPhoto.hidden = true;
        instructorInitials.hidden = false;
    }

    renderAttendance(selectedCourse);
}

// Existing attendance calculations are intentionally unchanged.
function renderAttendance(selectedCourse) {
    const records = (selectedCourse.attendance || []).filter((record) =>
        record.studentId === DEMO_STUDENT_ID &&
        record.courseId === selectedCourse.id
    );

    const total = records.length;
    const attended = records.filter((record) =>
        ["present", "late"].includes((record.status || "").toLowerCase())
    ).length;
    const missed = records.filter((record) =>
        (record.status || "").toLowerCase() === "absent"
    ).length;
    const percentage = total === 0
        ? 0
        : Math.round((attended / total) * 100);

    const circumference = 2 * Math.PI * 49;
    const ring = document.querySelector("#ringValue");

    document.querySelector("#attendedCount").textContent = attended;
    document.querySelector("#classCount").textContent = total;
    document.querySelector("#attendancePercent").textContent =
        `${percentage}%`;
    document.querySelector("#attendanceRing").setAttribute(
        "aria-label",
        `Attendance ${percentage} percent`
    );

    ring.style.strokeDasharray = circumference.toFixed(3);
    ring.style.strokeDashoffset =
        (circumference * (1 - percentage / 100)).toFixed(3);

    document.querySelector("#attendanceDetail").textContent = total
        ? `${missed} ${missed === 1 ? "class missed" : "classes missed"} · Late counts as attended`
        : "No classes have been recorded yet.";

    const thresholdMessage = total
        ? (percentage >= ATTENDANCE_THRESHOLD ? "Above" : "Below") +
          ` the example ${ATTENDANCE_THRESHOLD}% threshold`
        : `Example threshold: ${ATTENDANCE_THRESHOLD}%`;

    document.querySelector("#attendanceThreshold").textContent =
        `${thresholdMessage} · Example only`;
}

function fileIconType(type) {
    const normalized = (type || "").toLowerCase();

    if (normalized.includes("note") || normalized.includes("pdf")) return "notes";
    if (normalized.includes("presentation")) return "presentation";
    if (normalized.includes("assignment") ||
        normalized.includes("worksheet")) return "assignment";
    if (normalized.includes("book")) return "book";

    return "other";
}

function createFileIcon(type) {
    const icon = document.createElement("span");
    icon.className = `file-icon ${fileIconType(type)}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent =
        (type || "").toLowerCase().includes("presentation") ? "PPT" : "PDF";
    return icon;
}

function createEmptyState(text) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = text;
    return empty;
}

function isValidPdfDataUrl(value) {
    return typeof value === "string" &&
        /^data:application\/pdf;base64,/i.test(value);
}

function getExternalResourceUrl(value) {
    if (!value || /placeholder|replace_me|your_form/i.test(value)) {
        return "";
    }

    try {
        const parsed = new URL(value);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            return parsed.href;
        }
    } catch {
        return "";
    }

    return "";
}

// Render teacher-uploaded materials.
function renderResources(selectedCourse) {
    const list = document.querySelector("#resourceList");
    list.replaceChildren();

    const resources = selectedCourse.resources || [];

    if (!resources.length) {
        list.append(
            createEmptyState("No books or notes have been added for this course yet.")
        );
        return;
    }

    resources.forEach((resource) => {
        const card = document.createElement("article");
        card.className = "resource-card";
        card.append(createFileIcon(resource.type));

        const copy = document.createElement("div");
        copy.className = "resource-copy";

        const title = document.createElement("h3");
        title.textContent = resource.title || "Untitled material";

        const info = document.createElement("p");
        info.textContent =
            `${resource.type || "Material"} · ${resource.filename || "File not specified"}`;

        copy.append(title, info);

        const action = document.createElement("a");
        action.className = "card-action";
        action.target = "_blank";
        action.rel = "noopener noreferrer";

        if (isValidPdfDataUrl(resource.fileData)) {
            action.href = resource.fileData;
            action.textContent = "View PDF";
        } else {
            const externalUrl = getExternalResourceUrl(resource.url);

            if (externalUrl) {
                action.href = externalUrl;
                action.textContent = "View resource";
            } else {
                action.removeAttribute("href");
                action.setAttribute("aria-disabled", "true");
                action.textContent = "Unavailable";
                action.title = "This material has no saved PDF or valid link.";
            }
        }

        card.append(copy, action);
        list.append(card);
    });
}

// Render published assignments and their current student submission status.
function renderAssignments(selectedCourse) {
    const list = document.querySelector("#assignmentList");
    list.replaceChildren();

    const assignments = selectedCourse.assignments || [];

    if (!assignments.length) {
        list.append(
            createEmptyState("There are no published assignments for this course yet.")
        );
        return;
    }

    assignments.forEach((assignment) => {
        const card = document.createElement("article");
        card.className = "assignment-card";
        card.append(createFileIcon("Assignment"));

        const copy = document.createElement("div");
        copy.className = "assignment-copy";

        const title = document.createElement("h3");
        title.textContent = assignment.title || "Untitled assignment";

        const description = document.createElement("p");
        description.textContent = assignment.description || "";

        const footer = document.createElement("div");
        footer.className = "assignment-footer";

        const meta = document.createElement("div");
        meta.className = "assignment-meta";
        meta.append(document.createTextNode(
            `Due ${assignment.due || "Date not set"}`
        ));

        if (assignment.marks !== undefined && assignment.marks !== null) {
            meta.append(document.createTextNode(`${assignment.marks} marks`));
        }

        const status = document.createElement("span");
        status.className =
            `status-pill ${(assignment.status || "Available").toLowerCase().replace(/\s+/g, "-")}`;
        status.textContent = assignment.status || "Available";
        meta.append(status);

        const viewButton = document.createElement("button");
        viewButton.className = "card-action";
        viewButton.type = "button";
        viewButton.textContent = "View assignment";
        viewButton.addEventListener("click", () => openAssignment(assignment));

        footer.append(meta, viewButton);
        copy.append(title, description, footer);
        card.append(copy);
        list.append(card);
    });
}

// Render published quizzes; a missing form URL remains clearly unavailable.
function renderQuizzes(selectedCourse) {
    const list = document.querySelector("#quizList");
    list.replaceChildren();

    const quizzes = selectedCourse.quizzes || [];

    if (!quizzes.length) {
        list.append(
            createEmptyState("There are no published quizzes for this course yet.")
        );
        return;
    }

    quizzes.forEach((quiz) => {
        const card = document.createElement("article");
        card.className = "quiz-card";

        const copy = document.createElement("div");
        copy.className = "quiz-copy";

        const title = document.createElement("h3");
        title.textContent = quiz.title || "Untitled quiz";

        const description = document.createElement("p");
        description.textContent = quiz.description || "";

        const instructions = document.createElement("p");
        instructions.textContent = quiz.instructions || "";

        const meta = document.createElement("div");
        meta.className = "quiz-meta";

        if (quiz.questions) {
            meta.append(document.createTextNode(`${quiz.questions} questions`));
        }
        if (quiz.timeLimit) {
            meta.append(document.createTextNode(quiz.timeLimit));
        }
        if (quiz.due) {
            meta.append(document.createTextNode(`Due ${quiz.due}`));
        }

        copy.append(title, description, instructions, meta);

        const actionWrap = document.createElement("div");
        actionWrap.className = "quiz-action-wrap";

        const start = document.createElement("button");
        start.className = "primary-button";
        start.type = "button";
        start.textContent = "Start Quiz";

        const feedback = document.createElement("span");
        feedback.className = "quiz-feedback";
        feedback.setAttribute("role", "status");

        if (!isConfiguredFormUrl(quiz.formUrl)) {
            start.addEventListener("click", () => {
                feedback.textContent =
                    "Google Forms link has not been configured.";
            });
        } else {
            start.addEventListener("click", () => {
                window.open(quiz.formUrl, "_blank", "noopener,noreferrer");
            });
        }

        actionWrap.append(start, feedback);
        card.append(copy, actionWrap);
        list.append(card);
    });
}

function isConfiguredFormUrl(url) {
    if (!url || /placeholder|replace_me|your_form/i.test(url)) {
        return false;
    }

    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" &&
            (parsed.hostname === "forms.gle" ||
             parsed.hostname === "docs.google.com");
    } catch {
        return false;
    }
}

function formatFileSize(size) {
    if (!Number.isFinite(size) || size < 0) return "Size unavailable";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getSubmissionStatusText(submission, assignment) {
    if (submission?.status === "under-review") {
        return "Saved for review. Only you can see these files.";
    }
    if (submission?.status === "submitted") {
        return "Submitted. Your files are locked and visible to the teacher.";
    }
    if (submission?.status === "auto-submitted") {
        return "Automatically submitted after the deadline. Your files are locked.";
    }
    if (isDeadlinePassed(assignment)) {
        return "The deadline has passed. No new files can be added.";
    }
    return "Add files, then save them for review or submit them.";
}

// Show selected or saved files and provide removal controls only while editable.
function renderSubmissionFileList() {
    const list = document.querySelector("#submissionFileList");
    list.replaceChildren();

    if (!selectedSubmissionFiles.length) {
        const empty = document.createElement("p");
        empty.className = "submission-file-empty";
        empty.textContent = "No files added yet.";
        list.append(empty);
        return;
    }

    const submissionStatus = activeAssignment?.submission?.status;
    const canRemove = submissionStatus !== "submitted" &&
        submissionStatus !== "auto-submitted" &&
        !isDeadlinePassed(activeAssignment);

    selectedSubmissionFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "submission-file-item";

        const copy = document.createElement("div");
        copy.className = "submission-file-copy";

        const name = document.createElement("span");
        name.className = "submission-file-name";
        name.textContent = file.fileName;

        const size = document.createElement("span");
        size.className = "submission-file-size";
        size.textContent = formatFileSize(file.fileSize);

        copy.append(name, size);
        row.append(copy);

        if (canRemove) {
            const remove = document.createElement("button");
            remove.className = "remove-submission-file";
            remove.type = "button";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", `Remove ${file.fileName}`);
            remove.addEventListener("click", () => removeSubmissionFile(index));
            row.append(remove);
        }

        list.append(row);
    });
}

// Update the dialog's file controls and status from the current state.
function renderSubmissionControls() {
    const fileInput = document.querySelector("#submissionFile");
    const reviewButton = document.querySelector("#markForReview");
    const completeButton = document.querySelector("#demoSubmit");
    const status = document.querySelector("#submissionStatus");
    // const message = document.querySelector("#submissionMessage");

    const submission = activeAssignment?.submission || null;
    const deadlinePassed = isDeadlinePassed(activeAssignment);
    const locked = deadlinePassed ||
        submission?.status === "submitted" ||
        submission?.status === "auto-submitted";

    fileInput.disabled = locked;
    reviewButton.disabled = locked;
    completeButton.disabled = locked;

    status.className = "submission-status";
    if (submission?.status === "under-review") {
        status.classList.add("is-pending");
    } else if (submission?.status === "submitted") {
        status.classList.add("is-submitted");
    } else if (submission?.status === "auto-submitted") {
        status.classList.add("is-auto-submitted");
    } else if (deadlinePassed) {
        status.classList.add("is-error");
    }

    status.textContent = getSubmissionStatusText(submission, activeAssignment);
    // message.textContent = deadlinePassed && !submission
    //     ? "The submission period is closed."
    //     : "";

    reviewButton.textContent = submission?.status === "under-review"
        ? "Update Review Files"
        : "Mark for Review";

    completeButton.textContent = "Mark as Complete Submission";

    renderSubmissionFileList();
}

// Refresh submission status without discarding files that are still being staged.
function refreshSubmissionState({ preserveSelectedFiles = false } = {}) {
    if (!activeCourse || !courseId) return;

    // Keep the current in-progress file list before reading localStorage.
    const stagedFiles = preserveSelectedFiles
        ? selectedSubmissionFiles.map((file) => ({ ...file }))
        : null;

    const content = readCourseContent(courseId);
    const assignmentList = activeCourse.teacherManaged
        ? content.assignments
        : (activeCourse.assignments || []);

    const updatedContent = processAutomaticSubmissions(
        courseId,
        assignmentList,
        content
    );

    activeCourse.assignments = activeCourse.teacherManaged
        ? mapTeacherAssignments(
            updatedContent.assignments,
            updatedContent.submissions
        )
        : (activeCourse.assignments || []).map((assignment) => ({
            ...assignment,
            submission: findStudentSubmission(
                updatedContent.submissions,
                assignment.id
            )
        }));

    renderAssignments(activeCourse);

    if (assignmentDialog.open && activeAssignment) {
        activeAssignment = activeCourse.assignments.find(
            (item) => item.id === activeAssignment.id
        ) || activeAssignment;

        const savedStatus = activeAssignment.submission?.status;
        const submissionIsFinal =
            savedStatus === "submitted" ||
            savedStatus === "auto-submitted";

        // Keep staged files while the student can still edit.
        // Reload saved files when submission is locked or the deadline has passed.
        if (
            preserveSelectedFiles &&
            !submissionIsFinal &&
            !isDeadlinePassed(activeAssignment)
        ) {
            selectedSubmissionFiles = stagedFiles || [];
        } else {
            selectedSubmissionFiles =
                activeAssignment.submission?.files?.map((file) => ({ ...file })) || [];
        }

        renderSubmissionControls();
    }
}

// Remove a selected file. Saved review drafts are updated immediately.
function removeSubmissionFile(index) {
    if (!activeAssignment || isDeadlinePassed(activeAssignment)) {
        refreshSubmissionState();
        return;
    }

    const status = activeAssignment.submission?.status;
    if (status === "submitted" || status === "auto-submitted") {
        return;
    }

    selectedSubmissionFiles.splice(index, 1);

    if (status === "under-review") {
        try {
            const saved = selectedSubmissionFiles.length
                ? saveStudentSubmission(
                    activeAssignment,
                    selectedSubmissionFiles,
                    "under-review"
                )
                : (removeStudentSubmission(activeAssignment.id), null);

            activeAssignment.submission = saved;
            activeAssignment.status = saved ? "Under review" : "Available";
        } catch (error) {
            document.querySelector("#submissionMessage").textContent =
                error.message;
        }
    }

    renderSubmissionControls();
}

// Add selected files to the list, validating type and storage limits.
async function addSelectedFiles(fileList) {
    if (!activeAssignment) return;

    refreshSubmissionState({ preserveSelectedFiles: true });

    if (isDeadlinePassed(activeAssignment) ||
        ["submitted", "auto-submitted"].includes(
            activeAssignment.submission?.status
        )) {
        renderSubmissionControls();
        return;
    }

    const files = Array.from(fileList || []);
    if (!files.length) return;

    const allowedExtensions =
        /\.(pdf|doc|docx|ppt|pptx|jpe?g|png|gif|webp)$/i;
    const currentSize = selectedSubmissionFiles.reduce(
        (total, file) => total + (Number(file.fileSize) || 0),
        0
    );

    let totalSize = currentSize;
    const addedFiles = [];
    const errors = [];

    for (const file of files) {
        if (!allowedExtensions.test(file.name)) {
            errors.push(`${file.name}: unsupported file type`);
            continue;
        }

        if (file.size > MAX_FILE_SIZE) {
            errors.push(`${file.name}: larger than 2 MB`);
            continue;
        }

        if (totalSize + file.size > MAX_SUBMISSION_SIZE) {
            errors.push("Combined submission size cannot exceed 2 MB");
            break;
        }

        try {
            const fileData = await readFileAsDataURL(file);

            addedFiles.push({
                id: crypto.randomUUID(),
                fileName: file.name,
                fileType: file.type || "application/octet-stream",
                fileSize: file.size,
                fileData
            });

            totalSize += file.size;
        } catch (error) {
            console.error("Could not read selected file:", error);
            errors.push(`${file.name}: could not read file`);
        }
    }

    selectedSubmissionFiles.push(...addedFiles);

    // If the student already saved a review draft, persist additions immediately.
    if (activeAssignment.submission?.status === "under-review" &&
        addedFiles.length > 0) {
        try {
            activeAssignment.submission = saveStudentSubmission(
                activeAssignment,
                selectedSubmissionFiles,
                "under-review"
            );
        } catch (error) {
            errors.push(error.message);
        }
    }

    renderSubmissionControls();

    document.querySelector("#submissionMessage").textContent =
        errors.length
            ? errors.join(". ")
            : addedFiles.length
                ? `${addedFiles.length} file${addedFiles.length === 1 ? "" : "s"} added.`
                : "No files were added.";
}

// Save the current file list as a private review draft.
function markSubmissionForReview() {
    if (!activeAssignment) return;

    refreshSubmissionState({ preserveSelectedFiles: true });

    if (isDeadlinePassed(activeAssignment)) {
        renderSubmissionControls();
        return;
    }

    const currentStatus = activeAssignment.submission?.status;
    if (currentStatus === "submitted" || currentStatus === "auto-submitted") {
        renderSubmissionControls();
        return;
    }

    if (!selectedSubmissionFiles.length) {
        if (currentStatus === "under-review") {
            const removed = removeStudentSubmission(activeAssignment.id);
            if (removed) {
                activeAssignment.submission = null;
                activeAssignment.status = "Available";
                document.querySelector("#submissionMessage").textContent =
                    "The empty review draft was removed.";
            } else {
                document.querySelector("#submissionMessage").textContent =
                    "Could not update the saved draft. Browser storage may be full.";
            }
        } else {
            document.querySelector("#submissionMessage").textContent =
                "Add at least one file before saving for review.";
        }

        renderSubmissionControls();
        return;
    }

    try {
        activeAssignment.submission = saveStudentSubmission(
            activeAssignment,
            selectedSubmissionFiles,
            "under-review"
        );
        activeAssignment.status = "Under review";
        document.querySelector("#submissionMessage").textContent =
            "Saved for review. The teacher cannot see these files yet.";
        renderAssignments(activeCourse);
        renderSubmissionControls();
    } catch (error) {
        document.querySelector("#submissionMessage").textContent =
            error.message;
    }
}

// Submit all current files manually, or respect automatic submission at deadline.
function markSubmissionComplete() {
    if (!activeAssignment) return;

    refreshSubmissionState({ preserveSelectedFiles: true });

    const status = activeAssignment.submission?.status;
    if (status === "submitted" || status === "auto-submitted") {
        renderSubmissionControls();
        return;
    }

    if (isDeadlinePassed(activeAssignment)) {
        renderSubmissionControls();
        return;
    }

    if (!selectedSubmissionFiles.length) {
        document.querySelector("#submissionMessage").textContent =
            "Add at least one file before submitting.";
        return;
    }

    try {
        activeAssignment.submission = saveStudentSubmission(
            activeAssignment,
            selectedSubmissionFiles,
            "submitted"
        );
        activeAssignment.status = "Submitted";
        document.querySelector("#submissionMessage").textContent =
            "Assignment submitted. Your files are now visible to the teacher.";

        renderAssignments(activeCourse);
        renderSubmissionControls();
    } catch (error) {
        document.querySelector("#submissionMessage").textContent =
            error.message;
    }
}

// Open the assignment dialog and restore this student's saved files.
function openAssignment(assignment) {
    refreshSubmissionState();

    activeAssignment = activeCourse.assignments.find(
        (item) => item.id === assignment.id
    ) || assignment;

    document.querySelector("#assignmentDialogTitle").textContent =
        activeAssignment.title || "Assignment details";
    document.querySelector("#assignmentDialogDescription").textContent =
        activeAssignment.description || "";

    const meta = document.querySelector("#assignmentDialogMeta");
    meta.replaceChildren();

    [
        `Due: ${activeAssignment.due || "Not set"}`,
        activeAssignment.marks === undefined
            ? ""
            : `Maximum marks: ${activeAssignment.marks}`,
        `Status: ${activeAssignment.status || "Available"}`
    ].filter(Boolean).forEach((value) => {
        const item = document.createElement("span");
        item.className = "status-pill";
        item.textContent = value;
        meta.append(item);
    });

    const references = document.querySelector("#referenceFiles");
    const referenceList = document.querySelector("#referenceFileList");
    referenceList.replaceChildren();

    const referenceFiles = activeAssignment.referenceFiles || [];
    references.hidden = referenceFiles.length === 0;

    referenceFiles.forEach((file) => {
        const line = document.createElement("p");
        line.className = "resource-copy";
        line.textContent = file.filename || "Attached reference";
        referenceList.append(line);
    });

    selectedSubmissionFiles =
        activeAssignment.submission?.files?.map((file) => ({ ...file })) || [];

    const fileInput = document.querySelector("#submissionFile");
    fileInput.value = "";
    fileInput.multiple = true;

    document.querySelector("#submissionMessage").textContent = "";

    renderSubmissionControls();
    assignmentDialog.showModal();
}

// Wire up the file picker and the two submission options.
document.querySelector("#submissionFile").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await addSelectedFiles(files);
});

document.querySelector("#markForReview").addEventListener("click", () => {
    markSubmissionForReview();
});

document.querySelector("#demoSubmit").addEventListener("click", () => {
    markSubmissionComplete();
});

document.querySelector("#closeAssignment").addEventListener("click", () => {
    assignmentDialog.close();
});

// Keep the existing course tabs.
const courseTabs = document.querySelectorAll(".course-tab");
const coursePanels = document.querySelectorAll("[data-course-panel]");

courseTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        courseTabs.forEach((item) => {
            const isSelected = item === tab;
            item.classList.toggle("is-active", isSelected);
            item.setAttribute("aria-selected", String(isSelected));
        });

        coursePanels.forEach((panel) => {
            panel.hidden = panel.dataset.coursePanel !== tab.dataset.panel;
        });
    });
});

// Recheck deadlines when the student returns to or refocuses the page.
function refreshPageSubmissionState() {
    refreshSubmissionState({ preserveSelectedFiles: true });
    scheduleDeadlineCheck();
}

function scheduleDeadlineCheck() {
    if (deadlineTimer) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }

    if (!activeCourse) return;

    const upcomingDeadlines = (activeCourse.assignments || [])
        .map(getDeadlineTimestamp)
        .filter((deadline) => deadline !== null && deadline > Date.now());

    if (!upcomingDeadlines.length) return;

    const nextDeadline = Math.min(...upcomingDeadlines);
    const delay = Math.min(
        Math.max(nextDeadline - Date.now() + 50, 0),
        2147483647
    );

    deadlineTimer = window.setTimeout(() => {
        refreshSubmissionState();
        scheduleDeadlineCheck();
    }, delay);
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        refreshPageSubmissionState();
    }
});

window.addEventListener("focus", refreshPageSubmissionState);

// Load the course, run its initial deadline check, and render its sections.
if (!courseId) {
    showMessage("No course was selected.");
} else if (!activeCourse) {
    showMessage("That course could not be found.");
} else {
    courseContent.hidden = false;
    renderOverview(activeCourse);
    renderResources(activeCourse);
    renderAssignments(activeCourse);
    renderQuizzes(activeCourse);
    scheduleDeadlineCheck();
}