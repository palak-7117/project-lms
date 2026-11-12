const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { before, after } = test;
const {
    TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, createIsolatedDatabase,
    startBackend, startFrontend, createApiClient
} = require("./harness");

let isolated;
let frontend;
let backend;
let admin;
let student;
let teacher;
let semesterA;
let semesterB;

function data(response) {
    assert.equal(response.status < 300, true, JSON.stringify(response.body));
    return response.body.data;
}

async function newAdmin() {
    const client = createApiClient(backend.baseUrl, frontend.origin);
    const response = await client.login("admin", TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    assert.equal(response.status, 200);
    return client;
}

async function createStudent(client, email) {
    const response = await client.post("/admin/students", {
        displayName: "Test Student",
        email,
        password: "TestStudentPassword!2026",
        role: "admin"
    });
    return data(response);
}

async function authorizeStudent(client, profileId) {
    data(await client.patch(`/admin/students/${profileId}/admission`, { admissionStatus: "admitted" }));
    data(await client.patch(`/admin/students/${profileId}/authorization`, { authorizationStatus: "authorized" }));
}

before(async () => {
    isolated = await createIsolatedDatabase();
    await isolated.seedAdmin();
    frontend = await startFrontend();
    backend = await startBackend(isolated.name, frontend.origin);
    admin = await newAdmin();
    semesterA = data(await admin.post("/admin/semesters", { name: "Autumn", academicYear: "2026-2027" }));
    semesterB = data(await admin.post("/admin/semesters", { name: "Spring", academicYear: "2026-2027" }));
});

after(async () => {
    await backend?.stop();
    await frontend?.stop();
    await isolated?.destroy();
});

test("health, role-specific login, invalid credentials, and safe public profile", async () => {
    const health = await fetch(`${backend.baseUrl}/health`);
    assert.equal(health.status, 200);
    const denied = await createApiClient(backend.baseUrl, frontend.origin).get("/admin/summary");
    assert.equal(denied.status, 401);

    const badClient = createApiClient(backend.baseUrl, frontend.origin);
    const invalid = await badClient.login("admin", TEST_ADMIN_EMAIL, "wrong password value");
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.code, "INVALID_CREDENTIALS");
    assert.equal(JSON.stringify(invalid.body).includes("password_hash"), false);

    const current = await admin.get("/auth/me");
    assert.equal(current.status, 200);
    assert.equal(current.body.data.user.role, "admin");
    assert.equal(Object.hasOwn(current.body.data.user, "passwordHash"), false);
});

test("Admin creates Students and Teachers without accepting caller-selected roles", async () => {
    const createdStudent = await createStudent(admin, "student-one@learnspace.invalid");
    assert.equal(createdStudent.role, "student");
    assert.equal(createdStudent.accountStatus, "active");
    student = createdStudent;

    const createdTeacher = data(await admin.post("/admin/teachers", {
        displayName: "Test Teacher", email: "teacher-one@learnspace.invalid",
        password: "TestTeacherPassword!2026", role: "admin"
    }));
    assert.equal(createdTeacher.role, "teacher");
    teacher = createdTeacher;

    const students = data(await admin.get("/admin/students"));
    assert.equal(students.some((record) => record.profileId === student.profileId), true);
    const teachers = data(await admin.get("/admin/teachers"));
    assert.equal(teachers.some((record) => record.profileId === teacher.profileId), true);
});

test("account activation and role restrictions are enforced by the server", async () => {
    const teacherClient = createApiClient(backend.baseUrl, frontend.origin);
    const teacherLogin = await teacherClient.login("teacher", "teacher-one@learnspace.invalid", "TestTeacherPassword!2026");
    assert.equal(teacherLogin.status, 200);
    assert.equal((await teacherClient.get("/admin/summary")).status, 403);

    data(await admin.patch(`/admin/users/${teacher.userId}/status`, { accountStatus: "disabled" }));
    assert.equal((await teacherClient.get("/auth/me")).status, 401);
    data(await admin.patch(`/admin/users/${teacher.userId}/status`, { accountStatus: "active" }));

    await authorizeStudent(admin, student.profileId);
    const studentClient = createApiClient(backend.baseUrl, frontend.origin);
    const studentLogin = await studentClient.login("student", "student-one@learnspace.invalid", "TestStudentPassword!2026");
    assert.equal(studentLogin.status, 200);
    assert.equal((await studentClient.get("/admin/students")).status, 403);
    student = { ...student, client: studentClient };
});

test("semester creation, curriculum mapping, and duplicate mapping prevention", async () => {
    const subject = data(await admin.post("/admin/curriculum-subjects", {
        code: "B04-TEST", name: "Test Curriculum", description: "Isolated test subject"
    }));
    const mapping = await admin.post(`/admin/semesters/${semesterA.id}/subjects/${subject.id}`, {});
    assert.equal(mapping.status, 201);
    assert.equal((await admin.post(`/admin/semesters/${semesterA.id}/subjects/${subject.id}`, {})).status, 409);
    const semesters = data(await admin.get("/admin/semesters"));
    assert.equal(semesters.find((item) => item.id === semesterA.id).subjectIds.includes(subject.id), true);
});

