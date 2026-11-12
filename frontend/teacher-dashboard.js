
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
    if (offeringModalBackdrop) offeringModalBackdrop.hidden = true;
    if (courseGrid) {
        courseGrid.replaceChildren();
        const message = document.createElement("p");
        message.className = "course-access-denied";
        message.setAttribute("role", "alert");
        message.textContent = "Teacher access is no longer available. Sign in again after your account is active.";
        courseGrid.append(message);
    }
    if (addOfferingBtn) addOfferingBtn.disabled = true;
    setTeacherCurriculumState("Teacher access is no longer available.", true);
}

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");
const teacherCurriculumStatus = document.querySelector("#teacherCurriculumStatus");
const teacherCurriculumList = document.querySelector("#teacherCurriculumList");

const addOfferingBtn = document.querySelector("#addOfferingBtn");
const offeringModalBackdrop = document.querySelector("#offeringModalBackdrop");
const closeOfferingModal = document.querySelector("#closeOfferingModal");
const cancelOfferingBtn = document.querySelector("#cancelOfferingBtn");
const offeringForm = document.querySelector("#offeringForm");
const offeringSubjectId = document.querySelector("#offeringSubjectId");
const offeringDescription = document.querySelector("#offeringDescription");
const offeringFormMessage = document.querySelector("#offeringFormMessage");
const offeringModalTitle = document.querySelector("#offeringModalTitle");
const saveOfferingBtn = document.querySelector("#saveOfferingBtn");

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
    const cards = document.querySelector("#initialCourseSamples")
        .querySelectorAll(".teacher-course-card");

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
    addOfferingBtn.disabled = true;
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

function getOfferingSnapshot() {
    if (!hasTeacherAccess()) return { success: false, message: "Teacher access is unavailable." };
    const offeringData = window.LearnSpaceTeacherOfferingData;
    if (!offeringData || typeof offeringData.readAndValidateOfferings !== "function") {
        return { success: false, message: "Offering validation is unavailable." };
    }
    const snapshot = offeringData.readAndValidateOfferings();
    if (!snapshot.success) return snapshot;
    const currentAccess = teacherAccess.evaluate();
    if (currentAccess.userId !== snapshot.identity.userId || currentAccess.teacherId !== snapshot.identity.teacherId) {
        return { success: false, message: "Teacher identity changed. Reload before continuing." };
    }
    return snapshot;
}

function getOwnedOfferings(snapshot) {
    return snapshot.records.filter((record) =>
        window.LearnSpaceTeacherOfferingData.isOfferingRecord(record) &&
        record.teacherUserId === snapshot.identity.userId &&
        record.teacherId === snapshot.identity.teacherId
    );
}

function eligibleSubjects(snapshot) {
    const offeringData = window.LearnSpaceTeacherOfferingData;
    const semesterValidation = offeringData.validateSemesters(snapshot.semesters, snapshot.curriculumCourses);
    if (!semesterValidation.success) return [];
    const ownedIds = new Set(getOwnedOfferings(snapshot).map((item) => item.curriculumCourseId));
    const semesterBySubject = new Map();
    snapshot.semesters.forEach((semester) => {
        semester.curriculumCourseIds.forEach((id) => semesterBySubject.set(id, semester));
    });
    return snapshot.curriculumCourses.filter((subject) =>
        semesterBySubject.get(subject.id)?.status === "active" && !ownedIds.has(subject.id)
    );
}

function showOfferingDirectoryError(message) {
    courseGrid.replaceChildren();
    courseCount.textContent = "Unavailable";
    addOfferingBtn.disabled = true;
    const alert = document.createElement("p");
    alert.className = "course-data-error";
    alert.setAttribute("role", "alert");
    alert.textContent = message || "Offering data could not be validated safely.";
    courseGrid.append(alert, addOfferingBtn);
}

function createOfferingCard(offering, subject, semester, number) {
    const card = document.createElement("article");
    card.className = "teacher-course-card";
    const label = document.createElement("p");
    label.className = "course-label";
    label.textContent = "OFFERING " + String(number).padStart(2, "0");
    const symbol = document.createElement("div");
    symbol.className = "course-symbol";
    symbol.textContent = "✳";
    const title = document.createElement("h3");
    title.textContent = subject.name;
    const details = document.createElement("p");
    details.className = "course-description";
    details.textContent = subject.code + " · " + semester.name + " · " + semester.academicYear + " · " +
        (semester.status === "active" ? "Active" : "Inactive");
    const description = document.createElement("p");
    description.className = "course-description";
    description.textContent = offering.description;
    const footer = document.createElement("div");
    footer.className = "course-card-footer";
    const footerText = document.createElement("span");
    footerText.textContent = "Open offering workspace";
    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";
    footer.append(footerText, arrow);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "cancel-course-btn";
    edit.textContent = "Edit description";
    edit.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditOffering(offering.id);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-course-btn";
    remove.textContent = "Delete offering";
    remove.addEventListener("click", (event) => {
        event.stopPropagation();
        confirmDeleteOffering(offering.id, JSON.stringify(offering));
    });
    card.append(label, symbol, title, details, description, footer, edit, remove);
    card.addEventListener("click", (event) => {
        if (!hasTeacherAccess() || event.target.closest("button")) return;
        window.location.href = "course-detail.html?id=" + encodeURIComponent(offering.id);
    });
    return card;
}

