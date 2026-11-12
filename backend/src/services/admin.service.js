const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../config/db");
const transaction = require("../utils/transaction");
const ApiError = require("../utils/ApiError");
const { requireString, requireEmail, requirePassword, requireUuid, requireEnum, duplicateKey } = require("../utils/validation");

const STUDENT_SELECT = `SELECT u.id AS userId, u.email, u.display_name AS displayName,
    u.account_status AS accountStatus, u.created_at AS userCreatedAt,
    sp.id AS profileId, sp.admission_status AS admissionStatus,
    sp.authorization_status AS authorizationStatus, sp.current_semester_id AS currentSemesterId,
    sem.name AS semesterName, sem.academic_year AS academicYear
    FROM users u JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN semesters sem ON sem.id = sp.current_semester_id`;
const TEACHER_SELECT = `SELECT u.id AS userId, u.email, u.display_name AS displayName,
    u.account_status AS accountStatus, u.created_at AS userCreatedAt,
    tp.id AS profileId, tp.created_at AS profileCreatedAt
    FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id`;

function handleDuplicate(error, label = "A record with these details already exists.") {
    if (duplicateKey(error)) throw new ApiError(409, "DUPLICATE_RECORD", label);
    throw error;
}

async function createPerson(role, body) {
    const displayName = requireString(body?.displayName, "Name", 160);
    const email = requireEmail(body?.email);
    const password = requirePassword(body?.password);
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1
    });

    try {
        await transaction(async (connection) => {
            await connection.execute(
                `INSERT INTO users (id,email,password_hash,display_name,role,account_status)
                 VALUES (?,?,?,?,?,'active')`,
                [userId, email, passwordHash, displayName, role]
            );
            if (role === "student") {
                await connection.execute(
                    `INSERT INTO student_profiles (id,user_id,admission_status,authorization_status,current_semester_id)
                     VALUES (?,?,'pending','pending',NULL)`,
                    [profileId, userId]
                );
            } else {
                await connection.execute(
                    "INSERT INTO teacher_profiles (id,user_id) VALUES (?,?)",
                    [profileId, userId]
                );
            }
        });
    } catch (error) {
        handleDuplicate(error, "An account already uses this email address.");
    }

    return { userId, profileId, role, email, displayName, accountStatus: "active" };
}

async function listStudents() {
    const [rows] = await db.query(`${STUDENT_SELECT} ORDER BY u.created_at DESC`);
    return rows;
}

