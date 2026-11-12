//STUDENT COURSES
"use strict";

// These keys match the teacher pages' localStorage structure.
const COURSE_STORAGE_KEY = "learnspaceCourses";
const CONTENT_STORAGE_PREFIX = "learnspaceContent_";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_SUBMISSION_SIZE = 2 * 1024 * 1024;

const LEGACY_DEMO_STUDENT_ID = "demo-student";
const STUDENT_ACCESS_STORAGE_KEYS = new Set([
    "learnspaceSession",
    "learnspaceUsers",
    "learnspaceStudents",
    "learnspaceTeachers",
    "learnspaceCurriculumCourses",
    "learnspaceSemesters",
    COURSE_STORAGE_KEY
]);
// const ATTENDANCE_THRESHOLD = 75; // Example only; not an official rule.

const courseId = new URLSearchParams(window.location.search).get("course");
// const sampleCourses = Array.isArray(window.courseCatalog)
//     ? window.courseCatalog
//     : [];

const courseContent = document.querySelector("#courseContent");
const pageMessage = document.querySelector("#pageMessage");
const assignmentDialog = document.querySelector("#assignmentDialog");

let activeAssignment = null;
let activeCourse = null;
let selectedSubmissionFiles = [];
let deadlineTimer = null;
let studentAccessGranted = false;
let studentAccessEpoch = 0;
let courseContentInvalid = false;
let duplicateSubmissionRecordsDetected = false;
let courseContentStale = false;
let verifiedStudentId = null;
const courseContentSnapshots = new WeakMap();

