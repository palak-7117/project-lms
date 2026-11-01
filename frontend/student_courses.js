"use strict";

const TEACHER_COURSES_KEY = "learnspaceCourses";
const sampleCourses = Array.isArray(window.courseCatalog)
    ? window.courseCatalog
    : [];

const courseGrid = document.querySelector("#courseGrid");
const courseCount = document.querySelector("#courseCount");

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

const teacherCourses = loadTeacherCourses();

// Use teacher courses as the only source when available.
// Otherwise, show the existing sample catalog as a fallback.
const courses = teacherCourses.length > 0
    ? teacherCourses
    : sampleCourses;

function renderCourses() {
    courseGrid.replaceChildren();

    if (courses.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "No courses are available yet.";
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
            window.location.href =
                `course_details.html?course=${encodeURIComponent(course.id)}`;
        });

        card.append(title, description, open);
        courseGrid.append(card);
    });

    courseCount.textContent =
        `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;
}

renderCourses();