function renderOfferingDirectory() {
    if (!hasTeacherAccess()) return;
    const snapshot = getOfferingSnapshot();
    if (!snapshot.success) {
        showOfferingDirectoryError(snapshot.message);
        return;
    }
    courses = snapshot.records;
    courseStorageRawValue = snapshot.rawValues.courses;
    courseDataState = "valid";
    courseGrid.replaceChildren();
    const owned = getOwnedOfferings(snapshot);
    const subjects = new Map(snapshot.curriculumCourses.map((item) => [item.id, item]));
    const semesterBySubject = new Map();
    snapshot.semesters.forEach((semester) => {
        semester.curriculumCourseIds.forEach((id) => semesterBySubject.set(id, semester));
    });
    owned.forEach((offering, index) => {
        courseGrid.append(createOfferingCard(
            offering,
            subjects.get(offering.curriculumCourseId),
            semesterBySubject.get(offering.curriculumCourseId),
            index + 1
        ));
    });
    if (owned.length === 0) {
        const empty = document.createElement("p");
        empty.className = "course-empty-state";
        empty.textContent = "You have no offerings yet. Choose an active official subject to create one.";
        courseGrid.append(empty);
    }
    courseCount.textContent = owned.length + " " + (owned.length === 1 ? "offering" : "offerings");
    addOfferingBtn.disabled = eligibleSubjects(snapshot).length === 0;
    courseGrid.append(addOfferingBtn);
}

let offeringFormMode = "create";
let editingOfferingId = null;
let editingOfferingSnapshot = null;

function showOfferingFormError(message) {
    offeringFormMessage.textContent = message;
    offeringFormMessage.classList.add("error");
}

function showOfferingModal() {
    offeringModalBackdrop.hidden = false;
    offeringModalBackdrop.classList.remove("is-visible");
    void offeringModalBackdrop.offsetWidth;
    requestAnimationFrame(() => {
        offeringModalBackdrop.classList.add("is-visible");
        (offeringFormMode === "create" ? offeringSubjectId : offeringDescription).focus();
    });
}

function openCreateOffering() {
    if (!hasTeacherAccess()) return;
    const snapshot = getOfferingSnapshot();
    if (!snapshot.success) {
        window.alert(snapshot.message || "Offering data could not be validated safely.");
        return;
    }
    offeringForm.reset();
    offeringFormMessage.textContent = "";
    offeringFormMessage.classList.remove("error");
    offeringSubjectId.replaceChildren();
    offeringSubjectId.disabled = false;
    offeringFormMode = "create";
    editingOfferingId = null;
    editingOfferingSnapshot = null;
    offeringModalTitle.textContent = "Create an offering.";
    saveOfferingBtn.textContent = "Create offering";
    const available = eligibleSubjects(snapshot);
    available.forEach((subject) => {
        const semester = snapshot.semesters.find((item) => item.curriculumCourseIds.includes(subject.id));
        const option = document.createElement("option");
        option.value = subject.id;
        option.textContent = subject.code + " — " + subject.name + " (" + semester.name + ", " + semester.academicYear + ")";
        offeringSubjectId.append(option);
    });
    offeringDescription.value = available[0]?.description || "";
    saveOfferingBtn.disabled = available.length === 0;
    if (available.length === 0) showOfferingFormError("No active, unassigned official subjects are available to offer.");
    showOfferingModal();
}