async function getStudent(profileId) {
    const [rows] = await db.execute(`${STUDENT_SELECT} WHERE sp.id = ? LIMIT 1`, [requireUuid(profileId, "Student ID")]);
    if (!rows[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
    return rows[0];
}

async function listTeachers() {
    const [rows] = await db.query(`${TEACHER_SELECT} ORDER BY u.created_at DESC`);
    return rows;
}

async function getTeacher(profileId) {
    const [rows] = await db.execute(`${TEACHER_SELECT} WHERE tp.id = ? LIMIT 1`, [requireUuid(profileId, "Teacher ID")]);
    if (!rows[0]) throw new ApiError(404, "TEACHER_NOT_FOUND", "Teacher not found.");
    return rows[0];
}

async function createStudent(body) {
    return createPerson("student", body);
}

async function createTeacher(body) {
    return createPerson("teacher", body);
}

async function updateUser(userIdValue, body) {
    const userId = requireUuid(userIdValue, "User ID");
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(body || {}, "displayName")) {
        fields.push("display_name = ?");
        values.push(requireString(body.displayName, "Name", 160));
    }
    if (Object.prototype.hasOwnProperty.call(body || {}, "email")) {
        fields.push("email = ?");
        values.push(requireEmail(body.email));
    }
    if (!fields.length) throw new ApiError(400, "VALIDATION_ERROR", "Provide a permitted account field to update.");
    values.push(userId);
    try {
        const [result] = await db.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
        if (!result.affectedRows) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
    } catch (error) {
        handleDuplicate(error, "An account already uses this email address.");
    }
    return { userId };
}

async function updateAccountStatus(userIdValue, statusValue) {
    const userId = requireUuid(userIdValue, "User ID");
    const accountStatus = requireEnum(statusValue, "Account status", ["active", "disabled", "pending"]);

    const connection = await db.getConnection();
    let lockAcquired = false;
    try {
        const [locks] = await connection.execute("SELECT GET_LOCK('learnspace_admin_status', 10) AS acquired");
        lockAcquired = locks[0]?.acquired === 1;
        if (!lockAcquired) throw new ApiError(503, "ADMIN_LOCK_UNAVAILABLE", "Account status could not be updated safely. Try again.");

        await connection.beginTransaction();
        const [users] = await connection.execute(
            "SELECT id, role, account_status AS accountStatus FROM users WHERE id = ? FOR UPDATE",
            [userId]
        );
        const user = users[0];
        if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
        if (user.role === "admin" && user.accountStatus === "active" && accountStatus !== "active") {
            const [counts] = await connection.query("SELECT COUNT(*) AS activeAdmins FROM users WHERE role='admin' AND account_status='active'");
            if (Number(counts[0].activeAdmins) <= 1) {
                throw new ApiError(409, "LAST_ACTIVE_ADMIN", "The last active Admin cannot be disabled.");
            }
        }
        await connection.execute("UPDATE users SET account_status = ? WHERE id = ?", [accountStatus, userId]);
        if (accountStatus !== "active") {
            await connection.execute(
                "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL",
                [userId]
            );
        }
        await connection.commit();
        return { userId, accountStatus };
    } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
    } finally {
        if (lockAcquired) {
            try { await connection.execute("SELECT RELEASE_LOCK('learnspace_admin_status')"); } catch {}
        }
        connection.release();
    }
}

async function updateStudentAdmission(profileIdValue, statusValue) {
    const profileId = requireUuid(profileIdValue, "Student ID");
    const status = requireEnum(statusValue, "Admission status", ["admitted", "rejected"]);
    await transaction(async (connection) => {
        const [result] = await connection.execute("UPDATE student_profiles SET admission_status = ? WHERE id = ?", [status, profileId]);
        if (!result.affectedRows) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        if (status === "rejected") await connection.execute(
            `UPDATE user_sessions s JOIN student_profiles sp ON sp.user_id=s.user_id
             SET s.revoked_at=CURRENT_TIMESTAMP(3) WHERE sp.id=? AND s.revoked_at IS NULL`, [profileId]);
    });
    return { profileId, admissionStatus: status };
}

