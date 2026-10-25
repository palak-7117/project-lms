
const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");

const addCourseBtn = document.querySelector("#addCourseBtn");
const courseModalBackdrop = document.querySelector("#courseModalBackdrop");
const closeCourseModal = document.querySelector("#closeCourseModal");
const cancelCourseBtn = document.querySelector("#cancelCourseBtn");

const addCourseForm = document.querySelector("#addCourseForm");
const newCourseName = document.querySelector("#newCourseName");
const newCourseDescription = document.querySelector("#newCourseDescription");
const courseFormMessage = document.querySelector("#courseFormMessage");

/* ========================================
   UPDATE THE COURSE COUNT
======================================== */

function updateCourseCount() {
    const totalCourses = courseGrid.querySelectorAll(
        ".teacher-course-card"
    ).length;

    courseCount.textContent =
        `${totalCourses} ${totalCourses === 1 ? "course" : "courses"}`;
}

/* ========================================
   OPEN THE ADD COURSE FORM
======================================== */

function openCourseModal() {
    courseFormMessage.textContent = "";
    addCourseForm.reset();

    courseModalBackdrop.hidden = false;
    newCourseName.focus();
}

/* ========================================
   CLOSE THE ADD COURSE FORM
======================================== */

function closeCourseForm() {
    courseModalBackdrop.hidden = true;
    courseFormMessage.textContent = "";
    addCourseForm.reset();

    addCourseBtn.focus();
}

addCourseBtn.addEventListener("click", openCourseModal);

closeCourseModal.addEventListener("click", closeCourseForm);
cancelCourseBtn.addEventListener("click", closeCourseForm);

/* ========================================
   CLOSE WHEN CLICKING OUTSIDE THE FORM
======================================== */

courseModalBackdrop.addEventListener("click", (event) => {
    if (event.target === courseModalBackdrop) {
        closeCourseForm();
    }
});

/* ========================================
   CLOSE FORM WITH ESCAPE
======================================== */

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        !courseModalBackdrop.hidden
    ) {
        closeCourseForm();
    }
});

/* ========================================
   CREATE A COURSE CARD
======================================== */

function createCourseCard(name, description, number) {
    const card = document.createElement("article");
    card.className = "teacher-course-card";

    const label = document.createElement("p");
    label.className = "course-label";
    label.textContent = `COURSE ${String(number).padStart(2, "0")}`;

    const symbol = document.createElement("div");
    symbol.className = "course-symbol";
    symbol.textContent = "✳";

    const title = document.createElement("h3");
    title.textContent = name;

    const descriptionText = document.createElement("p");
    descriptionText.className = "course-description";
    descriptionText.textContent = description;

    const footer = document.createElement("div");
    footer.className = "course-card-footer";

    const manageText = document.createElement("span");
    manageText.textContent = "Manage course";

    const arrow = document.createElement("span");
    arrow.className = "course-arrow";
    arrow.textContent = "→";

    footer.append(manageText, arrow);
    card.append(label, symbol, title, descriptionText, footer);

    return card;
}

/* ========================================
   SUBMIT THE ADD COURSE FORM
======================================== */

addCourseForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = newCourseName.value.trim();
    const description = newCourseDescription.value.trim();

    if (!name || !description) {
        courseFormMessage.textContent =
            "Please enter both a course name and description.";
        return;
    }

    const existingCards = courseGrid.querySelectorAll(
        ".teacher-course-card"
    );

    const nextNumber = existingCards.length + 1;

    const newCard = createCourseCard(
        name,
        description,
        nextNumber
    );

    // Place the new course before the Add Course button.
    courseGrid.insertBefore(newCard, addCourseBtn);

    updateCourseCount();
    closeCourseForm();
});

/* ========================================
   INITIALIZE THE DASHBOARD
======================================== */

updateCourseCount();
