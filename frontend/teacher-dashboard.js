
const STORAGE_KEY = "learnspaceCourses";
const CURRICULUM_STORAGE_KEY = "learnspaceCurriculumCourses";
const SEMESTER_STORAGE_KEY = "learnspaceSemesters";
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
    setTeacherCurriculumState("Teacher access is no longer available.", true);
}

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");
const teacherCurriculumStatus = document.querySelector("#teacherCurriculumStatus");
const teacherCurriculumList = document.querySelector("#teacherCurriculumList");

const addCourseBtn = document.querySelector("#addCourseBtn");
const courseModalBackdrop = document.querySelector("#courseModalBackdrop");
const closeCourseModal = document.querySelector("#closeCourseModal");
const cancelCourseBtn = document.querySelector("#cancelCourseBtn");

const addCourseForm = document.querySelector("#addCourseForm");
const newCourseName = document.querySelector("#newCourseName");
const newInstructorName = document.querySelector("#newInstructorName");
const newCourseDescription = document.querySelector("#newCourseDescription");
const courseFormMessage = document.querySelector("#courseFormMessage");

function readOfficialCollection(storageKey, label) {
    let rawValue;
    try {
        rawValue = localStorage.getItem(storageKey);
    } catch (error) {
        return { success: false, rawValue: null, message: `${label} could not be read.` };
    }
    if (rawValue === null) return { success: true, rawValue, records: [] };
    let records;
    try {
        records = JSON.parse(rawValue);
    } catch (error) {
        return { success: false, rawValue, message: `${label} contains malformed data.` };
    }
    if (!Array.isArray(records)) {
        return { success: false, rawValue, message: `${label} must be a list.` };
    }
    return { success: true, rawValue, records };
}

function setTeacherCurriculumState(message, isError = false) {
    if (teacherCurriculumList) teacherCurriculumList.replaceChildren();
    if (teacherCurriculumStatus) {
        teacherCurriculumStatus.textContent = message;
        teacherCurriculumStatus.classList.toggle("is-error", isError);
        teacherCurriculumStatus.setAttribute("role", isError ? "alert" : "status");
    }
}

function renderOfficialCurriculum(courses, semesters) {
    if (!hasTeacherAccess()) return;
    const semesterByCourseId = new Map();
    for (const semester of semesters) {
        for (const courseId of semester.curriculumCourseIds) {
            semesterByCourseId.set(courseId, semester);
        }
    }
    const cards = courses.map((course) => {
        const card = document.createElement("article");
        card.className = "course-content-card";
        const heading = document.createElement("h3");
        heading.textContent = `${course.code} — ${course.name}`;
        const details = document.createElement("p");
        const semester = semesterByCourseId.get(course.id);
        details.textContent = semester
            ? `${semester.name} · ${semester.academicYear} · ${semester.status === "active" ? "Active" : "Inactive"}`
            : "Not assigned to a semester";
        card.append(heading, details);
        if (course.description?.trim()) {
            const description = document.createElement("p");
            description.textContent = course.description;
            card.append(description);
        }
        return card;
    });
    if (!hasTeacherAccess()) return;
    teacherCurriculumList.replaceChildren(...cards);
    if (teacherCurriculumStatus) {
        teacherCurriculumStatus.textContent = courses.length
            ? `${courses.length} official subject${courses.length === 1 ? "" : "s"}.`
            : "No official curriculum subjects are configured.";
        teacherCurriculumStatus.classList.toggle("is-error", false);
        teacherCurriculumStatus.setAttribute("role", "status");
    }
}

