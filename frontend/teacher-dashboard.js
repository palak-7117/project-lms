
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

// Stores courses created during the current page session.
// Instructor information is stored but not displayed on course cards.
const createdCourses = [];

/* ========================================
   UPDATE COURSE COUNT
======================================== */

function updateCourseCount() {
    const totalCourses = courseGrid.querySelectorAll(
        ".teacher-course-card"
    ).length;

    courseCount.textContent =
        `${totalCourses} ${totalCourses === 1 ? "course" : "courses"}`;
}

/* ========================================
   UPDATE COURSE NUMBERS
======================================== */

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

/* ========================================
   REMOVE A COURSE
======================================== */

function removeCourse(card, courseName, courseId = null) {
    const confirmed = window.confirm(
        `Are you sure you want to remove "${courseName}"?`
    );

    if (!confirmed) {
        return;
    }

    // Remove the course card from the dashboard.
    card.remove();

    // Remove the course from the in-memory collection, if present.
    if (courseId !== null) {
        const courseIndex = createdCourses.findIndex(
            (course) => course.id === courseId
        );

        if (courseIndex !== -1) {
            createdCourses.splice(courseIndex, 1);
        }
    }

    // Refresh the course numbers and total count.
    updateCourseLabels();
    updateCourseCount();
}

/* ========================================
   ADD REMOVE BUTTONS TO COURSE CARDS
======================================== */

// This also handles the course cards already written in HTML.
function addRemoveButtonsToExistingCards() {
    const cards = courseGrid.querySelectorAll(".teacher-course-card");

    cards.forEach((card) => {
        // Do not add another button if one already exists.
        if (card.querySelector(".remove-course-btn")) {
            return;
        }

        const title = card.querySelector("h3");
        const courseName = title
            ? title.textContent.trim()
            : "this course";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-course-btn";
        removeBtn.textContent = "Remove";
        removeBtn.setAttribute(
            "aria-label",
            `Remove ${courseName}`
        );

        removeBtn.addEventListener("click", () => {
            removeCourse(card, courseName);
        });

        card.appendChild(removeBtn);
    });
}

/* ========================================
   OPEN ADD COURSE FORM
======================================== */

function openCourseModal() {
    addCourseForm.reset();
    courseFormMessage.textContent = "";

    courseModalBackdrop.hidden = false;
    courseModalBackdrop.classList.remove("is-visible");

    // Allow the browser to register the initial state.
    void courseModalBackdrop.offsetWidth;

    requestAnimationFrame(() => {
        courseModalBackdrop.classList.add("is-visible");
        newCourseName.focus();
    });
}

/* ========================================
   CLOSE ADD COURSE FORM
======================================== */

function closeCourseForm() {
    if (courseModalBackdrop.hidden) {
        return;
    }

    // Start the closing animation.
    courseModalBackdrop.classList.remove("is-visible");

    // Hide the modal after its transition.
    window.setTimeout(() => {
        courseModalBackdrop.hidden = true;
        courseFormMessage.textContent = "";
        addCourseForm.reset();

        addCourseBtn.focus();
    }, 450);
}

/* ========================================
   MODAL BUTTON EVENTS
======================================== */

addCourseBtn.addEventListener("click", openCourseModal);

closeCourseModal.addEventListener("click", closeCourseForm);
cancelCourseBtn.addEventListener("click", closeCourseForm);

/* ========================================
   CLOSE WHEN CLICKING OUTSIDE
======================================== */

courseModalBackdrop.addEventListener("click", (event) => {
    if (event.target === courseModalBackdrop) {
        closeCourseForm();
    }
});

/* ========================================
   CLOSE WITH ESCAPE
======================================== */

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        !courseModalBackdrop.hidden &&
        courseModalBackdrop.classList.contains("is-visible")
    ) {
        closeCourseForm();
    }
});

/* ========================================
   CREATE A COURSE CARD
======================================== */

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

    // Create a Remove button for the new card.
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-course-btn";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute(
        "aria-label",
        `Remove ${course.name}`
    );

    removeBtn.addEventListener("click", () => {
        removeCourse(card, course.name, course.id);
    });

    // Instructor information is intentionally not displayed.
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

/* ========================================
   SUBMIT ADD COURSE FORM
======================================== */

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

    // Store the course details, including instructor information.
    const course = {
        id: crypto.randomUUID(),
        name: name,
        instructor: instructor,
        description: description
    };

    createdCourses.push(course);

    const existingCards = courseGrid.querySelectorAll(
        ".teacher-course-card"
    );

    const nextNumber = existingCards.length + 1;
    const newCard = createCourseCard(course, nextNumber);

    // Insert the new card before the Add Course button.
    courseGrid.insertBefore(newCard, addCourseBtn);

    updateCourseCount();
    closeCourseForm();

    console.log("Course created:", course);
});

/* ========================================
   INITIALIZE DASHBOARD
======================================== */

// Add Remove buttons to all eight existing HTML cards.
addRemoveButtonsToExistingCards();

// Display the correct initial course count.
updateCourseCount();
