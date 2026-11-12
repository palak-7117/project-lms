(() => {
    const form = document.querySelector("#studentEnrollmentForm");
    if (!form) return;
    const select = document.querySelector("#studentEnrollmentSemester");
    const status = document.querySelector("#studentEnrollmentStatus");
    const list = document.querySelector("#studentEnrollmentRequests");

    function showStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    }

    function renderRequests(requests) {
        list.replaceChildren();
        for (const request of requests) {
            const card = document.createElement("article");
            card.className = "course-content-card";
            const title = document.createElement("h3");
            title.textContent = `${request.semesterName} · ${request.academicYear}`;
            const detail = document.createElement("p");
            detail.textContent = `Status: ${request.status}${request.reviewNote ? ` · ${request.reviewNote}` : ""}`;
            card.append(title, detail);
            if (request.status === "pending") {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "course-reset-button";
                button.textContent = "Withdraw request";
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    try {
                        await window.LearnSpaceApi.post(`/student/enrollment-requests/${request.id}/withdraw`, {});
                        await refreshRequests();
                        showStatus("Enrollment request withdrawn. You may send another request.");
                    } catch (error) {
                        showStatus(error.message, true);
                        button.disabled = false;
                    }
                });
                card.append(button);
            }
            list.append(card);
        }
        const hasPending = requests.some((request) => request.status === "pending");
        select.disabled = hasPending;
        form.querySelector('[type="submit"]').disabled = hasPending || select.options.length <= 1;
        if (hasPending) showStatus("You have a pending request. Withdraw it or wait for an Admin decision.");
    }

    async function refreshRequests() {
        const requests = await window.LearnSpaceApi.get("/student/enrollment-requests");
        renderRequests(requests);
    }

    async function initialize() {
        try {
            const [semesters] = await Promise.all([
                window.LearnSpaceApi.get("/student/enrollment-options"),
                refreshRequests()
            ]);
            for (const semester of semesters) {
                const option = document.createElement("option");
                option.value = semester.id;
                option.textContent = `${semester.name} · ${semester.academicYear}`;
                select.append(option);
            }
            form.querySelector('[type="submit"]').disabled = select.options.length <= 1;
            if (select.options.length <= 1) showStatus("There are no active semesters available for requests.");
        } catch (error) {
            showStatus(error.message || "Enrollment information could not be loaded.", true);
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            await window.LearnSpaceApi.post("/student/enrollment-requests", { semesterId: select.value });
            await refreshRequests();
            showStatus("Your enrollment request was sent to an Admin.");
        } catch (error) {
            showStatus(error.message, true);
            button.disabled = false;
        }
    });

    void initialize();
})();
