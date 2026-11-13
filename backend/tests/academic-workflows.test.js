const test = require("node:test");
const assert = require("node:assert/strict");
const {
    TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, createIsolatedDatabase,
    startBackend, startFrontend, createApiClient
} = require("./harness");

let isolated;
let frontend;
let backend;
let admin;
let teacherA;
let teacherB;
let teacherAApi;
let teacherBApi;
let studentA;
let studentB;
let outsider;
let studentAApi;
let studentBApi;
let outsiderApi;
let semester;
let otherSemester;
let subject;
let offeringA;
let offeringB;
let materialA;
let materialB;
let assignmentA;
let assignmentB;
let submissionA;
let quizA;
let attendanceA;
let sharedAssetId;
let cleanupJobs;

function data(response, status = 200) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body.data;
}

async function createStudent(email, name) {
    return data(await admin.post("/admin/students", { email, displayName: name, password: "StudentSecurePass!2026" }), 201);
}

async function createTeacher(email, name) {
    return data(await admin.post("/admin/teachers", { email, displayName: name, password: "TeacherSecurePass!2026" }), 201);
}

async function signIn(role, email, password) {
    const client = createApiClient(backend.baseUrl, frontend.origin);
    assert.equal((await client.login(role, email, password)).status, 200);
    return client;
}

async function approveAndAllocate(student, semesterId) {
    data(await admin.patch(`/admin/students/${student.profileId}/admission`, { admissionStatus: "admitted" }));
    data(await admin.patch(`/admin/students/${student.profileId}/authorization`, { authorizationStatus: "authorized" }));
    data(await admin.post(`/admin/students/${student.profileId}/allocation`, { semesterId }));
}

function pdfForm(name, contents = "%PDF-1.7\nLearnSpace workflow file\n", status = "submitted") {
    const form = new FormData();
    form.append("status", status);
    form.append("files", new Blob([contents], { type: "application/pdf" }), name);
    return form;
}

test.before(async () => {
    isolated = await createIsolatedDatabase();
    await isolated.seedAdmin();
    frontend = await startFrontend();
    backend = await startBackend(isolated.name, frontend.origin);
    const originalDatabase = process.env.DB_NAME;
    const originalStorage = process.env.FILE_STORAGE_DIR;
    process.env.DB_NAME = isolated.name;
    process.env.FILE_STORAGE_DIR = backend.storagePath;
    cleanupJobs = require("../src/services/file-cleanup.service");
    process.env.DB_NAME = originalDatabase;
    if (originalStorage === undefined) delete process.env.FILE_STORAGE_DIR;
    else process.env.FILE_STORAGE_DIR = originalStorage;
    admin = await signIn("admin", TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);

    semester = data(await admin.post("/admin/semesters", { name: "Batch Three Term", academicYear: "2026-2027" }), 201);
    otherSemester = data(await admin.post("/admin/semesters", { name: "Other Term", academicYear: "2026-2027" }), 201);
    subject = data(await admin.post("/admin/curriculum-subjects", { code: "B3-CORE", name: "Batch Three Core", description: "Isolated workflow subject" }), 201);
    data(await admin.post(`/admin/semesters/${semester.id}/subjects/${subject.id}`, {}), 201);
    data(await admin.post(`/admin/semesters/${otherSemester.id}/subjects/${subject.id}`, {}), 201);

    teacherA = await createTeacher("batch3-teacher-a@learnspace.invalid", "Teacher A");
    teacherB = await createTeacher("batch3-teacher-b@learnspace.invalid", "Teacher B");
    studentA = await createStudent("batch3-student-a@learnspace.invalid", "Student A");
    studentB = await createStudent("batch3-student-b@learnspace.invalid", "Student B");
    outsider = await createStudent("batch3-student-outsider@learnspace.invalid", "Other Semester Student");
    await approveAndAllocate(studentA, semester.id);
    await approveAndAllocate(studentB, semester.id);
    await approveAndAllocate(outsider, otherSemester.id);

    teacherAApi = await signIn("teacher", teacherA.email, "TeacherSecurePass!2026");
    teacherBApi = await signIn("teacher", teacherB.email, "TeacherSecurePass!2026");
    studentAApi = await signIn("student", studentA.email, "StudentSecurePass!2026");
    studentBApi = await signIn("student", studentB.email, "StudentSecurePass!2026");
    outsiderApi = await signIn("student", outsider.email, "StudentSecurePass!2026");
});

test.after(async () => {
    await backend?.stop();
    await frontend?.stop();
    if (cleanupJobs) await require("../src/config/db").end();
    await isolated?.destroy();
});