async function updateStudentAuthorization(profileIdValue, statusValue) {
    const profileId = requireUuid(profileIdValue, "Student ID");
    const status = requireEnum(statusValue, "Authorization status", ["authorized", "revoked"]);
    await transaction(async (connection) => {
        const [profiles] = await connection.execute("SELECT id,admission_status FROM student_profiles WHERE id=? FOR UPDATE", [profileId]);
        if (!profiles[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        if (status === "authorized" && profiles[0].admission_status !== "admitted") {
            throw new ApiError(409, "ADMISSION_REQUIRED", "Admit the Student before authorizing access.");
        }
        await connection.execute("UPDATE student_profiles SET authorization_status=? WHERE id=?", [status, profileId]);
        if (status === "revoked") await connection.execute(
            `UPDATE user_sessions s JOIN student_profiles sp ON sp.user_id=s.user_id
             SET s.revoked_at=CURRENT_TIMESTAMP(3) WHERE sp.id=? AND s.revoked_at IS NULL`, [profileId]);
    });
    return { profileId, authorizationStatus: status };
}

async function listSemesters() {
    const [semesters] = await db.query("SELECT id,name,academic_year AS academicYear,status,created_at AS createdAt,updated_at AS updatedAt FROM semesters ORDER BY academic_year,name");
    const [mappings] = await db.query("SELECT semester_id AS semesterId,curriculum_subject_id AS subjectId FROM semester_subjects");
    const subjectsBySemester = new Map();
    for (const mapping of mappings) {
        if (!subjectsBySemester.has(mapping.semesterId)) subjectsBySemester.set(mapping.semesterId, []);
        subjectsBySemester.get(mapping.semesterId).push(mapping.subjectId);
    }
    return semesters.map((semester) => ({ ...semester, subjectIds: subjectsBySemester.get(semester.id) || [] }));
}

async function createSemester(body) {
    const id = crypto.randomUUID();
    const name = requireString(body?.name, "Semester name", 100);
    const academicYear = requireString(body?.academicYear, "Academic year", 30);
    try {
        await db.execute("INSERT INTO semesters (id,name,academic_year,status) VALUES (?,?,?,'active')", [id, name, academicYear]);
    } catch (error) {
        handleDuplicate(error, "A semester with this name and academic year already exists.");
    }
    return { id, name, academicYear, status: "active", subjectIds: [] };
}

async function updateSemester(idValue, body) {
    const id = requireUuid(idValue, "Semester ID");
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(body || {}, "name")) { fields.push("name=?"); values.push(requireString(body.name, "Semester name", 100)); }
    if (Object.prototype.hasOwnProperty.call(body || {}, "academicYear")) { fields.push("academic_year=?"); values.push(requireString(body.academicYear, "Academic year", 30)); }
    if (Object.prototype.hasOwnProperty.call(body || {}, "status")) { fields.push("status=?"); values.push(requireEnum(body.status, "Semester status", ["active", "inactive"])); }
    if (!fields.length) throw new ApiError(400, "VALIDATION_ERROR", "Provide semester fields to update.");
    values.push(id);
    try {
        const [result] = await db.execute(`UPDATE semesters SET ${fields.join(",")} WHERE id=?`, values);
        if (!result.affectedRows) throw new ApiError(404, "SEMESTER_NOT_FOUND", "Semester not found.");
    } catch (error) { handleDuplicate(error, "A semester with this name and academic year already exists."); }
    return { id };
}

async function listSubjects() {
    const [subjects] = await db.query("SELECT id,code,name,description,status,created_at AS createdAt,updated_at AS updatedAt FROM curriculum_subjects ORDER BY code");
    const [mappings] = await db.query("SELECT curriculum_subject_id AS subjectId,semester_id AS semesterId FROM semester_subjects");
    const semestersBySubject = new Map();
    for (const mapping of mappings) {
        if (!semestersBySubject.has(mapping.subjectId)) semestersBySubject.set(mapping.subjectId, []);
        semestersBySubject.get(mapping.subjectId).push(mapping.semesterId);
    }
    return subjects.map((subject) => ({ ...subject, semesterIds: semestersBySubject.get(subject.id) || [] }));
}

async function createSubject(body) {
    const id = crypto.randomUUID();
    const code = requireString(body?.code, "Subject code", 40).toUpperCase();
    const name = requireString(body?.name, "Subject name", 160);
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (description.length > 65535) throw new ApiError(400, "VALIDATION_ERROR", "Description is too long.");
    try {
        await db.execute("INSERT INTO curriculum_subjects (id,code,name,description,status) VALUES (?,?,?,?,'active')", [id, code, name, description]);
    } catch (error) { handleDuplicate(error, "A curriculum subject with this code already exists."); }
    return { id, code, name, description, status: "active", semesterIds: [] };
}

async function updateSubject(idValue, body) {
    const id = requireUuid(idValue, "Subject ID");
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(body || {}, "code")) { fields.push("code=?"); values.push(requireString(body.code, "Subject code", 40).toUpperCase()); }
    if (Object.prototype.hasOwnProperty.call(body || {}, "name")) { fields.push("name=?"); values.push(requireString(body.name, "Subject name", 160)); }
    if (Object.prototype.hasOwnProperty.call(body || {}, "description")) { fields.push("description=?"); values.push(requireString(body.description, "Description", 65535, { optional: true }) || ""); }
    if (Object.prototype.hasOwnProperty.call(body || {}, "status")) { fields.push("status=?"); values.push(requireEnum(body.status, "Subject status", ["active", "inactive"])); }
    if (!fields.length) throw new ApiError(400, "VALIDATION_ERROR", "Provide subject fields to update.");
    values.push(id);
    try {
        const [result] = await db.execute(`UPDATE curriculum_subjects SET ${fields.join(",")} WHERE id=?`, values);
        if (!result.affectedRows) throw new ApiError(404, "SUBJECT_NOT_FOUND", "Curriculum subject not found.");
    } catch (error) { handleDuplicate(error, "A curriculum subject with this code already exists."); }
    return { id };
}