// Keep the verified identity returned by the evaluator with each operation.
function getVerifiedStudentAccess() {
    try {
        const evaluator = window.LearnSpaceStudentAccess;
        if (!evaluator ||
            typeof evaluator.evaluateStudentAccess !== "function") {
            return null;
        }

        const result = evaluator.evaluateStudentAccess();
        if (
            result &&
            typeof result === "object" &&
            !Array.isArray(result) &&
            result.allowed === true &&
            result.code === "access_granted" &&
            typeof result.userId === "string" &&
            result.userId.trim() !== "" &&
            typeof result.studentId === "string" &&
            result.studentId.trim() !== "" &&
            result.studentId.trim() !== LEGACY_DEMO_STUDENT_ID &&
            typeof result.semesterId === "string" &&
            result.semesterId.trim() !== ""
        ) {
            return {
                userId: result.userId,
                studentId: result.studentId,
                semesterId: result.semesterId
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

function ensureStudentAccess(expectedStudentId = verifiedStudentId) {
    const currentAccess = getVerifiedStudentAccess();
    if (currentAccess &&
        verifiedStudentId &&
        expectedStudentId === verifiedStudentId &&
        currentAccess.studentId === verifiedStudentId) {
        if (courseId) {
            const eligibility = readCurrentEligibleOffering();
            if (!eligibility.success) {
                clearIneligibleCourse(
                    eligibility.message ||
                    "This course is not available for your active semester."
                );
                return null;
            }
        }
        studentAccessGranted = true;
        return currentAccess;
    }

    if (studentAccessGranted) studentAccessEpoch += 1;
    studentAccessGranted = false;
    if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }
    if (assignmentDialog.open) {
        assignmentDialog.close();
    }
    activeAssignment = null;
    selectedSubmissionFiles = [];
    activeCourse = null;
    showMessage("Your access to this course could not be verified.");
    return null;
}

function readCurrentEligibleOffering() {
    const resolver = window.LearnSpaceStudentOfferings;
    if (!resolver || typeof resolver.readEligibleOfferings !== "function") {
        return { success: false, message: "Course eligibility validation is unavailable." };
    }
    try {
        const snapshot = resolver.readEligibleOfferings();
        if (!snapshot.success) return snapshot;
        const offering = snapshot.offerings.find((item) => item.id === courseId);
        return offering
            ? { success: true, offering, access: snapshot.access }
            : { success: false, message: "This course is not available for your active semester." };
    } catch (error) {
        return { success: false, message: "Course eligibility could not be verified." };
    }
}

function clearIneligibleCourse(message) {
    studentAccessGranted = false;
    activeCourse = null;
    activeAssignment = null;
    selectedSubmissionFiles = [];
    if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }
    if (assignmentDialog.open) assignmentDialog.close();
    showMessage(message);
}

const COURSE_CONTENT_ARRAY_FIELDS = [
    "materials",
    "assignments",
    "quizzes",
    "submissions"
];

function isValidSubmissionFile(file) {
    return Boolean(file) && typeof file === "object" && !Array.isArray(file) &&
        typeof file.id === "string" && file.id.trim() !== "" &&
        (file.fileName === undefined || typeof file.fileName === "string") &&
        (file.fileType === undefined || typeof file.fileType === "string") &&
        (file.fileData === undefined || typeof file.fileData === "string") &&
        (file.fileSize === undefined ||
            (Number.isFinite(file.fileSize) && file.fileSize >= 0));
}

function isValidSubmissionRecord(submission) {
    if (!submission || typeof submission !== "object" || Array.isArray(submission) ||
        typeof submission.assignmentId !== "string" || !submission.assignmentId.trim() ||
        typeof submission.studentId !== "string" || !submission.studentId.trim()) {
        return false;
    }

    if (Object.prototype.hasOwnProperty.call(submission, "id") &&
        (typeof submission.id !== "string" || !submission.id.trim())) return false;
    if (Object.prototype.hasOwnProperty.call(submission, "status") &&
        typeof submission.status !== "string") return false;
    if (Object.prototype.hasOwnProperty.call(submission, "courseId") &&
        (typeof submission.courseId !== "string" || !submission.courseId.trim() ||
         submission.courseId !== courseId)) return false;

    if (Object.prototype.hasOwnProperty.call(submission, "files") &&
        (!Array.isArray(submission.files) ||
         !submission.files.every(isValidSubmissionFile))) return false;

    for (const field of ["fileName", "fileType", "fileData"]) {
        if (Object.prototype.hasOwnProperty.call(submission, field) &&
            typeof submission[field] !== "string") return false;
    }
    if (Object.prototype.hasOwnProperty.call(submission, "fileId") &&
        (typeof submission.fileId !== "string" || !submission.fileId.trim())) return false;
    if (Object.prototype.hasOwnProperty.call(submission, "fileSize") &&
        (!Number.isFinite(submission.fileSize) || submission.fileSize < 0)) return false;

    const hasLegacyFileMetadata = ["fileData", "fileName", "fileType", "fileSize", "fileId"]
        .some((field) => Object.prototype.hasOwnProperty.call(submission, field));
    const hasFiles = Array.isArray(submission.files) && submission.files.length > 0;
    if (hasLegacyFileMetadata && !hasFiles &&
        (typeof submission.fileData !== "string" || !submission.fileData.trim())) {
        return false;
    }

    return true;
}

function createEmptyCourseContent() {
    return {
        materials: [],
        assignments: [],
        quizzes: [],
        submissions: []
    };
}

function isValidCourseContent(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return false;
    }

    return COURSE_CONTENT_ARRAY_FIELDS.every((field) => {
        if (!Object.prototype.hasOwnProperty.call(data, field)) return true;
        if (!Array.isArray(data[field])) return false;
        return field === "submissions"
            ? data[field].every(isValidSubmissionRecord)
            : data[field].every((item) =>
                item && typeof item === "object" && !Array.isArray(item)
            );
    });
}

function reportInvalidCourseContent() {
    courseContentInvalid = true;
    activeCourse = null;
    activeAssignment = null;
    selectedSubmissionFiles = [];
    if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }
    if (assignmentDialog.open) {
        assignmentDialog.close();
    }
    showMessage(
        "Course content could not be verified. Please contact your teacher."
    );
}

function normalizeCourseContent(data) {
    return {
        ...data,
        materials: Array.isArray(data.materials) ? data.materials : [],
        assignments: Array.isArray(data.assignments) ? data.assignments : [],
        quizzes: Array.isArray(data.quizzes) ? data.quizzes : [],
        submissions: Array.isArray(data.submissions) ? data.submissions : []
    };
}

