
const STORAGE_KEY = "learnspaceCourses";
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

function revokeTeacherAccess() {
    teacherAccessRevoked = true;
    if (courseModalBackdrop) courseModalBackdrop.hidden = true;
    if (courseGrid) {
        courseGrid.replaceChildren();
        const message = document.createElement("p");
        message.className = "course-access-denied";
        message.setAttribute("role", "alert");
        message.textContent = "Teacher access is no longer available. Sign in again after your account is active.";
        courseGrid.append(message);
    }
    if (addCourseBtn) addCourseBtn.disabled = true;
}

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");

const addCourseBtn = document.querySelector("#addCourseBtn");
const courseModalBackdrop = document.querySelector("#courseModalBackdrop");
const closeCourseModal = document.querySelector("#closeCourseModal");
const cancelCourseBtn = document.querySelector("#cancelCourseBtn");

const addCourseForm = document.querySelector("#addCourseForm");
const newCourseName = document.querySelector("#newCourseName");
const newInstructorName = document.querySelector("#newInstructorName");
const newCourseDescription = document.querySelector("#newCourseDescription");
const courseFormMessage = document.querySelector("#courseFormMessage");
let courseDataState = "loading";
let courses = null;
let courseStorageRawValue = null;

// Read the original sample courses from HTML on first use.
function getInitialCoursesFromHTML() {
    const cards = courseGrid.querySelectorAll(".teacher-course-card");

    return Array.from(cards).map((card) => ({
        id: crypto.randomUUID(),
        name: card.querySelector("h3").textContent.trim(),
        instructor: "Not specified",
        description: card.querySelector(".course-description").textContent.trim()
    }));
}

// Save the complete course list in localStorage.
function markCourseStorageProblem(currentRawValue) {
    courseDataState = "changed";
    if (currentRawValue !== null) {
        try {
            if (!Array.isArray(JSON.parse(currentRawValue))) {
                courseDataState = "invalid";
            }
        } catch (error) {
            courseDataState = "invalid";
        }
    }
    courses = null;
    showCourseDataError();
}

function saveCourses(courseList) {
    if (!hasTeacherAccess() || courseDataState === "invalid" ||
        courseDataState === "changed" || courseDataState === "unavailable" ||
        !Array.isArray(courseList)) return false;

    try {
        const serializedCourses = JSON.stringify(courseList);
        if (!hasTeacherAccess()) return false;
        const currentRawValue = localStorage.getItem(STORAGE_KEY);
        if (currentRawValue !== courseStorageRawValue) {
            markCourseStorageProblem(currentRawValue);
            return false;
        }
        localStorage.setItem(STORAGE_KEY, serializedCourses);
        if (localStorage.getItem(STORAGE_KEY) !== serializedCourses) {
            markCourseStorageProblem(localStorage.getItem(STORAGE_KEY));
            return false;
        }
        courseStorageRawValue = serializedCourses;
        return true;
    } catch (error) {
        console.error("Could not save course data:", error);
        return false;
    }
}

// Load saved courses or initialize the original sample courses.
function loadCourses() {
    if (!hasTeacherAccess()) return { state: "unavailable", courses: null };
    let savedData;
    try {
        savedData = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.error("Could not read saved courses:", error);
        return { state: "unavailable", courses: null };
    }

    if (savedData !== null) {
        try {
            const parsedCourses = JSON.parse(savedData);

            if (Array.isArray(parsedCourses)) {
                return { state: "valid", courses: parsedCourses, rawValue: savedData };
            }
        } catch (error) {
            console.error("Could not load saved courses:", error);
        }
        return { state: "invalid", courses: null, rawValue: savedData };
    }

    const initialCourses = getInitialCoursesFromHTML();
    if (!saveCourses(initialCourses)) {
        return { state: "unavailable", courses: null, rawValue: null };
    }

    return { state: "valid", courses: initialCourses, rawValue: courseStorageRawValue };
}

function canUseCourseList() {
    if (courseDataState !== "valid" || !Array.isArray(courses) ||
        !hasTeacherAccess()) return false;
    try {
        const currentRawValue = localStorage.getItem(STORAGE_KEY);
        if (currentRawValue === courseStorageRawValue) return true;
        markCourseStorageProblem(currentRawValue);
    } catch (error) {
        courseDataState = "unavailable";
        courses = null;
        showCourseDataError();
    }
    return false;
}

function showCourseDataError() {
    addCourseBtn.disabled = true;
    courseCount.textContent = "Unavailable";
    const message = document.createElement("p");
    message.className = "course-data-error";
    message.setAttribute("role", "alert");
    message.textContent = courseDataState === "invalid"
        ? "Saved course data is malformed or is not a JSON array. The existing value was left unchanged. Course operations are unavailable. Restore a valid JSON array and reload this page."
        : courseDataState === "changed"
            ? "Course data changed in another tab. No stale changes were written. Reload this page to load the current course list."
            : "Course storage could not be read or initialized safely. No course list changes were made. Check browser storage and reload this page.";
    courseGrid.replaceChildren(message);
}

// Keep valid stored arrays, including empty arrays, as the source of truth.
const courseLoadResult = loadCourses();
courseDataState = courseLoadResult.state;
courses = courseLoadResult.courses;
courseStorageRawValue = courseLoadResult.rawValue;

// Update the displayed course count.
function updateCourseCount() {
    const totalCourses = courses.length;

    courseCount.textContent =
        `${totalCourses} ${totalCourses === 1 ? "course" : "courses"}`;
}