async function mapSubject(semesterValue, subjectValue) {
    const semesterId = requireUuid(semesterValue, "Semester ID");
    const subjectId = requireUuid(subjectValue, "Subject ID");
    await transaction(async (connection) => {
        const [semesters] = await connection.execute("SELECT id,status FROM semesters WHERE id=? FOR UPDATE", [semesterId]);
        const [subjects] = await connection.execute("SELECT id,status FROM curriculum_subjects WHERE id=? FOR UPDATE", [subjectId]);
        if (!semesters[0]) throw new ApiError(404, "SEMESTER_NOT_FOUND", "Semester not found.");
        if (!subjects[0]) throw new ApiError(404, "SUBJECT_NOT_FOUND", "Curriculum subject not found.");
        if (semesters[0].status !== "active" || subjects[0].status !== "active") {
            throw new ApiError(409, "ACADEMIC_RECORD_INACTIVE", "Only active semesters and subjects can be mapped.");
        }
        try {
            await connection.execute("INSERT INTO semester_subjects (semester_id,curriculum_subject_id) VALUES (?,?)", [semesterId, subjectId]);
        } catch (error) { handleDuplicate(error, "This subject is already mapped to that semester."); }
    });
    return { semesterId, subjectId };
}

async function unmapSubject(semesterValue, subjectValue) {
    const semesterId = requireUuid(semesterValue, "Semester ID");
    const subjectId = requireUuid(subjectValue, "Subject ID");
    const [result] = await db.execute("DELETE FROM semester_subjects WHERE semester_id=? AND curriculum_subject_id=?", [semesterId, subjectId]);
    if (!result.affectedRows) throw new ApiError(404, "MAPPING_NOT_FOUND", "Semester-subject mapping not found.");
    return { semesterId, subjectId };
}