function refreshTeacherCurriculum() {
    if (!hasTeacherAccess()) {
        setTeacherCurriculumState("Teacher access is no longer available.", true);
        return;
    }
    const courseSnapshot = readOfficialCollection(CURRICULUM_STORAGE_KEY, "Official curriculum");
    const semesterSnapshot = readOfficialCollection(SEMESTER_STORAGE_KEY, "Semester data");
    if (!courseSnapshot.success || !semesterSnapshot.success) {
        setTeacherCurriculumState(courseSnapshot.message || semesterSnapshot.message, true);
        return;
    }
    const offeringData = window.LearnSpaceTeacherOfferingData;
    if (!offeringData) {
        setTeacherCurriculumState("Curriculum validation is unavailable.", true);
        return;
    }
    const courseValidation = offeringData.validateOfficialCurriculum(courseSnapshot.records);
    const semesterValidation = offeringData.validateSemesters(
        semesterSnapshot.records,
        courseSnapshot.records
    );
    if (!courseValidation.success || !semesterValidation.success) {
        setTeacherCurriculumState(courseValidation.message || semesterValidation.message, true);
        return;
    }
    if (!hasTeacherAccess()) return;
    try {
        if (localStorage.getItem(CURRICULUM_STORAGE_KEY) !== courseSnapshot.rawValue ||
            localStorage.getItem(SEMESTER_STORAGE_KEY) !== semesterSnapshot.rawValue) {
            setTeacherCurriculumState("Official curriculum changed while it was loading. Refresh to try again.", true);
            return;
        }
    } catch (error) {
        setTeacherCurriculumState("Official curriculum could not be verified safely.", true);
        return;
    }
    renderOfficialCurriculum(courseSnapshot.records, semesterSnapshot.records);
}
let courseDataState = "loading";
let courses = null;
let courseStorageRawValue = null;
let courseDataErrorMessage = null;

function validateCourseCollection(records) {
    const offeringData = window.LearnSpaceTeacherOfferingData;
    if (!offeringData || typeof offeringData.validateStoredCourseCollection !== "function") {
        return { success: false, message: "Course record validation is unavailable." };
    }
    return offeringData.validateStoredCourseCollection(records);
}

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
    courseDataErrorMessage = null;
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
        const validation = validateCourseCollection(courseList);
        if (!validation.success) {
            courseDataState = validation.state === "changed" || validation.state === "unavailable"
                ? validation.state
                : "invalid";
            courseDataErrorMessage = validation.message || "Course records failed validation.";
            courses = null;
            showCourseDataError();
            return false;
        }
        if (!hasTeacherAccess()) return false;
        if (localStorage.getItem(STORAGE_KEY) !== courseStorageRawValue) {
            markCourseStorageProblem(localStorage.getItem(STORAGE_KEY));
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
                const validation = validateCourseCollection(parsedCourses);
                if (!validation.success) {
                    courseDataErrorMessage = validation.message ||
                        "Saved course records failed validation.";
                    return {
                        state: validation.state === "changed" || validation.state === "unavailable"
                            ? validation.state
                            : "invalid",
                        courses: null,
                        rawValue: savedData
                    };
                }
                if (localStorage.getItem(STORAGE_KEY) !== savedData) {
                    return {
                        state: "changed",
                        courses: null,
                        rawValue: localStorage.getItem(STORAGE_KEY)
                    };
                }
                return { state: "valid", courses: parsedCourses, rawValue: savedData };
            }
        } catch (error) {
            console.error("Could not load saved courses:", error);
        }
        courseDataErrorMessage = "Saved course data is malformed or is not a JSON array.";
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
        ? `${courseDataErrorMessage || "Saved course data is malformed or contains invalid records."} The existing value was left unchanged. Course operations are unavailable. Correct the data and reload this page.`
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
    if (window.LearnSpaceTeacherOfferingData?.isOfferingRecord(course)) return;

    const confirmed = window.confirm(
        `Are you sure you want to remove "${course.name}"?`
    );

    if (!confirmed) return;
    if (!canUseCourseList()) return;
    if (window.LearnSpaceTeacherOfferingData?.isOfferingRecord(course)) return;

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

    const offeringData = window.LearnSpaceTeacherOfferingData;
    const isOffering = offeringData?.isOfferingRecord(course) === true;
    removeBtn.hidden = isOffering;
    if (!isOffering) {
        removeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            removeCourse(course.id);
        });
    }

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
} else {
    if (courseDataState === "valid") renderCourses();
    else showCourseDataError();
    if (hasTeacherAccess()) refreshTeacherCurriculum();
}

function recheckTeacherAccess() {
    if (!hasTeacherAccess()) revokeTeacherAccess();
    else refreshTeacherCurriculum();
}

window.addEventListener("focus", recheckTeacherAccess);
window.addEventListener("pageshow", recheckTeacherAccess);
window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
        canUseCourseList();
        return;
    }
    if (event.key === CURRICULUM_STORAGE_KEY || event.key === SEMESTER_STORAGE_KEY) {
        recheckTeacherAccess();
        return;
    }
    if (teacherAccess?.isRelevantStorageChange(event.key)) recheckTeacherAccess();
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recheckTeacherAccess();
});