// Update course numbering.
function updateCourseLabels() {
    const cards = courseGrid.querySelectorAll(".teacher-course-card");

    cards.forEach((card, index) => {
        const label = card.querySelector(".course-label");

        if (label) {
            label.textContent =
                `COURSE ${String(index + 1).padStart(2, "0")}`;
        }
    });
}

// Render all courses from the current course list.
function renderCourses() {
    if (!canUseCourseList()) return;
    courseGrid.querySelectorAll(".teacher-course-card").forEach((card) => {
        card.remove();
    });

    courses.forEach((course, index) => {
        const card = createCourseCard(course, index + 1);

        courseGrid.insertBefore(card, addCourseBtn);
    });

    updateCourseLabels();
    updateCourseCount();
}

// Remove a course and save the change.
function removeCourse(courseId) {
    if (!canUseCourseList()) return;
    const course = courses.find((item) => item.id === courseId);

    if (!course) return;

    const confirmed = window.confirm(
        `Are you sure you want to remove "${course.name}"?`
    );

    if (!confirmed) return;
    if (!canUseCourseList()) return;

    const updatedCourses = courses.filter((item) => item.id !== courseId);
    if (!saveCourses(updatedCourses)) return;
    courses = updatedCourses;
    renderCourses();
}

// Open the Add Course modal.
function openCourseModal() {
    if (!canUseCourseList()) return;
    addCourseForm.reset();
    courseFormMessage.textContent = "";

    courseModalBackdrop.hidden = false;
    courseModalBackdrop.classList.remove("is-visible");

    void courseModalBackdrop.offsetWidth;

    requestAnimationFrame(() => {
        courseModalBackdrop.classList.add("is-visible");
        newCourseName.focus();
    });
}

// Close the Add Course modal with its existing animation.
function closeCourseForm() {
    if (courseModalBackdrop.hidden) return;

    courseModalBackdrop.classList.remove("is-visible");

    window.setTimeout(() => {
        courseModalBackdrop.hidden = true;
        courseFormMessage.textContent = "";
        addCourseForm.reset();
        if (hasTeacherAccess()) addCourseBtn.focus();
    }, 450);
}

// Modal event listeners.
addCourseBtn.addEventListener("click", openCourseModal);
closeCourseModal.addEventListener("click", closeCourseForm);
cancelCourseBtn.addEventListener("click", closeCourseForm);

courseModalBackdrop.addEventListener("click", (event) => {
    if (event.target === courseModalBackdrop) {
        closeCourseForm();
    }
});

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        !courseModalBackdrop.hidden &&
        courseModalBackdrop.classList.contains("is-visible")
    ) {
        closeCourseForm();
    }
});

// Create a course card dynamically.
function createCourseCard(course, number) {
    const card = document.createElement("article");
    card.className = "teacher-course-card";

    const label = document.createElement("p");
    label.className = "course-label";
    label.textContent = `COURSE ${String(number).padStart(2, "0")}`;

    const symbol = document.createElement("div");
    symbol.className = "course-symbol";
    symbol.textContent = "✳";

    const title = document.createElement("h3");
    title.textContent = course.name;

    const descriptionText = document.createElement("p");
    descriptionText.className = "course-description";
    descriptionText.textContent = course.description;

    const footer = document.createElement("div");
    footer.className = "course-card-footer";

    const manageText = document.createElement("span");
    manageText.textContent = "Manage course";

    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";

    footer.append(manageText, arrow);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-course-btn";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute(
        "aria-label",
        `Remove ${course.name}`
    );

    removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        removeCourse(course.id);
    });

    card.append(
        label,
        symbol,
        title,
        descriptionText,
        footer,
        removeBtn
    );

    // Clicking the card opens the matching course workspace.
    card.addEventListener("click", (event) => {
        if (!hasTeacherAccess()) return;
        if (event.target.closest("button")) return;

        window.location.href =
            `course-detail.html?id=${encodeURIComponent(course.id)}`;
    });

    return card;
}

// Handle creation of a new course.
addCourseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canUseCourseList()) return;

    const name = newCourseName.value.trim();
    const instructor = newInstructorName.value.trim();
    const description = newCourseDescription.value.trim();

    if (!name || !instructor || !description) {
        courseFormMessage.textContent =
            "Please fill in all three fields.";
        return;
    }

    const course = {
        id: crypto.randomUUID(),
        name: name,
        instructor: instructor,
        description: description
    };

    const updatedCourses = [...courses, course];
    if (!canUseCourseList() || !saveCourses(updatedCourses)) return;
    courses = updatedCourses;
    renderCourses();
    closeCourseForm();

    console.log("Course created:", course);
});

// Initialize the dashboard.
if (!initialTeacherAccess?.allowed || !hasTeacherAccess()) {
    revokeTeacherAccess();
} else if (courseDataState === "valid") {
    renderCourses();
} else {
    showCourseDataError();
}

function recheckTeacherAccess() {
    if (!hasTeacherAccess()) revokeTeacherAccess();
}

window.addEventListener("focus", recheckTeacherAccess);
window.addEventListener("pageshow", recheckTeacherAccess);
window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
        canUseCourseList();
        return;
    }
    if (teacherAccess?.isRelevantStorageChange(event.key)) recheckTeacherAccess();
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recheckTeacherAccess();
});
