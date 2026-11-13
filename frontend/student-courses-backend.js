"use strict";

(() => {
    const api = window.LearnSpaceApi;
    const grid = document.querySelector("#courseGrid");
    const count = document.querySelector("#courseCount");
    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }
    async function load() {
        grid.setAttribute("aria-busy", "true");
        try {
            const courses = await api.get("/student/offerings");
            grid.replaceChildren();
            if (!courses.length) grid.append(node("p", "courses-empty-state", "No course offerings are available for your current semester yet."));
            courses.forEach((course, index) => {
                const card = node("article", "course-card");
                const topline = node("div", "course-topline");
                topline.append(node("span", "course-number", `COURSE ${String(index + 1).padStart(2, "0")}`));
                card.append(topline, node("span", "course-icon", "✳"), node("h3", "", course.subjectName));
                card.append(node("p", "", `${course.subjectCode} · ${course.semesterName} · ${course.academicYear} · Section ${course.sectionCode || "—"}`));
                if (course.description) card.append(node("p", "", course.description));
                const open = node("a", "course-open", "Open course →");
                open.href = `course_details.html?offeringId=${encodeURIComponent(course.id)}`;
                card.append(open);
                grid.append(card);
            });
            count.textContent = `${courses.length} ${courses.length === 1 ? "course" : "courses"}`;
        } catch (error) {
            grid.replaceChildren(node("p", "courses-empty-state", error.message || "Your courses could not be loaded."));
            count.textContent = "Unavailable";
        } finally { grid.removeAttribute("aria-busy"); }
    }
    void load();
    window.addEventListener("focus", load);
})();
