"use strict";

const DEMO_STUDENT_ID = "demo-student";
const ATTENDANCE_THRESHOLD = 75; // Example only; this is not an official rule.
const courseId = new URLSearchParams(window.location.search).get("course");
const course = window.courseCatalog?.find((item) => item.id === courseId);

const courseContent = document.querySelector("#courseContent");
const pageMessage = document.querySelector("#pageMessage");
const assignmentDialog = document.querySelector("#assignmentDialog");
let activeAssignment = null;

function showMessage(message) {
    pageMessage.innerHTML = `${message} <a href="student_courses.html">Return to Courses</a>.`;
    pageMessage.hidden = false;
    courseContent.hidden = true;
}

function getInitials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderOverview(selectedCourse) {
    document.title = `LearnSpace | ${selectedCourse.title}`;
    document.querySelector("#courseTitle").textContent = selectedCourse.title;
    document.querySelector("#courseIcon").textContent = selectedCourse.icon || "✳";

    if (selectedCourse.image) {
        const cover = document.querySelector("#courseCover");
        const image = document.createElement("img");
        image.src = selectedCourse.image;
        image.alt = `${selectedCourse.title} course cover`;
        cover.replaceChildren(image);
        cover.classList.add("has-image");
        cover.removeAttribute("aria-hidden");
    }

    const instructorName = selectedCourse.instructor?.name || "Instructor not listed";
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
    }

    renderAttendance(selectedCourse);
}

function renderAttendance(selectedCourse) {
    const records = (selectedCourse.attendance || []).filter((record) =>
        record.studentId === DEMO_STUDENT_ID && record.courseId === selectedCourse.id
    );
    const total = records.length;
    const attended = records.filter((record) => ["present", "late"].includes(record.status.toLowerCase())).length;
    const missed = records.filter((record) => record.status.toLowerCase() === "absent").length;
    const percentage = total === 0 ? 0 : Math.round((attended / total) * 100);
    const circumference = 2 * Math.PI * 49;
    const ring = document.querySelector("#ringValue");

    document.querySelector("#attendedCount").textContent = attended;
    document.querySelector("#classCount").textContent = total;
    document.querySelector("#attendancePercent").textContent = `${percentage}%`;
    document.querySelector("#attendanceRing").setAttribute("aria-label", `Attendance ${percentage} percent`);
    ring.style.strokeDasharray = circumference.toFixed(3);
    ring.style.strokeDashoffset = (circumference * (1 - percentage / 100)).toFixed(3);

    document.querySelector("#attendanceDetail").textContent = total
        ? `${missed} ${missed === 1 ? "class missed" : "classes missed"} · Late counts as attended`
        : "No classes have been recorded yet.";
    const thresholdMessage = total
        ? (percentage >= ATTENDANCE_THRESHOLD ? "Above" : "Below") + ` the example ${ATTENDANCE_THRESHOLD}% threshold`
        : `Example threshold: ${ATTENDANCE_THRESHOLD}%`;
    document.querySelector("#attendanceThreshold").textContent = `${thresholdMessage} · Example only`;
}

function fileIconType(type) {
    const normalized = (type || "").toLowerCase();
    if (normalized.includes("note") || normalized.includes("pdf")) return "notes";
    if (normalized.includes("presentation")) return "presentation";
    if (normalized.includes("assignment") || normalized.includes("worksheet")) return "assignment";
    if (normalized.includes("book")) return "book";
    return "other";
}

