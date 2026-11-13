"use strict";

(() => {
    const api = window.LearnSpaceApi;
    const offeringId = new URLSearchParams(window.location.search).get("offeringId") ||
        new URLSearchParams(window.location.search).get("course");
    const courseContent = document.querySelector("#courseContent");
    const pageMessage = document.querySelector("#pageMessage");
    const tabs = [...document.querySelectorAll(".course-tab")];
    const panels = [...document.querySelectorAll("[data-course-panel]")];
    const dialog = document.querySelector("#assignmentDialog");
    let detail = null;
    let activeAssignment = null;

    const element = (tag, className, text) => {
        const item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined) item.textContent = text;
        return item;
    };
    function showError(text) {
        courseContent.hidden = true;
        pageMessage.hidden = false;
        pageMessage.textContent = text;
    }
    function formatDate(value) {
        if (!value) return "Not set";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    function downloadLink(file) {
        const link = element("a", "card-action", file.filename || "Download file");
        link.href = `${api.baseUrl}/files/${encodeURIComponent(file.fileAssetId)}`;
        return link;
    }
    function renderHeader() {
        const offering = detail.offering;
        document.title = `LearnSpace | ${offering.subjectName}`;
        document.querySelector("#courseTitle").textContent = offering.subjectName;
        document.querySelector("#courseIcon").textContent = "✳";
        const name = offering.teacherName || "Instructor";
        document.querySelector("#instructorName").textContent = name;
        document.querySelector("#instructorInitials").textContent = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
        document.querySelector("#attendanceUnavailable").textContent = "Attendance records are shown in the Attendance tab.";
    }
    function renderMaterials() {
        const list = document.querySelector("#resourceList");
        list.replaceChildren();
        for (const material of detail.materials) {
            const card = element("article", "resource-card");
            card.append(element("span", `file-icon ${material.materialType === "notes" ? "notes" : "other"}`, material.materialType.slice(0, 3).toUpperCase()));
            const copy = element("div", "resource-copy");
            copy.append(element("h3", "", material.title), element("p", "", material.description || material.materialType));
            card.append(copy);
            if (material.fileAssetId) card.append(downloadLink({ fileAssetId: material.fileAssetId, filename: material.filename || "Download" }));
            else if (material.externalUrl) {
                const link = element("a", "card-action", "Open resource");
                link.href = material.externalUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
                card.append(link);
            } else card.append(element("span", "", "Unavailable"));
            list.append(card);
        }
        if (!detail.materials.length) list.append(element("p", "empty-state", "Your Teacher has not added materials yet."));
    }
    function renderAssignments() {
        const list = document.querySelector("#assignmentList");
        list.replaceChildren();
        for (const assignment of detail.assignments) {
            const card = element("article", "assignment-card");
            card.append(element("span", "file-icon assignment", "TASK"));
            const copy = element("div", "assignment-copy");
            copy.append(element("h3", "", assignment.title), element("p", "", assignment.description || "No additional instructions."));
            const meta = element("div", "assignment-meta");
            meta.append(element("span", "status-pill", `Due ${formatDate(assignment.dueAt)}`));
            if (assignment.maximumMarks != null) meta.append(element("span", "status-pill", `Maximum ${assignment.maximumMarks}`));
            if (assignment.submissionStatus) meta.append(element("span", `status-pill ${assignment.submissionStatus}`, `Status: ${assignment.submissionStatus}`));
            copy.append(meta);
            if (assignment.grade !== null && assignment.grade !== undefined) {
                copy.append(element("p", "", `Grade: ${assignment.grade} / ${assignment.maximumMarks}`));
                if (assignment.feedback) copy.append(element("p", "", `Teacher feedback: ${assignment.feedback}`));
            }
            const footer = element("div", "assignment-footer");
            const files = element("div", "assignment-meta");
            for (const file of assignment.files || []) files.append(downloadLink(file));
            footer.append(files);
            const open = element("button", "primary-button", assignment.submissionStatus === "submitted" || assignment.submissionStatus === "graded" ? "View submission" : "Open assignment");
            open.type = "button";
            open.addEventListener("click", () => openAssignment(assignment));
            footer.append(open);
            copy.append(footer);
            card.append(copy);
            list.append(card);
        }
        if (!detail.assignments.length) list.append(element("p", "empty-state", "There are no published assignments for this offering."));
    }
    function renderQuizzes() {
        const list = document.querySelector("#quizList");
        list.replaceChildren();
        for (const quiz of detail.quizzes) {
            const card = element("article", "quiz-card");
            const copy = element("div", "quiz-copy");
            copy.append(element("h3", "", quiz.title), element("p", "", quiz.description || "Open the Google Form to complete this quiz."));
            const meta = element("div", "quiz-meta");
            meta.append(element("span", "", `Opens ${formatDate(quiz.startAt)}`), element("span", "", `Closes ${formatDate(quiz.dueAt)}`), element("span", "", `${quiz.durationMinutes} minutes`));
            copy.append(meta);
            const actionWrap = element("div", "quiz-action-wrap");
            const link = element("a", "primary-button", "Open Google Form");
            link.href = quiz.googleFormUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
            actionWrap.append(link); card.append(copy, actionWrap); list.append(card);
        }
        if (!detail.quizzes.length) list.append(element("p", "empty-state", "There are no published Google Forms quizzes for this offering."));
    }
    function renderAttendance() {
        const list = document.querySelector("#attendanceList");
        list.replaceChildren();
        const { summary, sessions } = detail.attendance;
        const total = Number(summary.sessions || 0);
        const present = Number(summary.present || 0);
        const rate = total ? Math.round((present / total) * 100) : null;
        list.append(element("article", "resource-card", total ? `Attendance: ${present} of ${total} sessions (${rate}%)` : "No attendance sessions have been recorded yet."));
        for (const session of sessions) {
            const card = element("article", "resource-card");
            const copy = element("div", "resource-copy");
            copy.append(element("h3", "", session.title), element("p", "", formatDate(session.startsAt)));
            card.append(copy, element("span", "status-pill", session.attendanceStatus || "Not marked"));
            if (session.attendanceStatus === "late" || session.attendanceStatus === "excused") {
                const record = detail.attendance.sessions.find((item) => item.id === session.id);
                if (record?.note) card.append(element("p", "", record.note));
            }
            list.append(card);
        }
    }
    function renderAll() {
        renderHeader(); renderMaterials(); renderAssignments(); renderQuizzes(); renderAttendance();
        pageMessage.hidden = true; courseContent.hidden = false;
    }
    async function refresh() {
        if (!offeringId) return showError("No course offering was selected.");
        try {
            detail = await api.get(`/student/offerings/${encodeURIComponent(offeringId)}`);
            renderAll();
        } catch (error) { showError(error.message || "This course is not available for your current semester."); }
    }
    function openAssignment(assignment) {
        activeAssignment = assignment;
        document.querySelector("#assignmentDialogTitle").textContent = assignment.title;
        document.querySelector("#assignmentDialogDescription").textContent = assignment.description || "";
        const meta = document.querySelector("#assignmentDialogMeta");
        meta.replaceChildren(element("span", "status-pill", `Due: ${formatDate(assignment.dueAt)}`));
        if (assignment.maximumMarks != null) meta.append(element("span", "status-pill", `Maximum marks: ${assignment.maximumMarks}`));
        if (assignment.submissionStatus) meta.append(element("span", "status-pill", `Status: ${assignment.submissionStatus}`));
        const references = document.querySelector("#referenceFiles");
        const referenceList = document.querySelector("#referenceFileList");
        referenceList.replaceChildren();
        for (const file of assignment.files || []) referenceList.append(downloadLink(file));
        references.hidden = !(assignment.files || []).length;
        document.querySelector("#submissionFile").value = "";
        document.querySelector("#submissionFileList").replaceChildren();
        for (const file of assignment.files || []) document.querySelector("#submissionFileList").append(downloadLink(file));
        document.querySelector("#submissionMessage").textContent = "";
        const alreadySubmitted = ["submitted", "late", "auto_submitted", "graded"].includes(assignment.submissionStatus);
        document.querySelector("#submissionFile").disabled = alreadySubmitted;
        document.querySelector("#markForReview").disabled = alreadySubmitted;
        document.querySelector("#demoSubmit").disabled = alreadySubmitted;
        document.querySelector("#demoSubmit").textContent = alreadySubmitted ? "Submission recorded" : "Submit assignment";
        if (!dialog.open) dialog.showModal();
    }
    async function saveSubmission(status) {
        if (!activeAssignment) return;
        const message = document.querySelector("#submissionMessage");
        const files = [...document.querySelector("#submissionFile").files];
        const form = new FormData();
        form.append("status", status);
        for (const file of files) form.append("files", file);
        const buttons = [document.querySelector("#markForReview"), document.querySelector("#demoSubmit")];
        buttons.forEach((button) => { button.disabled = true; });
        try {
            await api.postMultipart(`/student/offerings/${offeringId}/assignments/${activeAssignment.id}/submission`, form);
            const confirmation = status === "draft" ? "Draft saved. Your Teacher cannot see it until you submit." : "Assignment submitted securely.";
            await refresh();
            const refreshed = detail.assignments.find((item) => item.id === activeAssignment.id);
            if (refreshed) openAssignment(refreshed);
            message.textContent = confirmation;
        } catch (error) {
            message.textContent = error.message || "Submission could not be saved.";
            message.classList.add("is-error");
        } finally {
            buttons.forEach((button) => { button.disabled = false; });
            if (activeAssignment && ["submitted", "late", "auto_submitted", "graded"].includes(activeAssignment.submissionStatus)) {
                document.querySelector("#submissionFile").disabled = true;
                document.querySelector("#markForReview").disabled = true;
                document.querySelector("#demoSubmit").disabled = true;
            }
        }
    }
    tabs.forEach((tab) => tab.addEventListener("click", () => {
        const selected = tab.dataset.panel;
        tabs.forEach((item) => {
            const active = item === tab;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-selected", String(active));
        });
        panels.forEach((panel) => { panel.hidden = panel.dataset.coursePanel !== selected; });
    }));
    document.querySelector("#submissionFile").addEventListener("change", () => {
        const list = document.querySelector("#submissionFileList");
        list.replaceChildren();
        for (const file of document.querySelector("#submissionFile").files) list.append(element("p", "", `${file.name} · ${Math.ceil(file.size / 1024)} KB`));
    });
    document.querySelector("#markForReview").addEventListener("click", () => saveSubmission("draft"));
    document.querySelector("#demoSubmit").addEventListener("click", () => saveSubmission("submitted"));
    document.querySelector("#closeAssignment").addEventListener("click", () => dialog.close());
    void refresh();
})();