// A missing key represents a new, empty offering-content record. Existing
// values must parse and have valid collection shapes before they are used.
function readCourseContent(selectedCourseId) {
    if (!ensureStudentAccess()) return null;
    if (selectedCourseId !== courseId) {
        clearIneligibleCourse("This course is not available for your active semester.");
        return null;
    }

    let rawValue;
    try {
        rawValue = localStorage.getItem(
            `${CONTENT_STORAGE_PREFIX}${selectedCourseId}`
        );
    } catch (error) {
        console.error("Could not load course content:", error);
        reportInvalidCourseContent();
        return null;
    }

    if (rawValue === null) {
        courseContentInvalid = false;
        const emptyContent = createEmptyCourseContent();
        courseContentSnapshots.set(emptyContent, rawValue);
        return emptyContent;
    }

    let data;
    try {
        if (typeof rawValue !== "string") {
            reportInvalidCourseContent();
            return null;
        }
        data = JSON.parse(rawValue);
    } catch (error) {
        console.error("Could not load course content:", error);
        reportInvalidCourseContent();
        return null;
    }

    if (!isValidCourseContent(data)) {
        reportInvalidCourseContent();
        return null;
    }

    courseContentInvalid = false;
    const normalizedContent = normalizeCourseContent(data);
    courseContentSnapshots.set(normalizedContent, rawValue);
    return normalizedContent;
}

