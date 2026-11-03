"use strict";

const TEACHER_COURSES_KEY = "learnspaceCourses";
const LEGACY_DEMO_STUDENT_ID = "demo-student";
const STUDENT_ACCESS_STORAGE_KEYS = new Set([
    "learnspaceSession",
    "learnspaceUsers",
    "learnspaceStudents",
    "learnspaceCurriculumCourses",
    "learnspaceSemesters"
]);
// const sampleCourses = Array.isArray(window.courseCatalog)
//     ? window.courseCatalog
//     : [];

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");
let courses = [];
let coursesLoaded = false;
let studentAccessGranted = false;
let currentAccessDenialCode = "";
let verifiedUserId = null;
let verifiedStudentId = null;
let identityEstablished = false;

function evaluateStudentAccess() {
    try {
        const evaluator = window.LearnSpaceStudentAccess;
        if (!evaluator || typeof evaluator.evaluateStudentAccess !== "function") {
            return { allowed: false, code: "evaluator_unavailable" };
        }

        const result = evaluator.evaluateStudentAccess();
        if (!result || typeof result !== "object" || Array.isArray(result)) {
            return { allowed: false, code: "invalid_evaluation" };
        }

        if (result.allowed === true &&
            result.code === "access_granted" &&
            typeof result.userId === "string" && result.userId.trim() !== "" &&
            typeof result.studentId === "string" &&
            result.studentId.trim() !== "" &&
            result.studentId.trim() !== LEGACY_DEMO_STUDENT_ID &&
            typeof result.semesterId === "string" && result.semesterId.trim() !== "") {
            return result;
        }

        if (result.allowed === false) return result;
        return { allowed: false, code: "invalid_evaluation" };
    } catch (error) {
        return { allowed: false, code: "evaluation_failed" };
    }
}

function showAccessDenied(result) {
    studentAccessGranted = false;
    coursesLoaded = false;
    courses = [];

    if (currentAccessDenialCode === result.code && courseGrid.childElementCount === 1) {
        return;
    }

    currentAccessDenialCode = result.code || "access_denied";
    courseGrid.replaceChildren();
    courseCount.textContent = "Courses unavailable";

    const message = document.createElement("p");
    message.className = "courses-access-message";
    message.setAttribute("role", "status");
    message.textContent = "Course access is not currently available. Please sign in again or contact an administrator.";
    courseGrid.append(message);
}

function refreshStudentAccess({ initialLoad = false } = {}) {
    const result = evaluateStudentAccess();
    if (!result.allowed) {
        showAccessDenied(result);
        return false;
    }

    // A page that began without a verified identity must be reloaded to
    // establish one. Later lifecycle events must never adopt a new session.
    if (!identityEstablished) {
        if (!initialLoad) {
            showAccessDenied({ code: "identity_not_established" });
            return false;
        }
        verifiedUserId = result.userId;
        verifiedStudentId = result.studentId;
        identityEstablished = true;
    } else if (result.userId !== verifiedUserId ||
        result.studentId !== verifiedStudentId) {
        showAccessDenied({ code: "identity_changed" });
        return false;
    }

    const wasGranted = studentAccessGranted;
    currentAccessDenialCode = "";
    if (!wasGranted || !coursesLoaded) {
        studentAccessGranted = true;
        courses = loadTeacherCourses();
        coursesLoaded = true;
        renderCourses();
    }

    return true;
}

function loadTeacherCourses() {
    try {
        const savedData = localStorage.getItem(TEACHER_COURSES_KEY);

        if (savedData === null) {
            return [];
        }

        const parsedCourses = JSON.parse(savedData);

        if (!Array.isArray(parsedCourses)) {
            return [];
        }

        return parsedCourses
            .filter((course) => course && course.id)
            .map((course) => ({
                id: String(course.id),
                title: course.name || course.title || "Untitled course",
                description: course.description || "",
                icon: course.icon || "✳",
                coverUrl: course.coverUrl || course.coverImage || course.image || ""
            }));
    } catch (error) {
        console.error("Could not load teacher courses:", error);
        return [];
    }
}

// Use teacher courses as the only source when available.
// Otherwise, show the existing sample catalog as a fallback.
// const courses = teacherCourses.length > 0
//     ? teacherCourses
//     : sampleCourses;

function renderCourses() {
    courseGrid.replaceChildren();

    if (courses.length === 0) {
        // const emptyMessage = document.createElement("p");
        // emptyMessage.textContent = "No courses are available yet.";
        // courseGrid.append(emptyMessage);
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "courses-empty-state";
        emptyMessage.textContent =
            "No courses have been added yet. Courses will appear here once a teacher adds them.";
        courseGrid.append(emptyMessage);
    }

    courses.forEach((course, index) => {
        const card = document.createElement("article");
        card.className = "course-card";

        const top = document.createElement("div");
        top.className = "course-topline";

        const number = document.createElement("span");
        number.className = "course-number";
        number.textContent = `COURSE ${String(index + 1).padStart(2, "0")}`;
        top.append(number);
        card.append(top);

        if (course.coverUrl) {
            card.classList.add("has-cover");

            const image = document.createElement("img");
            image.className = "cover-thumb";
            image.src = course.coverUrl;
            image.alt = `${course.title} cover`;
            card.append(image);
        } else {
            const icon = document.createElement("span");
            icon.className = "course-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = course.icon || "✳";
            card.append(icon);
        }

        const title = document.createElement("h3");
        title.textContent = course.title;

        const description = document.createElement("p");
        description.textContent = course.description || "";

        const open = document.createElement("button");
        open.className = "course-open";
        open.type = "button";
        open.setAttribute("aria-label", `Open ${course.title}`);

        const openText = document.createElement("span");
        openText.textContent = "Open course";

        const arrow = document.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";

        open.append(openText, arrow);

        open.addEventListener("click", () => {
            if (!refreshStudentAccess()) return;

            window.location.href =
                `course_details.html?course=${encodeURIComponent(course.id)}`;
        });

        card.append(title, description, open);
        courseGrid.append(card);
    });

    courseCount.textContent =
        `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;
}

refreshStudentAccess({ initialLoad: true });

function isStudentAccessStorageChange(event) {
    return event.key === null || STUDENT_ACCESS_STORAGE_KEYS.has(event.key);
}

function handleStudentAccessLifecycleChange() {
    refreshStudentAccess();
}

window.addEventListener("storage", (event) => {
    if (isStudentAccessStorageChange(event)) {
        handleStudentAccessLifecycleChange();
    }
});

window.addEventListener("pageshow", handleStudentAccessLifecycleChange);

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) handleStudentAccessLifecycleChange();
});

window.addEventListener("focus", handleStudentAccessLifecycleChange);