test("enrollment requests approve/reject atomically and prevent duplicate active allocation", async () => {
    const request = await student.client.post("/student/enrollment-requests", { semesterId: semesterA.id });
    assert.equal(request.status, 201);
    const duplicateResults = await Promise.all([
        student.client.post("/student/enrollment-requests", { semesterId: semesterB.id }),
        student.client.post("/student/enrollment-requests", { semesterId: semesterB.id })
    ]);
    assert.deepEqual(duplicateResults.map((result) => result.status), [409, 409]);
    const pendingList = data(await admin.get("/admin/enrollment-requests"));
    const firstRequest = pendingList.find((item) => item.id === request.body.data.id);
    assert.ok(firstRequest);
    data(await admin.patch(`/admin/enrollment-requests/${firstRequest.id}/review`, { decision: "approved" }));

    const students = data(await admin.get("/admin/students"));
    assert.equal(students.find((item) => item.profileId === student.profileId).currentSemesterId, semesterA.id);
    assert.equal((await admin.post(`/admin/students/${student.profileId}/allocation`, { semesterId: semesterA.id })).status, 409);
    const [[history]] = await isolated.pool.query("SELECT COUNT(*) AS total FROM student_semester_history WHERE student_profile_id=?", [student.profileId]);
    assert.equal(Number(history.total), 1);

    const rejectedStudent = await createStudent(admin, "student-rejected@learnspace.invalid");
    await authorizeStudent(admin, rejectedStudent.profileId);
    const rejectedClient = createApiClient(backend.baseUrl, frontend.origin);
    assert.equal((await rejectedClient.login("student", "student-rejected@learnspace.invalid", "TestStudentPassword!2026")).status, 200);
    const rejectedReq = await rejectedClient.post("/student/enrollment-requests", { semesterId: semesterB.id });
    assert.equal(rejectedReq.status, 201);
    data(await admin.patch(`/admin/enrollment-requests/${rejectedReq.body.data.id}/review`, { decision: "rejected", reviewNote: "Not this term" }));
    const rejectedProfile = data(await admin.get("/admin/students"));
    assert.equal(rejectedProfile.find((item) => item.profileId === rejectedStudent.profileId).currentSemesterId, null);

    const withdrawnStudent = await createStudent(admin, "student-withdraw@learnspace.invalid");
    await authorizeStudent(admin, withdrawnStudent.profileId);
    const withdrawnClient = createApiClient(backend.baseUrl, frontend.origin);
    assert.equal((await withdrawnClient.login("student", "student-withdraw@learnspace.invalid", "TestStudentPassword!2026")).status, 200);
    const pending = await withdrawnClient.post("/student/enrollment-requests", { semesterId: semesterB.id });
    assert.equal(pending.status, 201);
    assert.equal((await withdrawnClient.post(`/student/enrollment-requests/${pending.body.data.id}/withdraw`, {})).status, 200);
    assert.equal((await withdrawnClient.post("/student/enrollment-requests", { semesterId: semesterB.id })).status, 201);

    const concurrentStudent = await createStudent(admin, "student-concurrent@learnspace.invalid");
    await authorizeStudent(admin, concurrentStudent.profileId);
    const concurrentClient = createApiClient(backend.baseUrl, frontend.origin);
    assert.equal((await concurrentClient.login("student", "student-concurrent@learnspace.invalid", "TestStudentPassword!2026")).status, 200);
    const concurrentResults = await Promise.all([
        concurrentClient.post("/student/enrollment-requests", { semesterId: semesterA.id }),
        concurrentClient.post("/student/enrollment-requests", { semesterId: semesterB.id })
    ]);
    assert.deepEqual(concurrentResults.map((result) => result.status).sort(), [201, 409]);
});

test("transaction rollback keeps allocation and history unchanged on injected failure", async () => {
    const rollbackStudent = await createStudent(admin, "student-rollback@learnspace.invalid");
    await authorizeStudent(admin, rollbackStudent.profileId);
    await isolated.pool.query(`CREATE TRIGGER b04_test_fail_history BEFORE INSERT ON student_semester_history
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback test'`);
    try {
        const failed = await admin.post(`/admin/students/${rollbackStudent.profileId}/allocation`, { semesterId: semesterA.id });
        assert.equal(failed.status, 500);
        assert.equal(failed.body.error, "Internal server error");
        const current = data(await admin.get("/admin/students"));
        assert.equal(current.find((item) => item.profileId === rollbackStudent.profileId).currentSemesterId, null);
        const [[history]] = await isolated.pool.query("SELECT COUNT(*) AS total FROM student_semester_history WHERE student_profile_id=?", [rollbackStudent.profileId]);
        assert.equal(Number(history.total), 0);
    } finally {
        await isolated.pool.query("DROP TRIGGER b04_test_fail_history");
    }
});

test("expired sessions are rejected, logout revokes, and last active Admin cannot be disabled", async () => {
    const expiredClient = createApiClient(backend.baseUrl, frontend.origin);
    assert.equal((await expiredClient.login("admin", TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status, 200);
    const sessionToken = expiredClient.sessionToken();
    assert.ok(sessionToken);
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    await isolated.pool.execute(
        `UPDATE user_sessions SET created_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 10 HOUR),
         expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR) WHERE token_hash=?`,
        [tokenHash]
    );
    assert.equal((await expiredClient.get("/auth/me")).status, 401);

    const freshAdmin = await newAdmin();
    assert.equal((await freshAdmin.post("/auth/logout", {})).status, 200);
    assert.equal((await freshAdmin.get("/auth/me")).status, 401);
    const users = await isolated.pool.execute("SELECT id FROM users WHERE role='admin' AND account_status='active'");
    const adminId = users[0][0].id;
    const lastAdmin = await admin.patch(`/admin/users/${adminId}/status`, { accountStatus: "disabled" });
    assert.equal(lastAdmin.status, 409);
    assert.equal(lastAdmin.body.code, "LAST_ACTIVE_ADMIN");
});