async function allocateStudent(profileValue, semesterValue, actorId, reason = null) {
    const profileId = requireUuid(profileValue, "Student ID");
    const semesterId = requireUuid(semesterValue, "Semester ID");
    const note = reason == null ? null : requireString(reason, "Reason", 500, { optional: true });
    return transaction(async (connection) => {
        const [profiles] = await connection.execute(
            `SELECT sp.id,sp.user_id,sp.current_semester_id,sp.admission_status,sp.authorization_status,u.account_status
             FROM student_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=? FOR UPDATE`, [profileId]);
        if (!profiles[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        if (profiles[0].account_status !== "active" || profiles[0].admission_status !== "admitted" || profiles[0].authorization_status !== "authorized") {
            throw new ApiError(409, "STUDENT_NOT_ELIGIBLE", "Student must be active, admitted, and authorized before allocation.");
        }
        const [semesters] = await connection.execute("SELECT id,status FROM semesters WHERE id=? FOR UPDATE", [semesterId]);
        if (!semesters[0]) throw new ApiError(404, "SEMESTER_NOT_FOUND", "Semester not found.");
        if (semesters[0].status !== "active") throw new ApiError(409, "SEMESTER_INACTIVE", "Students can only be allocated to an active semester.");
        const previousSemesterId = profiles[0].current_semester_id;
        if (previousSemesterId === semesterId) throw new ApiError(409, "ALREADY_ALLOCATED", "Student is already allocated to this semester.");
        await connection.execute("UPDATE student_profiles SET current_semester_id=? WHERE id=?", [semesterId, profileId]);
        await connection.execute(
            "INSERT INTO student_semester_history (student_profile_id,from_semester_id,to_semester_id,changed_by_user_id,reason) VALUES (?,?,?,?,?)",
            [profileId, previousSemesterId, semesterId, actorId, note]
        );
        return { profileId, fromSemesterId: previousSemesterId, toSemesterId: semesterId };
    });
}

async function createEnrollmentRequest(profileIdValue, semesterValue) {
    const profileId = requireUuid(profileIdValue, "Student ID");
    const semesterId = requireUuid(semesterValue, "Semester ID");
    const id = crypto.randomUUID();
    await transaction(async (connection) => {
        const [profiles] = await connection.execute(
            `SELECT sp.id,sp.current_semester_id,sp.admission_status,sp.authorization_status,u.account_status
             FROM student_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=? FOR UPDATE`, [profileId]);
        if (!profiles[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        if (profiles[0].account_status !== "active" || profiles[0].admission_status !== "admitted" || profiles[0].authorization_status !== "authorized") {
            throw new ApiError(403, "STUDENT_NOT_ELIGIBLE", "Student must be active, admitted, and authorized to request allocation.");
        }
        if (profiles[0].current_semester_id === semesterId) throw new ApiError(409, "ALREADY_ALLOCATED", "You are already allocated to this semester.");
        const [semester] = await connection.execute("SELECT id,status FROM semesters WHERE id=? FOR UPDATE", [semesterId]);
        if (!semester[0]) throw new ApiError(404, "SEMESTER_NOT_FOUND", "Semester not found.");
        if (semester[0].status !== "active") throw new ApiError(409, "SEMESTER_INACTIVE", "Enrollment requests require an active semester.");
        const [pending] = await connection.execute("SELECT id FROM student_enrollment_requests WHERE student_profile_id=? AND status='pending' LIMIT 1 FOR UPDATE", [profileId]);
        if (pending[0]) throw new ApiError(409, "PENDING_REQUEST_EXISTS", "You already have a pending enrollment request.");
        await connection.execute("INSERT INTO student_enrollment_requests (id,student_profile_id,semester_id,status) VALUES (?,?,?,'pending')", [id, profileId, semesterId]);
    });
    return { id, studentProfileId: profileId, semesterId, status: "pending" };
}

async function withdrawEnrollmentRequest(profileIdValue, requestValue) {
    const profileId = requireUuid(profileIdValue, "Student ID");
    const requestId = requireUuid(requestValue, "Request ID");
    return transaction(async (connection) => {
        const [profiles] = await connection.execute("SELECT id FROM student_profiles WHERE id=? FOR UPDATE", [profileId]);
        if (!profiles[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        const [requests] = await connection.execute(
            "SELECT id,status FROM student_enrollment_requests WHERE id=? AND student_profile_id=? FOR UPDATE",
            [requestId, profileId]
        );
        if (!requests[0]) throw new ApiError(404, "REQUEST_NOT_FOUND", "Enrollment request not found.");
        if (requests[0].status !== "pending") throw new ApiError(409, "REQUEST_ALREADY_REVIEWED", "Only a pending request can be withdrawn.");
        await connection.execute("UPDATE student_enrollment_requests SET status='withdrawn' WHERE id=?", [requestId]);
        return { requestId, status: "withdrawn" };
    });
}

async function listEnrollmentRequests() {
    const [rows] = await db.query(
        `SELECT r.id,r.student_profile_id AS studentProfileId,r.semester_id AS semesterId,
            r.status,r.requested_at AS requestedAt,r.reviewed_at AS reviewedAt,
            r.review_note AS reviewNote,u.display_name AS studentName,u.email,
            sem.name AS semesterName,sem.academic_year AS academicYear
         FROM student_enrollment_requests r
         JOIN student_profiles sp ON sp.id=r.student_profile_id
         JOIN users u ON u.id=sp.user_id
         JOIN semesters sem ON sem.id=r.semester_id
         ORDER BY (r.status='pending') DESC,r.requested_at DESC`
    );
    return rows;
}

async function reviewEnrollmentRequest(requestValue, decisionValue, actorId, reviewNoteValue) {
    const requestId = requireUuid(requestValue, "Request ID");
    const status = requireEnum(decisionValue, "Decision", ["approved", "rejected"]);
    const reviewNote = reviewNoteValue == null ? null : requireString(reviewNoteValue, "Review note", 1000, { optional: true });
    return transaction(async (connection) => {
        // Lock the Student first, matching request creation's lock order.
        const [initial] = await connection.execute("SELECT student_profile_id FROM student_enrollment_requests WHERE id=?", [requestId]);
        if (!initial[0]) throw new ApiError(404, "REQUEST_NOT_FOUND", "Enrollment request not found.");
        const [profiles] = await connection.execute(
            "SELECT id,current_semester_id,admission_status,authorization_status FROM student_profiles WHERE id=? FOR UPDATE",
            [initial[0].student_profile_id]
        );
        if (!profiles[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        const [requests] = await connection.execute("SELECT id,student_profile_id,semester_id,status FROM student_enrollment_requests WHERE id=? FOR UPDATE", [requestId]);
        const request = requests[0];
        if (!request) throw new ApiError(404, "REQUEST_NOT_FOUND", "Enrollment request not found.");
        if (request.status !== "pending") throw new ApiError(409, "REQUEST_ALREADY_REVIEWED", "This enrollment request has already been processed.");
        if (status === "approved") {
            const [studentUsers] = await connection.execute("SELECT u.account_status FROM users u JOIN student_profiles sp ON sp.user_id=u.id WHERE sp.id=? FOR UPDATE", [request.student_profile_id]);
            if (studentUsers[0]?.account_status !== "active" || profiles[0].admission_status !== "admitted" || profiles[0].authorization_status !== "authorized") {
                throw new ApiError(409, "STUDENT_NOT_ELIGIBLE", "Student must be active, admitted, and authorized before allocation.");
            }
            const [semesters] = await connection.execute("SELECT id,status FROM semesters WHERE id=? FOR UPDATE", [request.semester_id]);
            if (!semesters[0] || semesters[0].status !== "active") throw new ApiError(409, "SEMESTER_INACTIVE", "The requested semester is no longer active.");
            if (profiles[0].current_semester_id === request.semester_id) throw new ApiError(409, "ALREADY_ALLOCATED", "Student is already allocated to the requested semester.");
            await connection.execute("UPDATE student_profiles SET current_semester_id=? WHERE id=?", [request.semester_id, request.student_profile_id]);
            await connection.execute(
                "INSERT INTO student_semester_history (student_profile_id,from_semester_id,to_semester_id,changed_by_user_id,reason) VALUES (?,?,?,?,?)",
                [request.student_profile_id, profiles[0].current_semester_id, request.semester_id, actorId, "Enrollment request approved"]
            );
        }
        await connection.execute(
            `UPDATE student_enrollment_requests SET status=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP(3),review_note=? WHERE id=?`,
            [status, actorId, reviewNote, requestId]
        );
        return { requestId, status, studentProfileId: request.student_profile_id, semesterId: request.semester_id };
    });
}

async function getDashboardSummary() {
    const [[students]] = await db.query("SELECT COUNT(*) AS total, SUM(admission_status='admitted') AS admitted, SUM(admission_status='pending') AS pending FROM student_profiles");
    const [[teachers]] = await db.query("SELECT COUNT(*) AS total FROM teacher_profiles");
    const [[semesters]] = await db.query("SELECT COUNT(*) AS total FROM semesters");
    const [[subjects]] = await db.query("SELECT COUNT(*) AS total FROM curriculum_subjects");
    return { students, teachers, semesters, subjects };
}

module.exports = {
    listStudents, getStudent, listTeachers, getTeacher, createStudent, createTeacher,
    updateUser, updateAccountStatus, updateStudentAdmission, updateStudentAuthorization,
    listSemesters, createSemester, updateSemester, listSubjects, createSubject, updateSubject,
    mapSubject, unmapSubject, allocateStudent, createEnrollmentRequest,
    withdrawEnrollmentRequest, listEnrollmentRequests, reviewEnrollmentRequest, getDashboardSummary
};
