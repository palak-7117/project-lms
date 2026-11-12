const assert = require("node:assert/strict");
const path = require("node:path");
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, "../.playwright-browsers");
const { chromium } = require("playwright");
const {
    TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, createIsolatedDatabase,
    startBackend, startFrontend
} = require("./harness");

const STUDENT_EMAIL = "browser-student@learnspace.invalid";
const STUDENT_PASSWORD = "BrowserStudentPassword!2026";
const TEACHER_EMAIL = "browser-teacher@learnspace.invalid";
const TEACHER_PASSWORD = "BrowserTeacherPassword!2026";
const SEMESTER_NAME = "Browser Term";
const SUBJECT_CODE = "BROWSER-101";

async function launchBrowser() {
    try {
        return await chromium.launch({ headless: true });
    } catch (error) {
        // This Windows environment refuses to spawn the unsigned Playwright
        // download (Node surfaces Win32's refusal as EUNKNOWN). Use the signed
        // system Chrome installation without changing security settings.
        if (process.platform !== "win32" || !String(error.message).includes("spawn UNKNOWN")) throw error;
        console.warn("Bundled Chromium process launch was refused; falling back to installed signed Chrome.");
        return chromium.launch({ channel: "chrome", headless: true });
    }
}

async function main() {
    let isolated;
    let frontend;
    let backend;
    let browser;
    try {
        isolated = await createIsolatedDatabase();
        await isolated.seedAdmin();
        frontend = await startFrontend();
        backend = await startBackend(isolated.name, frontend.origin);
        browser = await launchBrowser();
        console.log(`Browser engine: Chrome ${browser.version()}`);
        const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
        await context.addInitScript((baseUrl) => { window.LEARNSPACE_API_BASE = baseUrl; }, backend.baseUrl);
        const page = await context.newPage();
        const consoleErrors = [];
        const failedRequests = [];
        const forbiddenResponses = [];
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        page.on("pageerror", (error) => consoleErrors.push(error.message));
        page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown failure"})`));
        page.on("response", (response) => { if (response.status() === 403) forbiddenResponses.push(response.url()); });
        await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

        const base = frontend.origin;
        await page.goto(`${base}/index.html`);
        await page.locator('.role-card[data-role="admin"]').click();
        await page.locator("#email").fill(TEST_ADMIN_EMAIL);
        await page.locator("#password").fill(TEST_ADMIN_PASSWORD);
        await page.locator("#loginForm [type=submit]").click();
        await page.waitForURL("**/admin-dashboard.html");
        try {
            await page.waitForFunction(() => {
                const status = document.querySelector("#studentDirectoryStatus")?.textContent || "";
                return status.length > 0 && !status.includes("Loading");
            });
            assert.match(await page.locator("#studentDirectoryStatus").innerText(), /loaded from LearnSpace|No Student accounts/);
        } catch (error) {
            console.error("Admin initial-load diagnostics:", JSON.stringify({
                visibleText: (await page.locator("body").innerText()).slice(0, 6000),
                consoleErrors,
                failedRequests,
                backendLogs: backend.logs.join("")
            }, null, 2));
            throw error;
        }

        await page.locator("#newStudentName").fill("Browser Student");
        await page.locator("#newStudentEmail").fill(STUDENT_EMAIL);
        await page.locator("#newStudentPassword").fill(STUDENT_PASSWORD);
        await page.locator("#createStudentForm [type=submit]").click();
        await page.getByText("Student account created.").waitFor();
        const [[studentPersisted]] = await isolated.pool.execute(
            "SELECT COUNT(*) AS total FROM users u JOIN student_profiles sp ON sp.user_id=u.id WHERE u.email=? AND u.role='student'",
            [STUDENT_EMAIL]
        );
        assert.equal(Number(studentPersisted.total), 1, "Student account and profile must persist in the isolated schema.");

        await page.locator("#newTeacherName").fill("Browser Teacher");
        await page.locator("#newTeacherEmail").fill(TEACHER_EMAIL);
        await page.locator("#newTeacherPassword").fill(TEACHER_PASSWORD);
        await page.locator("#createTeacherForm [type=submit]").click();
        await page.getByText("Teacher account created.").waitFor();
        const [[teacherPersisted]] = await isolated.pool.execute(
            "SELECT COUNT(*) AS total FROM users u JOIN teacher_profiles tp ON tp.user_id=u.id WHERE u.email=? AND u.role='teacher'",
            [TEACHER_EMAIL]
        );
        assert.equal(Number(teacherPersisted.total), 1, "Teacher account and profile must persist in the isolated schema.");

        await page.locator("#semesterName").fill(SEMESTER_NAME);
        await page.locator("#semesterAcademicYear").fill("2026-2027");
        await page.locator("#addSemesterForm [type=submit]").click();
        try { await page.getByText("Semester created.").waitFor(); }
        catch (error) {
            console.error("Semester form diagnostics:", JSON.stringify({
                formStatus: await page.locator("#semesterFormStatus").innerText(),
                viewStatus: await page.locator("#semesterViewStatus").innerText(),
                consoleErrors,
                failedRequests,
                backendLogs: backend.logs.join("")
            }, null, 2));
            throw error;
        }
        const semesterCard = page.locator("#semesterList .record-card").filter({ hasText: SEMESTER_NAME });
        await semesterCard.waitFor();

        await page.locator("#courseCode").fill(SUBJECT_CODE);
        await page.locator("#courseName").fill("Browser Curriculum Subject");
        await page.locator("#courseDescription").fill("Created during the isolated browser test.");
        await page.locator("#addCourseForm [type=submit]").click();
        await page.getByText("Official curriculum subject created.").waitFor();

        const subjectSelector = semesterCard.locator("select");
        await subjectSelector.selectOption({ label: `${SUBJECT_CODE} — Browser Curriculum Subject` });
        await semesterCard.getByRole("button", { name: "Map subject" }).click();
        await semesterCard.locator("ul li").filter({ hasText: `${SUBJECT_CODE} — Browser Curriculum Subject` }).waitFor();
        const [[mappingPersisted]] = await isolated.pool.execute(
            `SELECT COUNT(*) AS total FROM semester_subjects ss
             JOIN semesters s ON s.id=ss.semester_id
             JOIN curriculum_subjects cs ON cs.id=ss.curriculum_subject_id
             WHERE s.name=? AND cs.code=?`,
            [SEMESTER_NAME, SUBJECT_CODE]
        );
        assert.equal(Number(mappingPersisted.total), 1, "Semester, subject, and mapping must persist in the isolated schema.");

        let studentRow = page.locator("#studentDirectoryRows tr").filter({ hasText: STUDENT_EMAIL });
        await studentRow.getByRole("button", { name: "Admit" }).click();
        await studentRow.getByRole("button", { name: "Authorize" }).click();

        await page.locator("#learnspaceLogout").click();
        await page.waitForURL("**/index.html");
        await page.locator('.role-card[data-role="student"]').click();
        await page.locator("#email").fill(STUDENT_EMAIL);
        await page.locator("#password").fill(STUDENT_PASSWORD);
        await page.locator("#loginForm [type=submit]").click();
        await page.waitForURL("**/student_courses.html");
        await page.locator("#studentEnrollmentSemester").waitFor();
        await page.locator("#studentEnrollmentSemester").selectOption({ label: `${SEMESTER_NAME} · 2026-2027` });
        await page.locator("#studentEnrollmentForm [type=submit]").click();
        await page.getByText("Your enrollment request was sent to an Admin.").waitFor();
        const [[pendingRequest]] = await isolated.pool.execute(
            `SELECT COUNT(*) AS total FROM student_enrollment_requests r
             JOIN student_profiles sp ON sp.id=r.student_profile_id JOIN users u ON u.id=sp.user_id
             WHERE u.email=? AND r.status='pending'`,
            [STUDENT_EMAIL]
        );
        assert.equal(Number(pendingRequest.total), 1, "Enrollment request must persist before Admin review.");

        await page.locator("#learnspaceLogout").click();
        await page.waitForURL("**/index.html");
        await page.locator('.role-card[data-role="admin"]').click();
        await page.locator("#email").fill(TEST_ADMIN_EMAIL);
        await page.locator("#password").fill(TEST_ADMIN_PASSWORD);
        await page.locator("#loginForm [type=submit]").click();
        await page.waitForURL("**/admin-dashboard.html");
        const requestRow = page.locator("#enrollmentRequestRows tr").filter({ hasText: STUDENT_EMAIL });
        await requestRow.getByRole("button", { name: "Approve" }).click();
        await page.getByText("Request approved and Student allocation recorded.").waitFor();
        studentRow = page.locator("#studentDirectoryRows tr").filter({ hasText: STUDENT_EMAIL });
        await studentRow.getByRole("cell", { name: new RegExp(SEMESTER_NAME) }).waitFor();
        const [[allocationPersisted]] = await isolated.pool.execute(
            `SELECT sp.current_semester_id AS semesterId,
                    (SELECT COUNT(*) FROM student_semester_history h WHERE h.student_profile_id=sp.id) AS historyCount,
                    (SELECT COUNT(*) FROM student_enrollment_requests r WHERE r.student_profile_id=sp.id AND r.status='approved') AS approvedRequests
             FROM student_profiles sp JOIN users u ON u.id=sp.user_id WHERE u.email=?`,
            [STUDENT_EMAIL]
        );
        assert.ok(allocationPersisted);
        assert.equal(Number(allocationPersisted.historyCount), 1);
        assert.equal(Number(allocationPersisted.approvedRequests), 1);
        const [[allocatedSemester]] = await isolated.pool.execute("SELECT name FROM semesters WHERE id=?", [allocationPersisted.semesterId]);
        assert.equal(allocatedSemester.name, SEMESTER_NAME);

        await page.locator("#learnspaceLogout").click();
        await page.waitForURL("**/index.html");
        await page.locator('.role-card[data-role="student"]').click();
        await page.locator("#email").fill(STUDENT_EMAIL);
        await page.locator("#password").fill(STUDENT_PASSWORD);
        await page.locator("#loginForm [type=submit]").click();
        await page.waitForURL("**/student_courses.html");
        await page.goto(`${base}/admin-dashboard.html`);
        await page.waitForURL("**/student_courses.html");
        const studentAdminApiStatus = await page.evaluate(async () => {
            const response = await fetch(`${window.LearnSpaceApi.baseUrl}/admin/students`, { credentials: "include" });
            return response.status;
        });
        assert.equal(studentAdminApiStatus, 403);

        await page.locator("#learnspaceLogout").click();
        await page.waitForURL("**/index.html");
        await page.locator('.role-card[data-role="teacher"]').click();
        await page.locator("#email").fill(TEACHER_EMAIL);
        await page.locator("#password").fill(TEACHER_PASSWORD);
        await page.locator("#loginForm [type=submit]").click();
        await page.waitForURL("**/teacher-dashboard.html");
        await page.goto(`${base}/admin-dashboard.html`);
        await page.waitForURL("**/teacher-dashboard.html");
        const teacherAdminApiStatus = await page.evaluate(async () => {
            const response = await fetch(`${window.LearnSpaceApi.baseUrl}/admin/summary`, { credentials: "include" });
            return response.status;
        });
        assert.equal(teacherAdminApiStatus, 403);

        assert.deepEqual(forbiddenResponses.map((url) => new URL(url).pathname).sort(), ["/api/admin/students", "/api/admin/summary"]);
        const expectedForbiddenResourceErrors = consoleErrors.filter((message) =>
            message === "Failed to load resource: the server responded with a status of 403 (Forbidden)");
        const unexpectedConsoleErrors = consoleErrors.filter((message) => !expectedForbiddenResourceErrors.includes(message));
        assert.equal(expectedForbiddenResourceErrors.length, 2, "The deliberate Student and Teacher Admin API denials should be visible as two 403 responses.");
        assert.deepEqual(unexpectedConsoleErrors, [], `Unexpected browser console errors: ${unexpectedConsoleErrors.join(" | ")}`);
        const cancelledRequests = failedRequests.filter((request) => request.includes("(net::ERR_ABORTED)"));
        const unexpectedFailedRequests = failedRequests.filter((request) => !request.includes("(net::ERR_ABORTED)"));
        assert.deepEqual(unexpectedFailedRequests, [], `Failed requests: ${unexpectedFailedRequests.join(" | ")}`);
        console.log(`Browser diagnostics: 0 unexpected console errors; 2 expected authorization 403s; ${cancelledRequests.length} navigation-cancelled requests; 0 unexpected failed requests.`);
        console.log("Playwright workflow passed: Admin login/dashboard, Student and Teacher creation, semester/curriculum mapping, Student request and approval, logout, and Student/Teacher page/API restrictions.");
    } finally {
        await browser?.close();
        await backend?.stop();
        await frontend?.stop();
        await isolated?.destroy();
    }
}

main().catch((error) => {
    console.error("Browser workflow failed:", error?.stack || error?.message || JSON.stringify({ name: error?.name, code: error?.code, errno: error?.errno, syscall: error?.syscall }));
    process.exitCode = 1;
});