test("Teachers create independently owned semester offerings and Students only see eligible offerings", async () => {
    const curriculum = data(await teacherAApi.get("/teacher/curriculum-subjects"));
    assert.ok(curriculum.some((item) => item.subjectId === subject.id && item.semesterId === semester.id));
    assert.ok(curriculum.some((item) => item.subjectId === subject.id && item.semesterId === otherSemester.id));
    offeringA = data(await teacherAApi.post("/teacher/offerings", {
        curriculumSubjectId: subject.id, semesterId: semester.id, sectionCode: "A", description: "Teacher A independent offering"
    }), 201);
    offeringB = data(await teacherBApi.post("/teacher/offerings", {
        curriculumSubjectId: subject.id, semesterId: semester.id, sectionCode: "A", description: "Teacher B independent offering"
    }), 201);
    assert.notEqual(offeringA.id, offeringB.id);
    assert.equal(offeringA.semesterId, semester.id);
    assert.equal((await teacherAApi.post("/teacher/offerings", {
        curriculumSubjectId: subject.id, semesterId: semester.id, sectionCode: "A"
    })).status, 409);
    const unmappedSubject = data(await admin.post("/admin/curriculum-subjects", {
        code: "B3-UNMAPPED", name: "Unmapped curriculum subject", description: "Must not be offered before mapping"
    }), 201);
    assert.equal((await teacherAApi.post("/teacher/offerings", {
        curriculumSubjectId: unmappedSubject.id, semesterId: otherSemester.id, sectionCode: "A"
    })).status, 409);
    assert.equal((await teacherBApi.get(`/teacher/offerings/${offeringA.id}`)).status, 404);
    assert.equal((await teacherBApi.patch(`/teacher/offerings/${offeringA.id}`, { description: "unauthorized" })).status, 404);
    assert.equal((await studentAApi.get(`/teacher/offerings/${offeringA.id}`)).status, 403);
    const eligible = data(await studentAApi.get("/student/offerings"));
    assert.deepEqual(new Set(eligible.map((item) => item.id)), new Set([offeringA.id, offeringB.id]));
    assert.equal((await outsiderApi.get("/student/offerings")).body.data.length, 0);
    assert.equal((await outsiderApi.get(`/student/offerings/${offeringA.id}`)).status, 404);
    const [[count]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM offerings WHERE curriculum_subject_id=?", [subject.id]);
    assert.equal(Number(count.total), 2);
});

test("Materials are private, downloadable, and shared file references survive individual deletion", async () => {
    const form = new FormData();
    form.append("title", "Core notes");
    form.append("materialType", "notes");
    form.append("description", "Private PDF notes");
    form.append("files", new Blob(["%PDF-1.7\nLearnSpace private material\n"], { type: "application/pdf" }), "core-notes.pdf");
    materialA = data(await teacherAApi.postMultipart(`/teacher/offerings/${offeringA.id}/materials`, form), 201);
    sharedAssetId = materialA.fileAssetId;
    const material = data(await studentAApi.get(`/student/offerings/${offeringA.id}`)).materials[0];
    assert.equal(material.id, materialA.id);
    assert.equal(JSON.stringify(material).includes("private-storage"), false);
    const download = await fetch(`${backend.baseUrl}/files/${sharedAssetId}`, {
        headers: { Cookie: studentAApi.cookieHeader(), Origin: frontend.origin }
    });
    assert.equal(download.status, 200);
    assert.match(await download.text(), /^%PDF-1\.7/);
    const outsiderDownload = await fetch(`${backend.baseUrl}/files/${sharedAssetId}`, {
        headers: { Cookie: outsiderApi.cookieHeader(), Origin: frontend.origin }
    });
    assert.equal(outsiderDownload.status, 403);
    materialB = await isolated.pool.execute(
        `INSERT INTO materials (id,offering_id,file_asset_id,title,material_type,description)
         VALUES (?,?,?,'Shared notes','notes','Second retained reference')`,
        [require("node:crypto").randomUUID(), offeringB.id, sharedAssetId]
    ).then(([result]) => result.insertId);
    const [rows] = await isolated.pool.execute("SELECT id FROM materials WHERE offering_id=? AND file_asset_id=? ORDER BY id", [offeringB.id, sharedAssetId]);
    materialB = rows[0].id;
    await teacherAApi.patch(`/teacher/materials/${materialA.id}`, { title: "Updated core notes" }).then((response) => data(response));
    data(await teacherAApi.delete(`/teacher/materials/${materialA.id}`));
    const [[retained]] = await isolated.pool.execute("SELECT status FROM file_assets WHERE id=?", [sharedAssetId]);
    assert.equal(retained.status, "available");
    const stillDownloadable = await fetch(`${backend.baseUrl}/files/${sharedAssetId}`, {
        headers: { Cookie: studentAApi.cookieHeader(), Origin: frontend.origin }
    });
    assert.equal(stillDownloadable.status, 200);
});

test("Assignments, submissions, grading, Google Forms, and attendance are enforced and persisted", async () => {
    assignmentA = data(await teacherAApi.post(`/teacher/offerings/${offeringA.id}/assignments`, {
        title: "Research response", description: "Submit a short PDF.", startAt: "2026-01-01T00:00:00.000Z",
        dueAt: "2034-12-01T00:00:00.000Z", maximumMarks: 25, status: "published"
    }), 201);
    assignmentB = data(await teacherBApi.post(`/teacher/offerings/${offeringB.id}/assignments`, {
        title: "Student B project", description: "Independent offering submission.", startAt: "2026-01-01T00:00:00.000Z",
        dueAt: "2034-12-01T00:00:00.000Z", maximumMarks: 30, status: "published"
    }), 201);
    const closedAssignment = data(await teacherAApi.post(`/teacher/offerings/${offeringA.id}/assignments`, {
        title: "Closed work", description: "Past deadline.", startAt: "2020-01-01T00:00:00.000Z",
        dueAt: "2020-02-01T00:00:00.000Z", maximumMarks: 10, status: "published"
    }), 201);
    assert.equal((await teacherBApi.patch(`/teacher/assignments/${assignmentA.id}`, { title: "Tamper" })).status, 404);
    assert.equal((await studentAApi.postMultipart(`/student/offerings/${offeringA.id}/assignments/${closedAssignment.id}/submission`, pdfForm("late.pdf"))).status, 409);
    const savedDraft = data(await studentAApi.postMultipart(`/student/offerings/${offeringA.id}/assignments/${assignmentA.id}/submission`, pdfForm("review-draft.pdf", undefined, "draft")), 201);
    assert.equal(savedDraft.status, "draft");
    assert.deepEqual(data(await teacherAApi.get(`/teacher/assignments/${assignmentA.id}/submissions`)), [], "Drafts remain private until final submission.");
    const submissionForm = pdfForm("student-answer.pdf");
    submissionA = data(await studentAApi.postMultipart(`/student/offerings/${offeringA.id}/assignments/${assignmentA.id}/submission`, submissionForm), 201);
    assert.equal(submissionA.status, "submitted");
    assert.equal(submissionA.id, savedDraft.id, "A draft becomes the single permitted submission record.");
    assert.equal((await studentAApi.postMultipart(`/student/offerings/${offeringA.id}/assignments/${assignmentA.id}/submission`, pdfForm("duplicate.pdf"))).status, 409);
    const [[submissionCount]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM assignment_submissions WHERE assignment_id=? AND student_profile_id=?", [assignmentA.id, studentA.profileId]);
    assert.equal(Number(submissionCount.total), 1);
    data(await studentBApi.postMultipart(`/student/offerings/${offeringB.id}/assignments/${assignmentB.id}/submission`, pdfForm("student-b.pdf")), 201);
    const teacherSubmissions = data(await teacherAApi.get(`/teacher/assignments/${assignmentA.id}/submissions`));
    assert.equal(teacherSubmissions[0].studentProfileId, studentA.profileId);
    assert.equal((await teacherBApi.get(`/teacher/assignments/${assignmentA.id}/submissions`)).status, 404);
    assert.equal((await teacherAApi.patch(`/teacher/submissions/${submissionA.id}/grade`, { grade: 26, feedback: "over maximum" })).status, 400);
    data(await teacherAApi.patch(`/teacher/submissions/${submissionA.id}/grade`, { grade: 22.5, feedback: "Clear reasoning and evidence." }));
    const studentOffering = data(await studentAApi.get(`/student/offerings/${offeringA.id}`));
    const graded = studentOffering.assignments.find((item) => item.id === assignmentA.id);
    assert.equal(Number(graded.grade), 22.5);
    assert.equal(graded.feedback, "Clear reasoning and evidence.");
    const [[gradeDb]] = await isolated.pool.execute("SELECT grade,status,feedback FROM assignment_submissions WHERE id=?", [submissionA.id]);
    assert.equal(Number(gradeDb.grade), 22.5);
    assert.equal(gradeDb.status, "graded");
    assert.equal((await teacherAApi.patch(`/teacher/assignments/${assignmentA.id}`, { marks: 20 })).status, 409);

    quizA = data(await teacherAApi.post(`/teacher/offerings/${offeringA.id}/quizzes`, {
        title: "Google Forms quiz", description: "Open the official form.", googleFormUrl: "https://docs.google.com/forms/d/e/test/viewform",
        durationMinutes: 30, startAt: "2034-02-01T00:00:00.000Z", dueAt: "2034-02-02T00:00:00.000Z", status: "published"
    }), 201);
    assert.equal((await teacherAApi.post(`/teacher/offerings/${offeringA.id}/quizzes`, {
        title: "Bad quiz link", googleFormUrl: "https://example.com/form", durationMinutes: 30,
        startAt: "2034-02-01T00:00:00.000Z", dueAt: "2034-02-02T00:00:00.000Z"
    })).status, 400);
    const studentQuiz = data(await studentAApi.get(`/student/offerings/${offeringA.id}`)).quizzes.find((item) => item.id === quizA.id);
    assert.equal(studentQuiz.googleFormUrl, quizA.googleFormUrl);
    data(await teacherAApi.patch(`/teacher/quizzes/${quizA.id}`, { description: "Updated Forms metadata." }));
    const temporaryQuiz = data(await teacherAApi.post(`/teacher/offerings/${offeringA.id}/quizzes`, {
        title: "Temporary quiz", googleFormUrl: "https://forms.gle/test-form", durationMinutes: 15,
        startAt: "2034-02-01T00:00:00.000Z", dueAt: "2034-02-02T00:00:00.000Z"
    }), 201);
    data(await teacherAApi.delete(`/teacher/quizzes/${temporaryQuiz.id}`));
    assert.equal((await outsiderApi.get(`/student/offerings/${offeringA.id}`)).status, 404);
    const [[quizDb]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM quizzes WHERE id=?", [quizA.id]);
    assert.equal(Number(quizDb.total), 1);

    attendanceA = data(await teacherAApi.post(`/teacher/offerings/${offeringA.id}/attendance-sessions`, {
        title: "Week one", startsAt: "2034-03-01T09:00:00.000Z", endsAt: "2034-03-01T10:00:00.000Z", status: "held"
    }), 201);
    const roster = data(await teacherAApi.get(`/teacher/attendance-sessions/${attendanceA.id}/roster`));
    assert.deepEqual(new Set(roster.students.map((item) => item.studentProfileId)), new Set([studentA.profileId, studentB.profileId]));
    data(await teacherAApi.put(`/teacher/attendance-sessions/${attendanceA.id}/records/${studentA.profileId}`, { attendanceStatus: "present" }));
    data(await teacherAApi.put(`/teacher/attendance-sessions/${attendanceA.id}/records/${studentA.profileId}`, { attendanceStatus: "late", note: "Arrived after start" }));
    assert.equal((await teacherBApi.get(`/teacher/attendance-sessions/${attendanceA.id}/roster`)).status, 404);
    const [[attendanceCount]] = await isolated.pool.execute("SELECT COUNT(*) AS total,MAX(attendance_status) AS status FROM attendance_records WHERE attendance_session_id=? AND student_profile_id=?", [attendanceA.id, studentA.profileId]);
    assert.equal(Number(attendanceCount.total), 1);
    assert.equal(attendanceCount.status, "late");
    const studentAttendance = data(await studentAApi.get(`/student/offerings/${offeringA.id}/attendance`));
    assert.equal(studentAttendance.records[0].attendanceStatus, "late");
    assert.equal(Number(studentAttendance.summary.sessions), 1);
    assert.equal((await studentAApi.get(`/teacher/offerings/${offeringA.id}`)).status, 403);
});

test("Deletion is scoped, transaction rollback preserves data, and cleanup retains shared files", async () => {
    const otherStudentSubmission = await isolated.pool.execute(
        "SELECT id FROM assignment_submissions WHERE assignment_id=? AND student_profile_id=?", [assignmentB.id, studentB.profileId]
    );
    assert.equal(otherStudentSubmission[0].length, 1);
    const rollbackMaterial = new FormData();
    rollbackMaterial.append("title", "Rollback retention material");
    rollbackMaterial.append("materialType", "notes");
    rollbackMaterial.append("files", new Blob(["%PDF-1.7\nrollback check\n"], { type: "application/pdf" }), "rollback.pdf");
    const materialBeforeRollback = data(await teacherAApi.postMultipart(`/teacher/offerings/${offeringA.id}/materials`, rollbackMaterial), 201);
    await isolated.pool.query(`CREATE TRIGGER b3_test_fail_offering_delete BEFORE DELETE ON offerings
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback test'`);
    try {
        const failed = await teacherAApi.delete(`/teacher/offerings/${offeringA.id}`);
        assert.equal(failed.status, 500);
        const [[stillThere]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM materials WHERE offering_id=?", [offeringA.id]);
        assert.equal(Number(stillThere.total), 1);
        const [[stillFile]] = await isolated.pool.execute("SELECT status FROM file_assets WHERE id=?", [materialBeforeRollback.fileAssetId]);
        assert.equal(stillFile.status, "available");
    } finally {
        await isolated.pool.query("DROP TRIGGER b3_test_fail_offering_delete");
    }

    data(await admin.delete(`/admin/students/${studentA.profileId}`));
    const [[deletedStudent]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM users WHERE id=?", [studentA.userId]);
    assert.equal(Number(deletedStudent.total), 0);
    const [[studentHistory]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM student_semester_history WHERE student_profile_id=?", [studentA.profileId]);
    assert.equal(Number(studentHistory.total), 0);
    const [[otherStudentStillThere]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM users WHERE id=?", [studentB.userId]);
    assert.equal(Number(otherStudentStillThere.total), 1);
    const [[contentStillThere]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM offerings WHERE id=?", [offeringA.id]);
    assert.equal(Number(contentStillThere.total), 1);
    const [[studentBSubmissionStillThere]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM assignment_submissions WHERE assignment_id=? AND student_profile_id=?", [assignmentB.id, studentB.profileId]);
    assert.equal(Number(studentBSubmissionStillThere.total), 1);

    data(await admin.delete(`/admin/teachers/${teacherA.profileId}`));
    const [[deletedTeacher]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM users WHERE id=?", [teacherA.userId]);
    assert.equal(Number(deletedTeacher.total), 0);
    const [[otherOffering]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM offerings WHERE id=? AND teacher_profile_id=?", [offeringB.id, teacherB.profileId]);
    assert.equal(Number(otherOffering.total), 1);
    const [[sharedAsset]] = await isolated.pool.execute("SELECT status FROM file_assets WHERE id=?", [sharedAssetId]);
    assert.equal(sharedAsset.status, "available");
    const sharedDownload = await fetch(`${backend.baseUrl}/files/${sharedAssetId}`, {
        headers: { Cookie: studentBApi.cookieHeader(), Origin: frontend.origin }
    });
    assert.equal(sharedDownload.status, 200);
    const [[studentBData]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM users WHERE id=?", [studentB.userId]);
    assert.equal(Number(studentBData.total), 1);
    assert.equal((await teacherAApi.get("/teacher/offerings")).status, 401);

    await isolated.pool.query(`CREATE TRIGGER b3_test_fail_file_cleanup BEFORE DELETE ON file_assets
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated cleanup retry test'`);
    const cleanupFailure = await teacherBApi.delete(`/teacher/offerings/${offeringB.id}`);
    assert.equal(cleanupFailure.status, 503, "Deletion must not report success while file cleanup is incomplete.");
    await isolated.pool.query("DROP TRIGGER b3_test_fail_file_cleanup");
    const [[deletedOffering]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM offerings WHERE id=?", [offeringB.id]);
    assert.equal(Number(deletedOffering.total), 0);
    const [[pendingCleanup]] = await isolated.pool.execute("SELECT id,status FROM file_cleanup_jobs WHERE file_asset_id=?", [sharedAssetId]);
    assert.equal(pendingCleanup.status, "failed");
    await isolated.pool.execute("UPDATE file_cleanup_jobs SET next_attempt_at=CURRENT_TIMESTAMP(3) WHERE file_asset_id=?", [sharedAssetId]);
    const retryResults = await cleanupJobs.drainCleanupJobs([sharedAssetId]);
    assert.equal(retryResults[0].complete, true);
    const [[cleanedAsset]] = await isolated.pool.execute("SELECT COUNT(*) AS total FROM file_assets WHERE id=?", [sharedAssetId]);
    assert.equal(Number(cleanedAsset.total), 0);
    const [[cleanupJob]] = await isolated.pool.execute("SELECT status,storage_key,completed_at FROM file_cleanup_jobs WHERE id=?", [pendingCleanup.id]);
    assert.equal(cleanupJob.status, "completed");
    assert.equal(cleanupJob.storage_key, null);
    assert.ok(cleanupJob.completed_at);
    const roleDenied = await studentBApi.delete(`/admin/teachers/${teacherB.profileId}`);
    assert.equal(roleDenied.status, 403);
});
