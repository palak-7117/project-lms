"use strict";

(() => {
    const api = window.LearnSpaceApi;
    const grid = document.querySelector("#courseGrid");
    const addButton = document.querySelector("#addOfferingBtn");
    const count = document.querySelector("#courseCount");
    const curriculumStatus = document.querySelector("#teacherCurriculumStatus");
    const curriculumList = document.querySelector("#teacherCurriculumList");
    const backdrop = document.querySelector("#offeringModalBackdrop");
    const form = document.querySelector("#offeringForm");
    const semesterSelect = document.querySelector("#offeringSemesterId");
    const subjectSelect = document.querySelector("#offeringSubjectId");
    const sectionInput = document.querySelector("#offeringSectionCode");
    const descriptionInput = document.querySelector("#offeringDescription");
    const formMessage = document.querySelector("#offeringFormMessage");
    const saveButton = document.querySelector("#saveOfferingBtn");
    let offerings = [];
    let curriculum = [];

    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function message(target, text, isError = false) {
        target.textContent = text;
        target.classList.toggle("error", isError);
        target.classList.toggle("is-error", isError);
    }

    function renderCurriculum() {
        curriculumList.replaceChildren();
        const semesterGroups = new Map();
        for (const item of curriculum) {
            const key = item.semesterId;
            if (!semesterGroups.has(key)) semesterGroups.set(key, { label: `${item.semesterName} · ${item.academicYear}`, subjects: [] });
            semesterGroups.get(key).subjects.push(item);
        }
        for (const group of semesterGroups.values()) {
            const card = node("article", "course-content-card");
            card.append(node("h3", "", group.label));
            card.append(node("p", "", group.subjects.map((item) => `${item.code} — ${item.name}`).join(" · ")));
            curriculumList.append(card);
        }
        curriculumStatus.textContent = curriculum.length
            ? "Active curriculum and semester mappings loaded from LearnSpace."
            : "There are no active mapped curriculum subjects available.";
    }

    function renderOfferings() {
        grid.replaceChildren();
        offerings.forEach((offering, index) => {
            const card = node("article", "teacher-course-card");
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            card.setAttribute("aria-label", `Open ${offering.subjectName} workspace`);
            card.append(node("p", "course-label", `OFFERING ${String(index + 1).padStart(2, "0")}`));
            card.append(node("div", "course-symbol", "✳"));
            card.append(node("h3", "", offering.subjectName));
            card.append(node("p", "course-description", `${offering.subjectCode} · ${offering.semesterName} · ${offering.academicYear} · Section ${offering.sectionCode || "—"}`));
            card.append(node("p", "course-description", offering.description || "No offering description."));
            const footer = node("div", "course-card-footer");
            footer.append(node("span", "", offering.status === "active" ? "Open offering workspace" : "Inactive offering"));
            footer.append(node("span", "course-arrow", "→"));
            card.append(footer);
            const actions = node("div", "course-form-actions");
            const edit = node("button", "cancel-course-btn", "Edit offering");
            edit.type = "button";
            edit.addEventListener("click", async (event) => {
                event.stopPropagation();
                const description = window.prompt("Offering description", offering.description || "");
                if (description === null) return;
                const sectionCode = window.prompt("Section", offering.sectionCode || "");
                if (sectionCode === null) return;
                try { await api.patch(`/teacher/offerings/${offering.id}`, { description, sectionCode }); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const status = node("button", "cancel-course-btn", offering.status === "active" ? "Deactivate offering" : "Activate offering");
            status.type = "button";
            status.addEventListener("click", async (event) => {
                event.stopPropagation();
                try { await api.patch(`/teacher/offerings/${offering.id}`, { status: offering.status === "active" ? "inactive" : "active" }); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const remove = node("button", "remove-course-btn", "Delete offering and content");
            remove.type = "button";
            remove.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (!window.confirm("Permanently delete this offering and its materials, assignments, submissions, quizzes, and attendance?")) return;
                try { await api.delete(`/teacher/offerings/${offering.id}`); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            actions.append(edit, status, remove);
            card.append(actions);
            const open = () => { window.location.href = `course-detail.html?id=${encodeURIComponent(offering.id)}`; };
            card.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
            card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
            grid.append(card);
        });
        if (!offerings.length) {
            const empty = node("p", "course-empty-state", "You have no offerings yet. Choose an active official subject to create one.");
            grid.append(empty);
        }
        count.textContent = `${offerings.length} ${offerings.length === 1 ? "offering" : "offerings"}`;
        grid.append(addButton);
        addButton.disabled = curriculum.length === 0;
    }

    function renderSubjectChoices() {
        subjectSelect.replaceChildren(new Option("Choose an official subject", ""));
        const visible = curriculum.filter((item) => item.semesterId === semesterSelect.value);
        for (const item of visible) {
            subjectSelect.append(new Option(`${item.code} — ${item.name}`, item.subjectId));
        }
    }

    function openForm() {
        form.reset();
        formMessage.textContent = "";
        semesterSelect.replaceChildren(new Option("Choose a semester", ""));
        const semesters = new Map();
        for (const item of curriculum) semesters.set(item.semesterId, `${item.semesterName} · ${item.academicYear}`);
        for (const [id, label] of semesters) semesterSelect.append(new Option(label, id));
        renderSubjectChoices();
        backdrop.hidden = false;
        requestAnimationFrame(() => backdrop.classList.add("is-visible"));
        requestAnimationFrame(() => subjectSelect.focus());
    }

    function closeForm() { backdrop.classList.remove("is-visible"); backdrop.hidden = true; }

    async function refresh() {
        grid.setAttribute("aria-busy", "true");
        try {
            [offerings, curriculum] = await Promise.all([
                api.get("/teacher/offerings"),
                api.get("/teacher/curriculum-subjects")
            ]);
            renderOfferings();
            renderCurriculum();
        } catch (error) {
            grid.replaceChildren(node("p", "course-data-error", error.message || "Offering data could not be loaded."));
            count.textContent = "Unavailable";
            curriculumStatus.textContent = "Official curriculum could not be loaded.";
            curriculumStatus.classList.add("is-error");
        } finally { grid.removeAttribute("aria-busy"); }
    }

    addButton.addEventListener("click", openForm);
    semesterSelect.addEventListener("change", renderSubjectChoices);
    document.querySelector("#cancelOfferingBtn").addEventListener("click", closeForm);
    document.querySelector("#closeOfferingBtn")?.addEventListener("click", closeForm);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeForm(); });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveButton.disabled = true;
        try {
            const created = await api.post("/teacher/offerings", {
                curriculumSubjectId: subjectSelect.value,
                semesterId: semesterSelect.value,
                sectionCode: sectionInput.value,
                description: descriptionInput.value
            });
            closeForm();
            await refresh();
            window.location.href = `course-detail.html?id=${encodeURIComponent(created.id)}`;
        } catch (error) { message(formMessage, error.message, true); }
        finally { saveButton.disabled = false; }
    });
    void refresh();
})();