function openEditOffering(offeringId) {
    if (!hasTeacherAccess()) return;
    const snapshot = getOfferingSnapshot();
    if (!snapshot.success) {
        window.alert(snapshot.message || "Offering data could not be validated safely.");
        return;
    }
    const offering = getOwnedOfferings(snapshot).find((item) => item.id === offeringId);
    if (!offering) {
        window.alert("This offering is no longer available to your account.");
        renderOfferingDirectory();
        return;
    }
    const subject = snapshot.curriculumCourses.find((item) => item.id === offering.curriculumCourseId);
    if (!subject) return;
    offeringForm.reset();
    offeringFormMessage.textContent = "";
    offeringFormMessage.classList.remove("error");
    offeringSubjectId.replaceChildren();
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.code + " — " + subject.name;
    offeringSubjectId.append(option);
    offeringSubjectId.disabled = true;
    offeringDescription.value = offering.description;
    offeringFormMode = "edit";
    editingOfferingId = offering.id;
    editingOfferingSnapshot = JSON.stringify(offering);
    offeringModalTitle.textContent = "Edit offering description.";
    saveOfferingBtn.textContent = "Save changes";
    saveOfferingBtn.disabled = false;
    showOfferingModal();
}

function closeOfferingForm() {
    if (offeringModalBackdrop.hidden) return;
    offeringModalBackdrop.classList.remove("is-visible");
    window.setTimeout(() => {
        offeringModalBackdrop.hidden = true;
        offeringForm.reset();
        offeringSubjectId.disabled = false;
        saveOfferingBtn.disabled = false;
        offeringFormMessage.textContent = "";
        if (hasTeacherAccess()) addOfferingBtn.focus();
    }, 450);
}

function confirmDeleteOffering(offeringId, expectedSnapshot) {
    if (!hasTeacherAccess()) return;
    const snapshot = getOfferingSnapshot();
    const offering = snapshot.success
        ? getOwnedOfferings(snapshot).find((item) => item.id === offeringId)
        : null;
    if (!offering || JSON.stringify(offering) !== expectedSnapshot) {
        window.alert(snapshot.message || "This offering changed or is no longer owned by your account.");
        renderOfferingDirectory();
        return;
    }
    const subject = snapshot.curriculumCourses.find((item) => item.id === offering.curriculumCourseId);
    const confirmed = window.confirm(
        "Permanently delete “" + (subject?.name || offering.name) +
        "” and all associated course content, including materials, assignments, quizzes, and student submissions? This cannot be undone."
    );
    if (!confirmed || !hasTeacherAccess()) return;
    const result = window.LearnSpaceTeacherOfferingData.deleteOffering(offeringId, expectedSnapshot);
    if (!result.success) {
        window.alert(result.message || "The offering could not be deleted safely.");
    }
    renderOfferingDirectory();
}

addOfferingBtn.addEventListener("click", openCreateOffering);
closeOfferingModal.addEventListener("click", closeOfferingForm);
cancelOfferingBtn.addEventListener("click", closeOfferingForm);
offeringModalBackdrop.addEventListener("click", (event) => {
    if (event.target === offeringModalBackdrop) closeOfferingForm();
});
offeringSubjectId.addEventListener("change", () => {
    if (offeringFormMode !== "create") return;
    const snapshot = getOfferingSnapshot();
    const subject = snapshot.success
        ? snapshot.curriculumCourses.find((item) => item.id === offeringSubjectId.value)
        : null;
    if (subject) offeringDescription.value = subject.description;
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !offeringModalBackdrop.hidden &&
        offeringModalBackdrop.classList.contains("is-visible")) closeOfferingForm();
});
offeringForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!hasTeacherAccess()) return;
    const result = offeringFormMode === "create"
        ? window.LearnSpaceTeacherOfferingData.createOffering(offeringSubjectId.value, offeringDescription.value)
        : window.LearnSpaceTeacherOfferingData.updateOfferingDescription(
            editingOfferingId,
            editingOfferingSnapshot,
            offeringDescription.value
        );
    if (!result.success) {
        showOfferingFormError(result.message || "The offering could not be saved safely.");
        return;
    }
    closeOfferingForm();
    renderOfferingDirectory();
});

// Initialize the Teacher's owned offering directory.
if (!initialTeacherAccess?.allowed || !hasTeacherAccess()) {
    revokeTeacherAccess();
} else {
    if (courseDataState === "valid") renderOfferingDirectory();
    else showCourseDataError();
    if (hasTeacherAccess()) refreshTeacherCurriculum();
}

function recheckTeacherAccess() {
    if (!hasTeacherAccess()) {
        revokeTeacherAccess();
        return;
    }
    renderOfferingDirectory();
    refreshTeacherCurriculum();
}

window.addEventListener("focus", recheckTeacherAccess);
window.addEventListener("pageshow", recheckTeacherAccess);
window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === CURRICULUM_STORAGE_KEY || event.key === SEMESTER_STORAGE_KEY) {
        recheckTeacherAccess();
        return;
    }
    if (teacherAccess?.isRelevantStorageChange(event.key)) recheckTeacherAccess();
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recheckTeacherAccess();
});