function createFileIcon(type) {
    const icon = document.createElement("span");
    icon.className = `file-icon ${fileIconType(type)}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type?.toLowerCase().includes("presentation") ? "PPT" : "PDF";
    return icon;
}

function createEmptyState(text) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = text;
    return empty;
}

function renderResources(selectedCourse) {
    const list = document.querySelector("#resourceList");
    list.replaceChildren();
    const resources = selectedCourse.resources || [];
    if (!resources.length) {
        list.append(createEmptyState("No books or notes have been listed for this course yet."));
        return;
    }

    resources.forEach((resource) => {
        const card = document.createElement("article");
        card.className = "resource-card";
        card.append(createFileIcon(resource.type));

        const copy = document.createElement("div");
        copy.className = "resource-copy";
        const title = document.createElement("h3");
        title.textContent = resource.title;
        const info = document.createElement("p");
        info.textContent = `${resource.type} · ${resource.filename || "File not specified"}`;
        copy.append(title, info);

        let action;
        if (resource.url && !/placeholder|replace_me|your_form/i.test(resource.url)) {
            action = document.createElement("a");
            action.className = "card-action";
            action.href = resource.url;
            action.target = "_blank";
            action.rel = "noopener noreferrer";
            action.textContent = resource.download ? "Download" : "View";
            if (resource.download) action.download = "";
        } else {
            action = document.createElement("button");
            action.className = "card-action";
            action.type = "button";
            action.disabled = true;
            action.title = "This sample file is not attached in the frontend prototype.";
            action.textContent = "Unavailable";
        }
        card.append(copy, action);
        list.append(card);
    });
}

function renderAssignments(selectedCourse) {
    const list = document.querySelector("#assignmentList");
    list.replaceChildren();
    const assignments = selectedCourse.assignments || [];
    if (!assignments.length) {
        list.append(createEmptyState("There are no assignments listed for this course yet."));
        return;
    }

    assignments.forEach((assignment) => {
        const card = document.createElement("article");
        card.className = "assignment-card";
        card.append(createFileIcon("Assignment"));
        const copy = document.createElement("div");
        copy.className = "assignment-copy";
        const title = document.createElement("h3");
        title.textContent = assignment.title;
        const description = document.createElement("p");
        description.textContent = assignment.description;
        const footer = document.createElement("div");
        footer.className = "assignment-footer";
        const meta = document.createElement("div");
        meta.className = "assignment-meta";
        meta.append(document.createTextNode(`Due ${assignment.due || "Date not set"}`));
        if (assignment.marks !== undefined && assignment.marks !== null) {
            meta.append(document.createTextNode(`${assignment.marks} marks`));
        }
        const status = document.createElement("span");
        status.className = `status-pill ${(assignment.status || "Pending").toLowerCase()}`;
        status.textContent = assignment.status || "Pending";
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

function renderQuizzes(selectedCourse) {
    const list = document.querySelector("#quizList");
    list.replaceChildren();
    const quizzes = selectedCourse.quizzes || [];
    if (!quizzes.length) {
        list.append(createEmptyState("There are no quizzes listed for this course yet."));
        return;
    }

    quizzes.forEach((quiz) => {
        const card = document.createElement("article");
        card.className = "quiz-card";
        const copy = document.createElement("div");
        copy.className = "quiz-copy";
        const title = document.createElement("h3");
        title.textContent = quiz.title;
        const description = document.createElement("p");
        description.textContent = quiz.description;
        const instructions = document.createElement("p");
        instructions.textContent = quiz.instructions;
        const meta = document.createElement("div");
        meta.className = "quiz-meta";
        if (quiz.questions) meta.append(document.createTextNode(`${quiz.questions} questions`));
        if (quiz.timeLimit) meta.append(document.createTextNode(quiz.timeLimit));
        if (quiz.due) meta.append(document.createTextNode(`Due ${quiz.due}`));
        if (quiz.status) meta.append(document.createTextNode(quiz.status));
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
        const validUrl = isConfiguredFormUrl(quiz.formUrl);
        if (!validUrl) {
            start.addEventListener("click", () => {
                feedback.textContent = "Google Forms link has not been configured.";
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
    if (!url || /placeholder|replace_me|your_form/i.test(url)) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && (parsed.hostname === "forms.gle" || parsed.hostname === "docs.google.com");
    } catch {
        return false;
    }
}

function openAssignment(assignment) {
    activeAssignment = assignment;
    document.querySelector("#assignmentDialogTitle").textContent = assignment.title;
    document.querySelector("#assignmentDialogDescription").textContent = assignment.description;
    const meta = document.querySelector("#assignmentDialogMeta");
    meta.replaceChildren();
    [
        `Due: ${assignment.due || "Not set"}`,
        assignment.marks === undefined ? "" : `Maximum marks: ${assignment.marks}`,
        `Status: ${assignment.status || "Pending"}`
    ].filter(Boolean).forEach((value) => {
        const item = document.createElement("span");
        item.className = "status-pill";
        item.textContent = value;
        meta.append(item);
    });

    const references = document.querySelector("#referenceFiles");
    const referenceList = document.querySelector("#referenceFileList");
    referenceList.replaceChildren();
    const files = assignment.referenceFiles || [];
    references.hidden = files.length === 0;
    files.forEach((file) => {
        const line = document.createElement("p");
        line.className = "resource-copy";
        line.textContent = file.filename;
        referenceList.append(line);
    });

    document.querySelector("#submissionFile").value = "";
    document.querySelector("#selectedFilename").textContent = "No file selected";
    document.querySelector("#submissionMessage").textContent = "This prototype does not send or permanently save files.";
    assignmentDialog.showModal();
}

document.querySelector("#submissionFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    document.querySelector("#selectedFilename").textContent = file ? file.name : "No file selected";
    document.querySelector("#submissionMessage").textContent = file
        ? "File selected for this demonstration only. It has not been sent or saved."
        : "This prototype does not send or permanently save files.";
});

document.querySelector("#demoSubmit").addEventListener("click", () => {
    const file = document.querySelector("#submissionFile").files[0];
    document.querySelector("#submissionMessage").textContent = file
        ? `Demo only: ${file.name} was selected, but no submission was sent or saved.`
        : "Choose a file first. This prototype does not send or permanently save files.";
});

document.querySelector("#closeAssignment").addEventListener("click", () => assignmentDialog.close());

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

if (!courseId) {
    showMessage("No course was selected.");
} else if (!course) {
    showMessage("That course could not be found.");
} else {
    courseContent.hidden = false;
    renderOverview(course);
    renderResources(course);
    renderAssignments(course);
    renderQuizzes(course);
}