// Save the record under its existing course-specific key.
function writeCourseContent(
    selectedCourseId,
    content,
    expectedStudentId,
    expectedRawValue
) {
    if (!ensureStudentAccess(expectedStudentId)) return false;
    if (selectedCourseId !== courseId) {
        clearIneligibleCourse("This course is not available for your active semester.");
        return false;
    }
    courseContentStale = false;

    if (expectedRawValue === undefined) return false;

    if (!isValidCourseContent(content)) {
        reportInvalidCourseContent();
        return false;
    }

    const contentKey = `${CONTENT_STORAGE_PREFIX}${selectedCourseId}`;
    let originalValue;
    try {
        originalValue = localStorage.getItem(contentKey);
    } catch (error) {
        console.error("Could not verify course content before saving:", error);
        reportInvalidCourseContent();
        return false;
    }

    if (originalValue !== null) {
        let existingContent;
        try {
            if (typeof originalValue !== "string") {
                reportInvalidCourseContent();
                return false;
            }
            existingContent = JSON.parse(originalValue);
        } catch (error) {
            console.error("Could not verify course content before saving:", error);
            reportInvalidCourseContent();
            return false;
        }

        if (!isValidCourseContent(existingContent)) {
            reportInvalidCourseContent();
            return false;
        }
    }

    if (originalValue !== expectedRawValue) {
        courseContentStale = true;
        return false;
    }

    try {
        if (!ensureStudentAccess(expectedStudentId) ||
            localStorage.getItem(contentKey) !== expectedRawValue) {
            courseContentStale = true;
            return false;
        }

        const serializedContent = JSON.stringify(content);
        localStorage.setItem(
            contentKey,
            serializedContent
        );
        const verified = localStorage.getItem(contentKey) === serializedContent;
        if (!verified) courseContentStale = true;
        return verified;
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

// Adapt a record for display without assigning it an inferred owner.
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
        id: submission.id,
        courseId: submission.courseId || courseId,
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
    const access = ensureStudentAccess();
    if (!access) return null;

    const latestContent = readCourseContent(selectedCourseId);
    if (!latestContent) return null;
    content = latestContent;

    const ownedRecords = content.submissions.filter((submission) =>
        submission.studentId === access.studentId &&
        isUsableStudentId(submission.studentId)
    );
    const ownedPairs = new Set();
    for (const submission of ownedRecords) {
        const pairKey = `${submission.studentId}\u0000${submission.assignmentId}`;
        if (ownedPairs.has(pairKey)) {
            reportDuplicateSubmissionRecords();
            return null;
        }
        ownedPairs.add(pairKey);
    }

    let changed = false;
    const now = Date.now();
    const assignmentById = new Map(
        (Array.isArray(assignments) ? assignments : [])
            .map((assignment) => [assignment.id, assignment])
    );

    const normalized = content.submissions
        .map((item) => {
            if (item.studentId !== access.studentId ||
                !isUsableStudentId(item.studentId)) {
                return item;
            }

            const submission = normalizeSubmission(item);

            if (JSON.stringify(item) !== JSON.stringify(submission)) {
                changed = true;
            }

            if (submission.status === "under-review" &&
                submission.files.length === 0) {
                changed = true;
                return null;
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

            return submission;
        })
        .filter(Boolean);

    if (changed) {
        const expectedRawValue = courseContentSnapshots.get(content);
        const saved = writeCourseContent(selectedCourseId, {
            ...content,
            submissions: normalized
        }, access.studentId, expectedRawValue);

        if (!saved) {
            return null;
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

function isUsableStudentId(studentId) {
    return typeof studentId === "string" &&
        studentId.trim() !== "" &&
        studentId.trim() !== LEGACY_DEMO_STUDENT_ID;
}

function reportDuplicateSubmissionRecords() {
    duplicateSubmissionRecordsDetected = true;
    const message = "Submission records could not be verified. Please contact your teacher.";
    const submissionMessage = document.querySelector("#submissionMessage");
    if (submissionMessage) submissionMessage.textContent = message;
}

function getOwnedSubmissionMatches(submissions, assignmentId, studentId) {
    if (!isUsableStudentId(studentId)) return [];
    return submissions.filter((item) =>
        item.assignmentId === assignmentId &&
        item.studentId === studentId &&
        (item.courseId === undefined || item.courseId === courseId) &&
        isUsableStudentId(item.studentId)
    );
}

// Find only one exact record owned by the currently verified student.
function findStudentSubmission(submissions, assignmentId) {
    const access = ensureStudentAccess();
    if (!access) return null;
    const matches = getOwnedSubmissionMatches(
        submissions,
        assignmentId,
        access.studentId
    );
    if (matches.length > 1) {
        reportDuplicateSubmissionRecords();
        return null;
    }
    return matches.length === 1 ? normalizeSubmission(matches[0]) : null;
}

// Convert a teacher assignment to the shape used by student cards.
function mapTeacherAssignments(assignments, submissions) {
    return assignments
        .filter((item) => item.published === true)
        .map((item) => {
            const submission = findStudentSubmission(
                submissions,
                item.id
            );

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
    if (!ensureStudentAccess() || !courseId) return null;
    const eligibility = readCurrentEligibleOffering();
    if (!eligibility.success) {
        clearIneligibleCourse(
            eligibility.message || "This course is not available for your active semester."
        );
        return null;
    }
    const teacherCourse = eligibility.offering;

    if (teacherCourse) {
        let content = readCourseContent(courseId);
        if (!content) return null;

        // Run the deadline check when this course page loads.
        content = processAutomaticSubmissions(
            courseId,
            content.assignments,
            content
        );
        if (!content) return null;

        // Preserve matching sample attendance records without changing their data.
        // const matchingSample = sampleCourses.find((item) =>
        //     (item.title || "").trim().toLowerCase() ===
        //     (teacherCourse.name || "").trim().toLowerCase()
        // );

        // const attendance = (matchingSample?.attendance || []).map((record) => ({
        //     ...record,
        //     courseId
        // }));

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
            // attendance,

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
    // const sampleCourse = sampleCourses.find((item) => item.id === courseId);
    // if (!sampleCourse) return null;

    // let content = readCourseContent(courseId);
    // content = processAutomaticSubmissions(
    //     courseId,
    //     sampleCourse.assignments || [],
    //     content
    // );

    // return {
    //     // ...sampleCourse,
    //     teacherManaged: false,
    //     assignments: (sampleCourse.assignments || []).map((assignment) => {
    //         const submission = findStudentSubmission(
    //             content.submissions,
    //             assignment.id
    //         );

    //         let status = assignment.status || "Available";
    //         if (submission?.status === "under-review") status = "Under review";
    //         if (submission?.status === "submitted") status = "Submitted";
    //         if (submission?.status === "auto-submitted") {
    //             status = "Auto-submitted";
    //         }

    //         return null;
    //     })
    // };
    return null;
}

const initialStudentAccess = getVerifiedStudentAccess();
studentAccessGranted = Boolean(initialStudentAccess);
verifiedStudentId = initialStudentAccess?.studentId || null;
if (studentAccessGranted) {
    activeCourse = getSelectedCourse();
}

// Save or replace this student's submission without overwriting other course data.
function saveStudentSubmission(assignment, files, status) {
    const access = ensureStudentAccess();
    if (!access || !assignment || !isUsableStudentId(access.studentId)) return null;

    const content = readCourseContent(courseId);
    if (!content) return null;
    const existingMatches = getOwnedSubmissionMatches(
        content.submissions,
        assignment.id,
        access.studentId
    );
    if (existingMatches.length > 1) {
        reportDuplicateSubmissionRecords();
        throw new Error(
            "Submission records could not be verified. Please contact your teacher."
        );
    }
    const existingRecord = existingMatches[0] || null;
    const existing = existingRecord ? normalizeSubmission(existingRecord) : null;

    const submission = {
        ...existingRecord,
        id: existingRecord?.id || crypto.randomUUID(),
        courseId,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        studentId: access.studentId,
        files,
        status,
        uploadedAt: existing?.uploadedAt || new Date().toISOString(),
        submittedAt: status === "under-review"
            ? null
            : new Date().toISOString(),
        submissionType: status === "submitted" ? "manual" : null
    };

    const submissions = content.submissions.filter((item) =>
        !(item.assignmentId === assignment.id &&
          item.studentId === access.studentId)
    );

    if (files.length > 0) {
        submissions.push(submission);
    }

    const saved = writeCourseContent(courseId, {
        ...content,
        submissions
    }, access.studentId, courseContentSnapshots.get(content));

    if (!saved) {
        if (!studentAccessGranted) return null;
        throw new Error(
            courseContentStale
                ? "Course submissions changed in another tab. Refresh and try again."
                : "Browser storage is full. Remove a file or choose smaller files."
        );
    }

    return files.length > 0 ? submission : null;
}

// Remove a saved review draft when its final file is removed.
function removeStudentSubmission(assignmentId) {
    const access = ensureStudentAccess();
    if (!access || !isUsableStudentId(access.studentId)) return false;

    const content = readCourseContent(courseId);
    if (!content) return false;
    const matches = getOwnedSubmissionMatches(
        content.submissions,
        assignmentId,
        access.studentId
    );
    if (matches.length > 1) {
        reportDuplicateSubmissionRecords();
        return false;
    }
    if (matches.length !== 1 || matches[0].status !== "under-review") {
        return false;
    }
    const submissions = content.submissions.filter((item) =>
        !(item.assignmentId === assignmentId &&
          item.studentId === access.studentId)
    );

    return writeCourseContent(courseId, {
        ...content,
        submissions
    }, access.studentId, courseContentSnapshots.get(content));
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

    let courseDescription = document.querySelector("#courseDescription");
    if (!courseDescription) {
        courseDescription = document.createElement("p");
        courseDescription.id = "courseDescription";
        courseDescription.className = "course-description";
        document.querySelector(".instructor-block").before(courseDescription);
    }
    courseDescription.textContent = selectedCourse.description || "";
    courseDescription.hidden = !selectedCourse.description;

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
// function renderAttendance(selectedCourse) {
//     const records = (selectedCourse.attendance || []).filter((record) =>
//         record.studentId === verifiedStudentId &&
//         record.courseId === selectedCourse.id
//     );

//     const total = records.length;
//     const attended = records.filter((record) =>
//         ["present", "late"].includes((record.status || "").toLowerCase())
//     ).length;
//     const missed = records.filter((record) =>
//         (record.status || "").toLowerCase() === "absent"
//     ).length;
//     const percentage = total === 0
//         ? 0
//         : Math.round((attended / total) * 100);

//     const circumference = 2 * Math.PI * 49;
//     const ring = document.querySelector("#ringValue");

//     document.querySelector("#attendedCount").textContent = attended;
//     document.querySelector("#classCount").textContent = total;
//     document.querySelector("#attendancePercent").textContent =
//         `${percentage}%`;
//     document.querySelector("#attendanceRing").setAttribute(
//         "aria-label",
//         `Attendance ${percentage} percent`
//     );

//     ring.style.strokeDasharray = circumference.toFixed(3);
//     ring.style.strokeDashoffset =
//         (circumference * (1 - percentage / 100)).toFixed(3);

//     document.querySelector("#attendanceDetail").textContent = total
//         ? `${missed} ${missed === 1 ? "class missed" : "classes missed"} · Late counts as attended`
//         : "No classes have been recorded yet.";

//     const thresholdMessage = total
//         ? (percentage >= ATTENDANCE_THRESHOLD ? "Above" : "Below") +
//           ` the example ${ATTENDANCE_THRESHOLD}% threshold`
//         : `Example threshold: ${ATTENDANCE_THRESHOLD}%`;

//     document.querySelector("#attendanceThreshold").textContent =
//         `${thresholdMessage} · Example only`;
// }

function renderAttendance() {
    // document.querySelector("#attendedCount").textContent = "—";
    // document.querySelector("#classCount").textContent = "—";
    // document.querySelector("#attendancePercent").textContent = "—";
    // document.querySelector("#attendanceDetail").textContent =
    //     "Attendance data is not available yet.";
    // document.querySelector("#attendanceThreshold").textContent = "";

    // document.querySelector("#attendanceRing").setAttribute(
    //     "aria-label",
    //     "Attendance data is not available yet"
    // );

    // const ring = document.querySelector("#ringValue");
    // ring.style.strokeDasharray = "0";
    // ring.style.strokeDashoffset = "0";
     const message = document.querySelector("#attendanceUnavailable");

    if (message) {
        message.textContent = "Attendance data is not available yet.";
    }
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

function isValidPdfDataUrl(value) {
    return decodePdfDataUrl(value) !== null;
}

function openPdfInNewTab(dataUrl) {
    if (!ensureStudentAccess()) return;

    const bytes = decodePdfDataUrl(dataUrl);

    if (!bytes) {
        alert("This PDF is missing or invalid. Please contact your teacher.");
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
            action.href = "#";
            action.textContent = "View PDF";
            action.addEventListener("click", (event) => {
                event.preventDefault();
                openPdfInNewTab(resource.fileData);
            });
        } else {
            const externalUrl = getExternalResourceUrl(resource.url);

            if (externalUrl) {
                action.href = externalUrl;
                action.textContent = "View resource";
                action.addEventListener("click", (event) => {
                    event.preventDefault();
                    if (!ensureStudentAccess()) return;
                    window.open(externalUrl, "_blank", "noopener,noreferrer");
                });
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

function canShowQuizResult(quiz) {
    return quiz.resultVisibility === "immediate" ||
        (quiz.resultVisibility === "teacher-release" &&
         quiz.resultsReleased === true);
}

function isQuizAvailableNow(quiz, now = Date.now()) {
    if (!quiz || typeof quiz.startAt !== "string" || !quiz.startAt.trim() ||
        typeof quiz.dueAt !== "string" || !quiz.dueAt.trim()) {
        return false;
    }

    const startAt = Date.parse(quiz.startAt);
    const dueAt = Date.parse(quiz.dueAt);
    return Number.isFinite(startAt) && Number.isFinite(dueAt) &&
        startAt < dueAt && now >= startAt && now <= dueAt;
}

function getLatestPublishedQuiz(quizId) {
    if (!ensureStudentAccess() || !courseId || !quizId) return null;
    const latestContent = readCourseContent(courseId);
    if (!latestContent || !Array.isArray(latestContent.quizzes)) return null;
    return latestContent.quizzes.find((item) =>
        item && item.id === quizId && item.published === true
    ) || null;
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

        const available = isQuizAvailableNow(quiz);
        const configuredUrl = isConfiguredFormUrl(quiz.formUrl);
        start.disabled = !available || !configuredUrl;
        if (!available) {
            feedback.textContent = "This quiz is outside its scheduled availability window.";
        } else if (!configuredUrl) {
            feedback.textContent = "A valid Google Forms link is not available yet.";
        }

        start.addEventListener("click", () => {
            if (!ensureStudentAccess()) return;

            // Re-read the published record immediately before launch so stale
            // rendered dates or URLs cannot bypass current scheduling rules.
            const latestQuiz = getLatestPublishedQuiz(quiz.id);
            if (!latestQuiz || !isQuizAvailableNow(latestQuiz)) {
                start.disabled = true;
                feedback.textContent = "This quiz is outside its scheduled availability window.";
                return;
            }
            if (!isConfiguredFormUrl(latestQuiz.formUrl)) {
                start.disabled = true;
                feedback.textContent = "A valid Google Forms link is not available yet.";
                return;
            }

            window.open(latestQuiz.formUrl.trim(), "_blank", "noopener,noreferrer");
        });

        actionWrap.append(start, feedback);
        card.append(copy, actionWrap);
        list.append(card);
    });
}

function isConfiguredFormUrl(url) {
    if (typeof url !== "string" || !url.trim() ||
        /placeholder|replace_me|your_form/i.test(url)) {
        return false;
    }

    try {
        const parsed = new URL(url.trim());
        return parsed.protocol === "https:" &&
            !parsed.username && !parsed.password &&
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
function refreshSubmissionState({
    preserveSelectedFiles = false,
    expectedStudentId = verifiedStudentId
} = {}) {
    const access = ensureStudentAccess(expectedStudentId);
    if (!access || !activeCourse || !courseId) return false;

    // Keep the current in-progress file list before reading localStorage.
    const stagedFiles = preserveSelectedFiles
        ? selectedSubmissionFiles.map((file) => ({ ...file }))
        : null;

    const content = readCourseContent(courseId);
    if (!content) return false;
    const assignmentList = activeCourse.teacherManaged
        ? content.assignments
        : (activeCourse.assignments || []);

    const updatedContent = processAutomaticSubmissions(
        courseId,
        assignmentList,
        content
    );
    if (!updatedContent || !ensureStudentAccess(access.studentId)) return false;

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

    return true;
}

// Remove a selected file. Saved review drafts are updated immediately.
function removeSubmissionFile(index) {
    if (!ensureStudentAccess()) return;

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

            if (!studentAccessGranted) return;

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
    const operationAccess = ensureStudentAccess();
    if (!operationAccess || !activeAssignment) return;
    const operationStudentId = operationAccess.studentId;
    const operationAccessEpoch = studentAccessEpoch;

    const operationIsCurrent = () =>
        operationAccessEpoch === studentAccessEpoch &&
        Boolean(ensureStudentAccess(operationStudentId));

    if (!refreshSubmissionState({
        preserveSelectedFiles: true,
        expectedStudentId: operationStudentId
    })) return;

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
        if (!operationIsCurrent()) return;

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
            if (!operationIsCurrent()) return;

            addedFiles.push({
                id: crypto.randomUUID(),
                fileName: file.name,
                fileType: file.type || "application/octet-stream",
                fileSize: file.size,
                fileData
            });

            totalSize += file.size;
        } catch (error) {
            if (!operationIsCurrent()) return;
            console.error("Could not read selected file:", error);
            errors.push(`${file.name}: could not read file`);
        }
    }

    if (!operationIsCurrent()) return;
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
            if (!studentAccessGranted) return;
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
    if (!ensureStudentAccess() || !activeAssignment) return;

    if (!refreshSubmissionState({ preserveSelectedFiles: true })) return;

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
            if (!studentAccessGranted) return;
            if (removed) {
                activeAssignment.submission = null;
                activeAssignment.status = "Available";
                document.querySelector("#submissionMessage").textContent =
                    "The empty review draft was removed.";
            } else {
                document.querySelector("#submissionMessage").textContent =
                    courseContentStale
                        ? "Course submissions changed in another tab. Refresh and try again."
                        : "Could not update the saved draft. Browser storage may be full.";
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
        if (!studentAccessGranted) return;
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
    if (!ensureStudentAccess() || !activeAssignment) return;

    if (!refreshSubmissionState({ preserveSelectedFiles: true })) return;

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
        if (!studentAccessGranted) return;
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
    if (!ensureStudentAccess() || !refreshSubmissionState()) return;

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
    if (!ensureStudentAccess()) return;
    assignmentDialog.showModal();
}

if (studentAccessGranted) {
    // Wire up the file picker and the two submission options only after access passes.
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
            if (!ensureStudentAccess()) return;

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
}
// Recheck deadlines when the student returns to or refocuses the page.
function refreshPageSubmissionState() {
    // An initially denied page has no trusted identity to restore. A reload
    // is required so initialization can establish the new student's identity.
    if (!verifiedStudentId) return;

    const wasGranted = studentAccessGranted;
    const access = ensureStudentAccess(verifiedStudentId);
    if (!access) return;

    if (!wasGranted || !activeCourse) {
        activeCourse = getSelectedCourse();
        if (!activeCourse) {
            showMessage(courseContentInvalid
                ? "Course content could not be verified. Please contact your teacher."
                : duplicateSubmissionRecordsDetected
                    ? "Submission records could not be verified. Please contact your teacher."
                    : "That course could not be found.");
            return;
        }

        pageMessage.hidden = true;
        courseContent.hidden = false;
        renderOverview(activeCourse);
        renderResources(activeCourse);
        renderAssignments(activeCourse);
        renderQuizzes(activeCourse);
        scheduleDeadlineCheck();
        return;
    }

    if (refreshSubmissionState({ preserveSelectedFiles: true })) {
        scheduleDeadlineCheck();
    }
}

// Re-resolve the offering and reload its latest content after a relevant
// cross-tab change. Existing submission snapshots still guard every write.
function refreshOpenCoursePage({ preserveSelectedFiles = true } = {}) {
    if (!verifiedStudentId || !ensureStudentAccess(verifiedStudentId)) return;

    const dialogWasOpen = assignmentDialog.open;
    const previousAssignmentId = activeAssignment?.id || null;
    const stagedFiles = preserveSelectedFiles
        ? selectedSubmissionFiles.map((file) => ({ ...file }))
        : [];

    const refreshedCourse = getSelectedCourse();
    if (!refreshedCourse) {
        activeCourse = null;
        activeAssignment = null;
        selectedSubmissionFiles = [];
        if (deadlineTimer !== null) {
            window.clearTimeout(deadlineTimer);
            deadlineTimer = null;
        }
        if (assignmentDialog.open) assignmentDialog.close();
        if (studentAccessGranted) {
            showMessage(courseContentInvalid
                ? "Course content could not be verified. Please contact your teacher."
                : courseContentStale
                    ? "Course content changed before it could be refreshed. Reload this page to continue."
                    : "That course could not be found.");
        }
        return;
    }

    activeCourse = refreshedCourse;
    courseContentStale = false;
    pageMessage.hidden = true;
    courseContent.hidden = false;

    if (dialogWasOpen && previousAssignmentId) {
        activeAssignment = activeCourse.assignments.find(
            (item) => item.id === previousAssignmentId
        ) || null;
        if (!activeAssignment) {
            assignmentDialog.close();
            selectedSubmissionFiles = [];
        } else {
            const submissionIsFinal =
                activeAssignment.submission?.status === "submitted" ||
                activeAssignment.submission?.status === "auto-submitted";
            selectedSubmissionFiles = preserveSelectedFiles &&
                !submissionIsFinal && !isDeadlinePassed(activeAssignment)
                ? stagedFiles
                : activeAssignment.submission?.files?.map((file) => ({ ...file })) || [];
        }
    }

    renderOverview(activeCourse);
    renderResources(activeCourse);
    renderAssignments(activeCourse);
    renderQuizzes(activeCourse);
    if (assignmentDialog.open && activeAssignment) renderSubmissionControls();
    scheduleDeadlineCheck();
}

function scheduleDeadlineCheck() {
    if (deadlineTimer) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }

    if (!ensureStudentAccess() || !activeCourse) return;

    const upcomingDeadlines = (activeCourse.assignments || [])
        .map(getDeadlineTimestamp)
        .filter((deadline) => deadline !== null && deadline > Date.now());

    if (!upcomingDeadlines.length) return;

    const nextDeadline = Math.min(...upcomingDeadlines);
    const delay = Math.min(
        Math.max(nextDeadline - Date.now() + 50, 0),
        2147483647
    );
    const scheduledAccessEpoch = studentAccessEpoch;

    deadlineTimer = window.setTimeout(() => {
        deadlineTimer = null;
        if (scheduledAccessEpoch !== studentAccessEpoch ||
            !ensureStudentAccess(verifiedStudentId)) return;
        if (refreshSubmissionState()) {
            scheduleDeadlineCheck();
        }
    }, delay);
}

function isStudentAccessStorageChange(event) {
    return event.key === null || STUDENT_ACCESS_STORAGE_KEYS.has(event.key);
}

function handleStudentAccessLifecycleChange() {
    refreshPageSubmissionState();
}

window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === COURSE_STORAGE_KEY ||
        (courseId && event.key === `${CONTENT_STORAGE_PREFIX}${courseId}`)) {
        refreshOpenCoursePage({ preserveSelectedFiles: true });
        return;
    }
    if (isStudentAccessStorageChange(event)) {
        handleStudentAccessLifecycleChange();
    }
});

window.addEventListener("pageshow", handleStudentAccessLifecycleChange);
window.addEventListener("focus", handleStudentAccessLifecycleChange);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) handleStudentAccessLifecycleChange();
});
// Load the course, run its initial deadline check, and render its sections.
if (!studentAccessGranted) {
    showMessage("Your access to this course could not be verified.");
} else if (!courseId) {
    showMessage("No course was selected.");
} else if (!activeCourse) {
    showMessage(courseContentInvalid
        ? "Course content could not be verified. Please contact your teacher."
        : duplicateSubmissionRecordsDetected
            ? "Submission records could not be verified. Please contact your teacher."
            : "That course could not be found.");
} else {
    courseContent.hidden = false;
    renderOverview(activeCourse);
    renderResources(activeCourse);
    renderAssignments(activeCourse);
    renderQuizzes(activeCourse);
    scheduleDeadlineCheck();
}
