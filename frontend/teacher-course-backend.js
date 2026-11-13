"use strict";

(() => {
    const api = window.LearnSpaceApi;
    const params = new URLSearchParams(window.location.search);
    const offeringId = params.get("offeringId") || params.get("id");
    const content = document.querySelector("#courseTabContent");
    const tabs = [...document.querySelectorAll(".course-tab")];
    let detail = null;
    let activeTab = "materials";

    const element = (tag, className, text) => {
        const item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined) item.textContent = text;
        return item;
    };
    function formatDate(value) {
        if (!value) return "Not set";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    function field(labelText, name, type = "text", required = false) {
        const wrapper = element("div", "course-field");
        const label = element("label", "", labelText);
        label.htmlFor = name;
        const input = document.createElement(type === "textarea" ? "textarea" : "input");
        input.id = name;
        input.name = name;
        if (type !== "textarea") input.type = type;
        if (required) input.required = true;
        wrapper.append(label, input);
        return wrapper;
    }
    function message(target, text, isError = false) {
        target.textContent = text;
        target.classList.toggle("error", isError);
    }
    function downloadLink(fileAssetId, filename) {
        const link = element("a", "card-action", filename || "Download file");
        link.href = `${api.baseUrl}/files/${encodeURIComponent(fileAssetId)}`;
        return link;
    }
    function showPageError(text) {
        document.querySelector("#courseTitle").textContent = "Course unavailable";
        content.replaceChildren(element("p", "course-message error", text));
    }
    function baseTab(title, intro) {
        content.replaceChildren();
        const heading = element("div", "course-section-heading");
        const copy = element("div", "course-section-heading-text");
        copy.append(element("h2", "", title), element("p", "course-section-intro", intro));
        heading.append(copy);
        content.append(heading);
    }
    function refreshHeader() {
        const item = detail.offering;
        document.title = `LearnSpace | ${item.subjectName}`;
        document.querySelector("#courseTitle").textContent = item.subjectName;
        document.querySelector("#courseInstructor").textContent = item.teacherName || api.getCurrentUser()?.displayName || "You";
        document.querySelector("#studentCount").textContent = String(detail.eligibleStudentCount);
        document.querySelector("#courseDescription").textContent =
            `${item.description || "No course description."} · ${item.semesterName} · ${item.academicYear} · Section ${item.sectionCode || "—"}`;
    }
    async function refresh() {
        if (!offeringId) return showPageError("No offering was selected.");
        try {
            detail = await api.get(`/teacher/offerings/${encodeURIComponent(offeringId)}`);
            refreshHeader();
            renderTab(activeTab);
        } catch (error) { showPageError(error.message || "Offering details could not be loaded."); }
    }
    function renderMaterials() {
        baseTab("Books & Notes", "Upload private course materials or share a secure HTTPS resource link.");
        const form = document.createElement("form");
        form.className = "course-editor-form";
        form.innerHTML = `
            <div class="course-field"><label for="materialTitle">Title</label><input id="materialTitle" name="title" required maxlength="200"></div>
            <div class="course-field"><label for="materialType">Type</label><select id="materialType" name="materialType"><option value="notes">Notes</option><option value="book">Book</option><option value="resource">Resource</option></select></div>
            <div class="course-field"><label for="materialDescription">Description</label><textarea id="materialDescription" name="description" rows="3"></textarea></div>
            <div class="course-field"><label for="materialFile">Upload file (optional for link)</label><input id="materialFile" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"></div>
            <div class="course-field"><label for="materialUrl">HTTPS resource link</label><input id="materialUrl" name="externalUrl" type="url" placeholder="https://…"></div>
            <p class="course-form-message" id="materialMessage" role="status"></p>
            <div class="course-form-actions"><button class="course-primary-btn" type="submit">Add material</button></div>`;
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            const data = new FormData();
            data.append("title", form.elements.title.value);
            data.append("materialType", form.elements.materialType.value);
            data.append("description", form.elements.description.value);
            data.append("externalUrl", form.elements.externalUrl.value);
            if (form.elements.file.files[0]) data.append("files", form.elements.file.files[0]);
            button.disabled = true;
            try { await api.postMultipart(`/teacher/offerings/${offeringId}/materials`, data); await refresh(); }
            catch (error) { message(form.querySelector("#materialMessage"), error.message, true); }
            finally { button.disabled = false; }
        });
        content.append(form);
        const list = element("div", "course-content-list");
        for (const material of detail.materials) {
            const card = element("article", "course-content-card");
            card.append(element("h3", "", material.title), element("p", "", material.description || material.materialType));
            const actions = element("div", "course-form-actions");
            if (material.fileAssetId) actions.append(downloadLink(material.fileAssetId, material.filename || "Download material"));
            if (material.externalUrl) {
                const external = element("a", "card-action", "Open resource");
                external.href = material.externalUrl; external.target = "_blank"; external.rel = "noopener noreferrer";
                actions.append(external);
            }
            const edit = element("button", "course-secondary-btn", "Edit details");
            edit.type = "button";
            edit.addEventListener("click", async () => {
                const title = window.prompt("Material title", material.title);
                if (title === null) return;
                const description = window.prompt("Material description", material.description || "");
                if (description === null) return;
                try { await api.patch(`/teacher/materials/${material.id}`, { title, description }); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const remove = element("button", "course-danger-btn", "Delete");
            remove.type = "button";
            remove.addEventListener("click", async () => {
                if (!window.confirm("Delete this material? A shared file remains available to other retained records.")) return;
                try { await api.delete(`/teacher/materials/${material.id}`); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            actions.append(edit, remove);
            card.append(actions); list.append(card);
        }
        if (!detail.materials.length) list.append(element("p", "course-empty-state", "No learning materials have been added yet."));
        content.append(list);
    }
    function renderAssignments() {
        baseTab("Assignments", "Create work, review submissions, and return grades and feedback.");
        const form = document.createElement("form");
        form.className = "course-editor-form";
        const title = field("Assignment title", "assignmentTitle", "text", true);
        const description = field("Description", "assignmentDescription", "textarea");
        const start = field("Starts", "assignmentStart", "datetime-local", true);
        const due = field("Due", "assignmentDue", "datetime-local", true);
        const marks = field("Maximum marks", "assignmentMarks", "number", true);
        marks.querySelector("input").min = "0.01"; marks.querySelector("input").step = "0.01";
        form.append(title, description, start, due, marks);
        const statusWrap = element("div", "course-field");
        statusWrap.innerHTML = '<label for="assignmentStatus">Visibility</label><select id="assignmentStatus" name="status"><option value="published">Published</option><option value="draft">Draft</option></select>';
        form.append(statusWrap);
        const feedback = element("p", "course-form-message");
        feedback.id = "assignmentMessage";
        form.append(feedback);
        const actions = element("div", "course-form-actions");
        const submit = element("button", "course-primary-btn", "Create assignment"); submit.type = "submit";
        actions.append(submit); form.append(actions);
        form.addEventListener("submit", async (event) => {
            event.preventDefault(); submit.disabled = true;
            try {
                await api.post(`/teacher/offerings/${offeringId}/assignments`, {
                    title: form.elements.assignmentTitle.value, description: form.elements.assignmentDescription.value,
                    startAt: new Date(form.elements.assignmentStart.value).toISOString(), dueAt: new Date(form.elements.assignmentDue.value).toISOString(),
                    maximumMarks: form.elements.assignmentMarks.value, status: form.elements.status.value
                });
                await refresh();
            } catch (error) { message(feedback, error.message, true); }
            finally { submit.disabled = false; }
        });
        content.append(form);
        const list = element("div", "course-content-list");
        for (const assignment of detail.assignments) {
            const card = element("article", "course-content-card");
            card.append(element("h3", "", assignment.title));
            card.append(element("p", "", assignment.description || "No description."));
            card.append(element("p", "", `Opens ${formatDate(assignment.startAt)} · Due ${formatDate(assignment.dueAt)} · Maximum ${assignment.marks ?? "Not set"} · ${assignment.status}`));
            card.append(element("p", "", `${assignment.submittedCount || 0} submitted / ${assignment.submissionCount || 0} records`));
            const buttons = element("div", "course-form-actions");
            const edit = element("button", "course-secondary-btn", "Edit assignment");
            edit.type = "button";
            edit.addEventListener("click", async () => {
                const titleValue = window.prompt("Assignment title", assignment.title);
                if (titleValue === null) return;
                const marksValue = window.prompt("Maximum marks", assignment.marks || "");
                if (marksValue === null) return;
                try { await api.patch(`/teacher/assignments/${assignment.id}`, { title: titleValue, marks: marksValue }); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const remove = element("button", "course-danger-btn", "Delete assignment and submissions");
            remove.type = "button";
            remove.addEventListener("click", async () => {
                if (!window.confirm("Permanently delete this assignment and its submissions?")) return;
                try { await api.delete(`/teacher/assignments/${assignment.id}`); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const show = element("button", "course-secondary-btn", "Review submissions");
            show.type = "button";
            show.addEventListener("click", async () => {
                try { renderSubmissions(card, assignment, await api.get(`/teacher/assignments/${assignment.id}/submissions`)); }
                catch (error) { window.alert(error.message); }
            });
            buttons.append(edit, remove, show); card.append(buttons); list.append(card);
        }
        if (!detail.assignments.length) list.append(element("p", "course-empty-state", "No assignments have been created yet."));
        content.append(list);
    }
    function renderSubmissions(card, assignment, rows) {
        card.querySelector(".submission-review-list")?.remove();
        const list = element("div", "submission-review-list");
        if (!rows.length) list.append(element("p", "", "No submitted work to review yet."));
        for (const submission of rows) {
            const item = element("section", "course-content-card");
            item.append(element("h4", "", submission.studentName), element("p", "", `${submission.email} · ${submission.status} · ${formatDate(submission.submittedAt)}`));
            if (submission.grade !== null && submission.grade !== undefined) item.append(element("p", "", `Current grade: ${submission.grade} / ${assignment.marks}`));
            const files = element("div", "course-form-actions");
            for (const file of submission.files || []) files.append(downloadLink(file.fileAssetId, file.filename));
            item.append(files);
            const gradeForm = document.createElement("form");
            gradeForm.className = "course-editor-form";
            const grade = field("Grade", `grade-${submission.id}`, "number", true);
            grade.querySelector("input").min = "0"; grade.querySelector("input").max = String(assignment.marks || 999999);
            grade.querySelector("input").step = "0.01"; grade.querySelector("input").value = submission.grade ?? "";
            const feedback = field("Feedback", `feedback-${submission.id}`, "textarea");
            feedback.querySelector("textarea").value = submission.feedback || "";
            gradeForm.append(grade, feedback);
            const gradeMessage = element("p", "course-form-message");
            const save = element("button", "course-primary-btn", "Save grade and feedback"); save.type = "submit";
            const controls = element("div", "course-form-actions"); controls.append(save);
            gradeForm.append(gradeMessage, controls);
            gradeForm.addEventListener("submit", async (event) => {
                event.preventDefault(); save.disabled = true;
                try {
                    await api.patch(`/teacher/submissions/${submission.id}/grade`, { grade: grade.querySelector("input").value, feedback: feedback.querySelector("textarea").value });
                    message(gradeMessage, "Grade and feedback saved.");
                    const updated = await api.get(`/teacher/assignments/${assignment.id}/submissions`);
                    renderSubmissions(card, assignment, updated);
                } catch (error) { message(gradeMessage, error.message, true); }
                finally { save.disabled = false; }
            });
            item.append(gradeForm); list.append(item);
        }
        card.append(list);
    }
    function renderQuizzes() {
        baseTab("Google Forms quizzes", "LearnSpace stores quiz metadata and opens the linked Google Form.");
        const form = document.createElement("form");
        form.className = "course-editor-form";
        form.innerHTML = `
            <div class="course-field"><label for="quizTitle">Title</label><input id="quizTitle" name="title" required maxlength="200"></div>
            <div class="course-field"><label for="quizUrl">Google Forms URL</label><input id="quizUrl" name="googleFormUrl" type="url" required placeholder="https://docs.google.com/forms/..."></div>
            <div class="course-field"><label for="quizDescription">Description</label><textarea id="quizDescription" name="description"></textarea></div>
            <div class="course-field"><label for="quizDuration">Duration (minutes)</label><input id="quizDuration" name="durationMinutes" type="number" min="1" max="600" value="60" required></div>
            <div class="course-field"><label for="quizStart">Opens</label><input id="quizStart" name="startAt" type="datetime-local" required></div>
            <div class="course-field"><label for="quizDue">Closes</label><input id="quizDue" name="dueAt" type="datetime-local" required></div>
            <div class="course-field"><label for="quizStatus">Visibility</label><select id="quizStatus" name="status"><option value="published">Published</option><option value="draft">Draft</option></select></div>
            <p class="course-form-message" id="quizMessage"></p>
            <div class="course-form-actions"><button class="course-primary-btn" type="submit">Create quiz</button></div>`;
        form.addEventListener("submit", async (event) => {
            event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
            try {
                await api.post(`/teacher/offerings/${offeringId}/quizzes`, {
                    title: form.elements.title.value, googleFormUrl: form.elements.googleFormUrl.value,
                    description: form.elements.description.value, durationMinutes: form.elements.durationMinutes.value,
                    startAt: new Date(form.elements.startAt.value).toISOString(), dueAt: new Date(form.elements.dueAt.value).toISOString(), status: form.elements.status.value
                });
                await refresh();
            } catch (error) { message(form.querySelector("#quizMessage"), error.message, true); }
            finally { button.disabled = false; }
        });
        content.append(form);
        const list = element("div", "course-content-list");
        for (const quiz of detail.quizzes) {
            const card = element("article", "course-content-card");
            card.append(element("h3", "", quiz.title), element("p", "", quiz.description || ""), element("p", "", `Opens ${formatDate(quiz.startAt)} · Closes ${formatDate(quiz.dueAt)} · ${quiz.durationMinutes} minutes · ${quiz.status}`));
            const controls = element("div", "course-form-actions");
            const edit = element("button", "course-secondary-btn", "Edit quiz"); edit.type = "button";
            edit.addEventListener("click", async () => {
                const url = window.prompt("Google Forms URL", quiz.googleFormUrl);
                if (url === null) return;
                try { await api.patch(`/teacher/quizzes/${quiz.id}`, { googleFormUrl: url }); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            const remove = element("button", "course-danger-btn", "Delete quiz"); remove.type = "button";
            remove.addEventListener("click", async () => {
                if (!window.confirm("Delete this Google Forms quiz record?")) return;
                try { await api.delete(`/teacher/quizzes/${quiz.id}`); await refresh(); }
                catch (error) { window.alert(error.message); }
            });
            controls.append(edit, remove); card.append(controls); list.append(card);
        }
        if (!detail.quizzes.length) list.append(element("p", "course-empty-state", "No Google Forms quizzes have been added."));
        content.append(list);
    }
    function renderAttendance() {
        baseTab("Attendance", "Create sessions and record attendance for Students allocated to this offering's semester.");
        const form = document.createElement("form");
        form.className = "course-editor-form";
        form.innerHTML = `
            <div class="course-field"><label for="attendanceTitle">Session title</label><input id="attendanceTitle" name="title" required maxlength="200"></div>
            <div class="course-field"><label for="attendanceStart">Starts</label><input id="attendanceStart" name="startsAt" type="datetime-local" required></div>
            <div class="course-field"><label for="attendanceEnd">Ends</label><input id="attendanceEnd" name="endsAt" type="datetime-local"></div>
            <p class="course-form-message" id="attendanceMessage"></p>
            <div class="course-form-actions"><button class="course-primary-btn" type="submit">Create attendance session</button></div>`;
        form.addEventListener("submit", async (event) => {
            event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
            try {
                await api.post(`/teacher/offerings/${offeringId}/attendance-sessions`, {
                    title: form.elements.title.value, startsAt: new Date(form.elements.startsAt.value).toISOString(),
                    endsAt: form.elements.endsAt.value ? new Date(form.elements.endsAt.value).toISOString() : null, status: "held"
                });
                await refresh();
            } catch (error) { message(form.querySelector("#attendanceMessage"), error.message, true); }
            finally { button.disabled = false; }
        });
        content.append(form);
        const list = element("div", "course-content-list");
        for (const session of detail.attendanceSessions) {
            const card = element("article", "course-content-card");
            card.append(element("h3", "", session.title), element("p", "", `${formatDate(session.startsAt)} · ${session.status} · ${session.markedCount || 0} records marked`));
            const button = element("button", "course-secondary-btn", "Take or correct attendance"); button.type = "button";
            button.addEventListener("click", async () => {
                try { renderRoster(card, await api.get(`/teacher/attendance-sessions/${session.id}/roster`)); }
                catch (error) { window.alert(error.message); }
            });
            card.append(button); list.append(card);
        }
        if (!detail.attendanceSessions.length) list.append(element("p", "course-empty-state", "No attendance sessions have been created."));
        content.append(list);
    }
    function renderRoster(card, roster) {
        card.querySelector(".attendance-roster")?.remove();
        const list = element("div", "attendance-roster course-content-list");
        for (const student of roster.students) {
            const row = element("div", "course-content-card");
            row.append(element("strong", "", student.studentName));
            const select = document.createElement("select");
            select.setAttribute("aria-label", `Attendance for ${student.studentName}`);
            for (const status of ["present", "absent", "late", "excused"]) select.append(new Option(status, status));
            if (student.attendanceStatus) select.value = student.attendanceStatus;
            const result = element("span", "course-form-message");
            select.addEventListener("change", async () => {
                select.disabled = true;
                try {
                    await api.put(`/teacher/attendance-sessions/${roster.session.id}/records/${student.studentProfileId}`, { attendanceStatus: select.value, note: student.note || "" });
                    message(result, "Saved.");
                } catch (error) { message(result, error.message, true); }
                finally { select.disabled = false; }
            });
            row.append(select, result); list.append(row);
        }
        if (!roster.students.length) list.append(element("p", "course-empty-state", "No eligible Students are allocated to this semester."));
        card.append(list);
    }
    function renderTab(name) {
        activeTab = name;
        tabs.forEach((tab) => {
            const active = tab.dataset.tab === name;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        if (!detail) return;
        if (name === "materials") renderMaterials();
        else if (name === "assignments") renderAssignments();
        else if (name === "quizzes") renderQuizzes();
        else renderAttendance();
    }
    tabs.forEach((tab) => tab.addEventListener("click", () => renderTab(tab.dataset.tab)));
    void refresh();
})();
