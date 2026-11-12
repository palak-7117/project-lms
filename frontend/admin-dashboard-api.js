(() => {
    const api = window.LearnSpaceApi;
    const state = { students: [], teachers: [], semesters: [], subjects: [], requests: [] };
    const byId = (id) => document.getElementById(id);
    const escStatus = (value) => String(value || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");

    function announce(id, message, error = false) {
        const element = byId(id);
        if (!element) return;
        element.textContent = message;
        element.classList.toggle("is-error", error);
    }

    function addCell(row, text) {
        const cell = document.createElement("td");
        cell.textContent = text == null || text === "" ? "—" : String(text);
        row.append(cell);
        return cell;
    }

    function addBadge(row, text) {
        const cell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = `directory-status is-${escStatus(text)}`;
        badge.textContent = text || "unknown";
        cell.append(badge);
        row.append(cell);
    }

    function button(label, className, onClick) {
        const control = document.createElement("button");
        control.type = "button";
        control.className = className;
        control.textContent = label;
        control.addEventListener("click", onClick);
        return control;
    }

    async function runAction(action, messageId, fallback) {
        try {
            await action();
            await refresh();
            if (messageId) announce(messageId, fallback || "Saved.");
        } catch (error) {
            if (messageId) announce(messageId, error.message || "The change could not be saved.", true);
            else announce("sessionIndicator", error.message || "The change could not be saved.", true);
        }
    }

    function addActionCell(row) {
        const cell = document.createElement("td");
        const group = document.createElement("div");
        group.className = "student-authorization-actions";
        cell.append(group);
        row.append(cell);
        return group;
    }

    function filteredStudents() {
        const search = (byId("studentDirectorySearch")?.value || "").trim().toLowerCase();
        const admission = byId("studentAdmissionFilter")?.value || "";
        const authorization = byId("studentAuthorizationFilter")?.value || "";
        const semester = byId("studentSemesterFilter")?.value || "";
        return state.students.filter((student) => {
            const text = `${student.displayName} ${student.email}`.toLowerCase();
            return (!search || text.includes(search)) &&
                (!admission || student.admissionStatus === admission) &&
                (!authorization || student.authorizationStatus === authorization) &&
                (!semester || student.currentSemesterId === semester);
        });
    }

    function renderStudents() {
        const tbody = byId("studentDirectoryRows");
        tbody.replaceChildren();
        const students = filteredStudents();
        for (const student of students) {
            const row = document.createElement("tr");
            addCell(row, student.displayName);
            addCell(row, student.email);
            addBadge(row, student.accountStatus);
            addBadge(row, student.admissionStatus);
            addBadge(row, student.authorizationStatus);
            addCell(row, student.semesterName ? `${student.semesterName} (${student.academicYear})` : "Not allocated");
            const actions = addActionCell(row);
            actions.append(button("Edit", "student-admission-button", async () => {
                const displayName = prompt("Student name", student.displayName);
                if (displayName === null) return;
                const email = prompt("Student email", student.email);
                if (email === null) return;
                await runAction(() => api.patch(`/admin/users/${student.userId}`, { displayName, email }));
            }));
            const nextStatus = student.accountStatus === "active" ? "disabled" : "active";
            actions.append(button(nextStatus === "active" ? "Activate account" : "Deactivate account", "student-admission-button", () =>
                runAction(() => api.patch(`/admin/users/${student.userId}/status`, { accountStatus: nextStatus }))));
            const admission = student.admissionStatus === "admitted" ? "rejected" : "admitted";
            actions.append(button(admission === "admitted" ? "Admit" : "Reject admission", `student-admission-button ${admission === "admitted" ? "is-approve" : "is-reject"}`, () =>
                runAction(() => api.patch(`/admin/students/${student.profileId}/admission`, { admissionStatus: admission }))));
            const authorization = student.authorizationStatus === "authorized" ? "revoked" : "authorized";
            actions.append(button(authorization === "authorized" ? "Authorize" : "Revoke access", `student-admission-button ${authorization === "authorized" ? "is-approve" : "is-reject"}`, () =>
                runAction(() => api.patch(`/admin/students/${student.profileId}/authorization`, { authorizationStatus: authorization }))));

            const select = document.createElement("select");
            select.setAttribute("aria-label", `Allocate ${student.displayName} to a semester`);
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Choose semester";
            select.append(placeholder);
            for (const semester of state.semesters.filter((item) => item.status === "active")) {
                const option = document.createElement("option");
                option.value = semester.id;
                option.textContent = `${semester.name} (${semester.academicYear})`;
                select.append(option);
            }
            actions.append(select, button("Allocate", "student-admission-button", () => {
                if (!select.value) return announce("studentDirectoryStatus", "Choose an active semester first.", true);
                runAction(() => api.post(`/admin/students/${student.profileId}/allocation`, { semesterId: select.value }), "studentDirectoryStatus", "Semester allocation saved to history.");
            }));
            tbody.append(row);
        }
        byId("studentDirectoryResults").textContent = `Showing ${students.length} of ${state.students.length} Students.`;
        byId("directoryTotalCount").textContent = String(state.students.length);
        byId("directoryAdmittedCount").textContent = String(state.students.filter((student) => student.admissionStatus === "admitted").length);
        byId("directoryPendingCount").textContent = String(state.students.filter((student) => student.admissionStatus === "pending").length);
        byId("studentDirectoryStatus").textContent = state.students.length ? "Student directory loaded from LearnSpace." : "No Student accounts have been created.";
    }

    function renderTeachers() {
        const tbody = byId("teacherDirectoryRows");
        tbody.replaceChildren();
        const search = (byId("teacherDirectorySearch")?.value || "").trim().toLowerCase();
        const filter = byId("teacherAccountStatusFilter")?.value || "";
        const rows = state.teachers.filter((teacher) =>
            (!search || `${teacher.displayName} ${teacher.email} ${teacher.profileId}`.toLowerCase().includes(search)) &&
            (!filter || teacher.accountStatus === filter));
        for (const teacher of rows) {
            const row = document.createElement("tr");
            addCell(row, teacher.displayName);
            addCell(row, teacher.email);
            addBadge(row, teacher.accountStatus);
            addCell(row, teacher.profileId);
            addCell(row, new Date(teacher.profileCreatedAt).toLocaleDateString());
            addBadge(row, "valid");
            const actions = addActionCell(row);
            actions.append(button("Edit", "student-admission-button", async () => {
                const displayName = prompt("Teacher name", teacher.displayName);
                if (displayName === null) return;
                const email = prompt("Teacher email", teacher.email);
                if (email === null) return;
                await runAction(() => api.patch(`/admin/users/${teacher.userId}`, { displayName, email }));
            }));
            const nextStatus = teacher.accountStatus === "active" ? "disabled" : "active";
            actions.append(button(nextStatus === "active" ? "Activate" : "Deactivate", "student-admission-button", () =>
                runAction(() => api.patch(`/admin/users/${teacher.userId}/status`, { accountStatus: nextStatus }))));
            tbody.append(row);
        }
        byId("teacherDirectoryResults").textContent = `Showing ${rows.length} of ${state.teachers.length} Teachers.`;
        byId("teacherDirectoryStatus").textContent = state.teachers.length ? "Teacher directory loaded from LearnSpace." : "No Teacher accounts have been created.";
        byId("teacherProfileCount").textContent = String(state.teachers.length);
    }

    function renderRequests() {
        const tbody = byId("enrollmentRequestRows");
        tbody.replaceChildren();
        for (const request of state.requests) {
            const row = document.createElement("tr");
            addCell(row, request.studentName);
            addCell(row, request.email);
            addCell(row, `${request.semesterName} (${request.academicYear})`);
            addCell(row, new Date(request.requestedAt).toLocaleString());
            addBadge(row, request.status);
            const actions = addActionCell(row);
            if (request.status === "pending") {
                actions.append(button("Approve", "student-admission-button is-approve", () =>
                    runAction(() => api.patch(`/admin/enrollment-requests/${request.id}/review`, { decision: "approved" }), "enrollmentRequestsStatus", "Request approved and Student allocation recorded.")));
                actions.append(button("Reject", "student-admission-button is-reject", () =>
                    runAction(() => api.patch(`/admin/enrollment-requests/${request.id}/review`, { decision: "rejected" }), "enrollmentRequestsStatus", "Request rejected.")));
            }
            tbody.append(row);
        }
        byId("enrollmentRequestsStatus").textContent = state.requests.length ? "Enrollment requests loaded." : "No enrollment requests have been submitted.";
    }

    function renderSemesters() {
        const list = byId("semesterList");
        list.replaceChildren();
        const filter = byId("studentSemesterFilter");
        const prior = filter.value;
        filter.replaceChildren(new Option("All semesters", ""));
        for (const semester of state.semesters) {
            filter.append(new Option(`${semester.name} (${semester.academicYear})`, semester.id));
            const card = document.createElement("article");
            card.className = "record-card";
            const header = document.createElement("div");
            header.className = "record-card-header";
            const title = document.createElement("h3");
            title.textContent = semester.name;
            const badge = document.createElement("span");
            badge.className = `directory-status is-${escStatus(semester.status)}`;
            badge.textContent = semester.status;
            header.append(title, badge);
            const detail = document.createElement("p");
            detail.textContent = `Academic year: ${semester.academicYear}`;
            const mappings = document.createElement("ul");
            for (const subjectId of semester.subjectIds) {
                const subject = state.subjects.find((item) => item.id === subjectId);
                if (!subject) continue;
                const item = document.createElement("li");
                item.textContent = `${subject.code} — ${subject.name} `;
                item.append(button("Remove mapping", "course-reset-button", () =>
                    runAction(() => api.delete(`/admin/semesters/${semester.id}/subjects/${subject.id}`))));
                mappings.append(item);
            }
            const controls = document.createElement("div");
            controls.className = "course-form-actions";
            const choices = document.createElement("select");
            choices.setAttribute("aria-label", `Subject to add to ${semester.name}`);
            choices.append(new Option("Choose official subject", ""));
            for (const subject of state.subjects.filter((item) => item.status === "active" && !semester.subjectIds.includes(item.id))) {
                choices.append(new Option(`${subject.code} — ${subject.name}`, subject.id));
            }
            controls.append(choices, button("Map subject", "course-submit-button", () => {
                if (!choices.value) return announce("semesterViewStatus", "Choose an unmapped active subject.", true);
                runAction(() => api.post(`/admin/semesters/${semester.id}/subjects/${choices.value}`, {}));
            }));
            const statusButton = button(semester.status === "active" ? "Deactivate semester" : "Activate semester", "course-reset-button", () =>
                runAction(() => api.patch(`/admin/semesters/${semester.id}`, { status: semester.status === "active" ? "inactive" : "active" })));
            controls.append(statusButton);
            card.append(header, detail, mappings, controls);
            list.append(card);
        }
        if (filter.querySelector(`option[value="${CSS.escape(prior)}"]`)) filter.value = prior;
        byId("semesterSummaryCount").textContent = String(state.semesters.length);
        byId("semesterViewStatus").textContent = state.semesters.length ? "Semester data loaded from LearnSpace." : "No semesters have been created.";
    }

    function renderSubjects() {
        const list = byId("curriculumList");
        list.replaceChildren();
        for (const subject of state.subjects) {
            const card = document.createElement("article");
            card.className = "record-card";
            const header = document.createElement("div");
            header.className = "record-card-header";
            const title = document.createElement("h3");
            title.textContent = `${subject.code} — ${subject.name}`;
            const badge = document.createElement("span");
            badge.className = `directory-status is-${escStatus(subject.status)}`;
            badge.textContent = subject.status;
            header.append(title, badge);
            const detail = document.createElement("p");
            detail.textContent = subject.description || "No description.";
            const mapped = subject.semesterIds.map((id) => state.semesters.find((semester) => semester.id === id)).filter(Boolean);
            const placement = document.createElement("p");
            placement.textContent = mapped.length ? `Semesters: ${mapped.map((item) => `${item.name} (${item.academicYear})`).join(", ")}` : "Not mapped to a semester.";
            const actions = document.createElement("div");
            actions.className = "course-form-actions";
            actions.append(button(subject.status === "active" ? "Deactivate subject" : "Activate subject", "course-reset-button", () =>
                runAction(() => api.patch(`/admin/curriculum-subjects/${subject.id}`, { status: subject.status === "active" ? "inactive" : "active" }))));
            card.append(header, detail, placement, actions);
            list.append(card);
        }
        byId("curriculumSummaryCount").textContent = String(state.subjects.length);
        byId("curriculumViewStatus").textContent = state.subjects.length ? "Curriculum loaded from LearnSpace." : "No official curriculum subjects have been created.";
    }

    async function refresh() {
        try {
            const [summary, students, teachers, semesters, subjects, requests] = await Promise.all([
                api.get("/admin/summary"), api.get("/admin/students"), api.get("/admin/teachers"),
                api.get("/admin/semesters"), api.get("/admin/curriculum-subjects"), api.get("/admin/enrollment-requests")
            ]);
            state.students = students;
            state.teachers = teachers;
            state.semesters = semesters;
            state.subjects = subjects;
            state.requests = requests;
            byId("studentProfileCount").textContent = String(summary.students.total || 0);
            byId("sessionIndicator").textContent = `Signed in as ${api.getCurrentUser()?.displayName || "Admin"}. Changes are stored on the server.`;
            renderStudents(); renderTeachers(); renderRequests(); renderSemesters(); renderSubjects();
        } catch (error) {
            announce("sessionIndicator", error.message || "Admin data could not be loaded.", true);
            for (const id of ["studentDirectoryStatus", "teacherDirectoryStatus", "semesterViewStatus", "curriculumViewStatus", "enrollmentRequestsStatus"]) announce(id, "Data could not be loaded from LearnSpace.", true);
        }
    }

    function formValues(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function wireCreateForm(id, path, statusId, label) {
        const form = byId(id);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const buttonControl = form.querySelector('[type="submit"]');
            buttonControl.disabled = true;
            try {
                await api.post(path, formValues(form));
                form.reset();
                announce(statusId, `${label} created.`);
                await refresh();
            } catch (error) { announce(statusId, error.message, true); }
            finally { buttonControl.disabled = false; }
        });
    }

    wireCreateForm("createStudentForm", "/admin/students", "createStudentStatus", "Student account");
    wireCreateForm("createTeacherForm", "/admin/teachers", "createTeacherStatus", "Teacher account");

    const semesterForm = byId("addSemesterForm");
    semesterForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const buttonControl = byId("addSemesterSubmitButton"); buttonControl.disabled = true;
        try {
            await api.post("/admin/semesters", { name: byId("semesterName").value, academicYear: byId("semesterAcademicYear").value });
            semesterForm.reset(); announce("semesterFormStatus", "Semester created."); await refresh();
        } catch (error) { announce("semesterFormStatus", error.message, true); }
        finally { buttonControl.disabled = false; }
    });
    const courseForm = byId("addCourseForm");
    courseForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const buttonControl = byId("courseSubmitButton"); buttonControl.disabled = true;
        try {
            await api.post("/admin/curriculum-subjects", { code: byId("courseCode").value, name: byId("courseName").value, description: byId("courseDescription").value });
            courseForm.reset(); announce("courseFormStatus", "Official curriculum subject created."); await refresh();
        } catch (error) { announce("courseFormStatus", error.message, true); }
        finally { buttonControl.disabled = false; }
    });

    for (const id of ["studentDirectorySearch", "studentAdmissionFilter", "studentAuthorizationFilter", "studentSemesterFilter", "teacherDirectorySearch", "teacherAccountStatusFilter"]) {
        byId(id)?.addEventListener("input", () => { renderStudents(); renderTeachers(); });
        byId(id)?.addEventListener("change", () => { renderStudents(); renderTeachers(); });
    }
    byId("resetStudentFilters").addEventListener("click", () => {
        for (const id of ["studentDirectorySearch", "studentAdmissionFilter", "studentAuthorizationFilter", "studentSemesterFilter"]) byId(id).value = "";
        renderStudents();
    });
    byId("resetTeacherFilters").addEventListener("click", () => {
        byId("teacherDirectorySearch").value = ""; byId("teacherAccountStatusFilter").value = ""; renderTeachers();
    });

    void refresh();
    window.LearnSpaceAdminRefresh = refresh;
})();
