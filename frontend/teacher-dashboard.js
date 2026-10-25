
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

const STORAGE_KEY = "learnspaceCourses";

// Read the eight sample courses from the HTML.
function getInitialCoursesFromHTML() {
    const cards = courseGrid.querySelectorAll(".teacher-course-card");

    return Array.from(cards).map((card) => ({
        id: crypto.randomUUID(),
        name: card.querySelector("h3").textContent.trim(),
        instructor: "Not specified",
        description: card.querySelector(".course-description").textContent.trim()
    }));
}

// Load courses from localStorage.
// If this is the first visit, save the sample HTML courses.
function loadCourses() {
    const savedCourses = localStorage.getItem(STORAGE_KEY);

    if (savedCourses !== null) {
        try {
            const parsedCourses = JSON.parse(savedCourses);

            if (Array.isArray(parsedCourses)) {
                return parsedCourses;
            }
        } catch (error) {
            console.error("Could not read saved courses:", error);
        }
    }

    const initialCourses = getInitialCoursesFromHTML();
    saveCourses(initialCourses);

    return initialCourses;
}

// Save the complete course list.
function saveCourses(courses) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

// Our main course data now comes from localStorage.
let courses = loadCourses();

function updateCourseCount() {
    const totalCourses = courses.length;

    courseCount.textContent =
        `${totalCourses} ${totalCourses === 1 ? "course" : "courses"}`;
}

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

function renderCourses() {
    // Remove old course cards but keep the Add Course button.
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

function removeCourse(courseId) {
    const course = courses.find((item) => item.id === courseId);

    if (!course) return;

    const confirmed = window.confirm(
        `Are you sure you want to remove "${course.name}"?`
    );

    if (!confirmed) return;

    courses = courses.filter((item) => item.id !== courseId);

    saveCourses(courses);
    renderCourses();
}

function openCourseModal() {
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

function closeCourseForm() {
    if (courseModalBackdrop.hidden) return;

    courseModalBackdrop.classList.remove("is-visible");

    window.setTimeout(() => {
        courseModalBackdrop.hidden = true;
        courseFormMessage.textContent = "";
        addCourseForm.reset();
        addCourseBtn.focus();
    }, 450);
}

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
    removeBtn.setAttribute("aria-label", `Remove ${course.name}`);

    removeBtn.addEventListener("click", () => {
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

    return card;
}

addCourseForm.addEventListener("submit", (event) => {
    event.preventDefault();

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

    courses.push(course);

    saveCourses(courses);
    renderCourses();
    closeCourseForm();

    console.log("Course created:", course);
    console.log("Saved courses:", localStorage.getItem(STORAGE_KEY));
});

// Display the saved courses when the page opens.
renderCourses();
