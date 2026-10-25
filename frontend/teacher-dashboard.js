
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

// Holds courses created during the current page session.
// Instructor details are stored but not displayed on course cards.
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
   OPEN ADD COURSE FORM
======================================== */

function openCourseModal() {
    addCourseForm.reset();
    courseFormMessage.textContent = "";

    // Show the backdrop in its initial, hidden-animation state.
    courseModalBackdrop.hidden = false;
    courseModalBackdrop.classList.remove("is-visible");

    // Let the browser register the initial state before animating.
    void courseModalBackdrop.offsetWidth;

    // Start the opening animation.
    requestAnimationFrame(() => {
        courseModalBackdrop.classList.add("is-visible");
        newCourseName.focus();
    });
}

/* ========================================
   CLOSE ADD COURSE FORM
======================================== */

function closeCourseForm() {
    // Prevent repeated closing actions.
    if (courseModalBackdrop.hidden) {
        return;
    }

    // Remove the class to start the closing animation.
    courseModalBackdrop.classList.remove("is-visible");

    // Hide the backdrop after the CSS transition finishes.
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
   Instructor is intentionally not displayed.
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

    card.append(
        label,
        symbol,
        title,
        descriptionText,
        footer
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
    // Instructor information is not rendered on the course card.
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

    // Place the new card before the Add Course button.
    courseGrid.insertBefore(newCard, addCourseBtn);

    updateCourseCount();
    closeCourseForm();

    console.log("Course created:", course);
});

/* ========================================
   INITIALIZE DASHBOARD
======================================== */

updateCourseCount();
