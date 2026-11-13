const crypto = require("node:crypto");
const path = require("node:path");
const db = require("../config/db");
const transaction = require("../utils/transaction");
const ApiError = require("../utils/ApiError");
const { requireString, requireUuid, requireEnum } = require("../utils/validation");
const storage = require("../storage");
const { queueUnreferencedFiles, drainCleanupJobs, pendingAssetCleanupCount } = require("./file-cleanup.service");

const types = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function bad(message, code = "VALIDATION_ERROR", status = 400) { throw new ApiError(status, code, message); }
function dateValue(value, field) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) bad(`${field} must be a valid date and time.`);
    return new Date(value).toISOString().slice(0, 23).replace("T", " ");
}
function optionalDate(value, field) { return value == null || value === "" ? null : dateValue(value, field); }
function positiveMarks(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 999999.99 || Math.round(number * 100) !== number * 100) bad("Maximum marks must be greater than zero and have at most two decimal places.");
    return number.toFixed(2);
}
function googleFormsUrl(value) {
    let url;
    try { url = new URL(value); } catch { bad("Enter a valid Google Forms URL."); }
    const allowed = url.protocol === "https:" && ((url.hostname === "docs.google.com" && /^\/forms\//.test(url.pathname)) ||
        (url.hostname === "forms.gle" && url.pathname.length > 1));
    if (!allowed || url.username || url.password) bad("Quiz links must use Google Forms.");
    return url.toString();
}
function safeExternalUrl(value) {
    if (!value) return null;
    let url;
    try { url = new URL(value); } catch { bad("Enter a valid external material URL."); }
    if (url.protocol !== "https:" || url.username || url.password) bad("External material links must use HTTPS.");
    return url.toString();
}
function mapOffering(row) {
    return {
        id: row.id, teacherProfileId: row.teacherProfileId, curriculumSubjectId: row.curriculumSubjectId,
        semesterId: row.semesterId, sectionCode: row.sectionCode, description: row.description,
        status: row.status, subjectCode: row.subjectCode, subjectName: row.subjectName,
        academicYear: row.academicYear, semesterName: row.semesterName,
        teacherName: row.teacherName, createdAt: row.createdAt
    };
}
const offeringSelect = `SELECT o.id,o.teacher_profile_id AS teacherProfileId,o.curriculum_subject_id AS curriculumSubjectId,
    o.semester_id AS semesterId,o.section_code AS sectionCode,o.description,o.status,
    cs.code AS subjectCode,cs.name AS subjectName,s.name AS semesterName,s.academic_year AS academicYear,
    u.display_name AS teacherName,o.created_at AS createdAt
    FROM offerings o JOIN curriculum_subjects cs ON cs.id=o.curriculum_subject_id
    JOIN semesters s ON s.id=o.semester_id JOIN teacher_profiles tp ON tp.id=o.teacher_profile_id
    JOIN users u ON u.id=tp.user_id`;

async function teacherOffering(connection, teacherProfileId, offeringId, lock = false) {
    const [rows] = await connection.execute(
        `${offeringSelect} WHERE o.teacher_profile_id=? AND o.id=?${lock ? " FOR UPDATE" : ""}`,
        [teacherProfileId, offeringId]
    );
    if (!rows[0]) throw new ApiError(404, "OFFERING_NOT_FOUND", "Offering not found.");
    return mapOffering(rows[0]);
}

async function eligibleStudentOffering(connection, studentProfileId, offeringId, lock = false) {
    const [rows] = await connection.execute(
        `${offeringSelect}
         JOIN student_profiles sp ON sp.current_semester_id=o.semester_id
         JOIN users su ON su.id=sp.user_id
         WHERE sp.id=? AND o.id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized'
           AND su.account_status='active' AND o.status='active' AND s.status='active' AND cs.status='active'
         ${lock ? "FOR UPDATE" : ""}`,
        [studentProfileId, offeringId]
    );
    if (!rows[0]) throw new ApiError(404, "OFFERING_NOT_FOUND", "This offering is unavailable for your current semester.");
    return mapOffering(rows[0]);
}

async function createAsset(connection, file, userId) {
    if (!file?.buffer || !file.size || file.size > MAX_FILE_SIZE) bad("Each file must be between 1 byte and 10 MB.", "INVALID_FILE");
    const extension = path.extname(file.originalname || "").toLowerCase();
    const contentType = types[extension];
    if (!contentType) bad("This file type is not supported.", "UNSUPPORTED_FILE");
    const id = crypto.randomUUID();
    const key = `${id}${extension}`;
    await storage.put(key, file.buffer);
    try {
        const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
        await connection.execute(
            `INSERT INTO file_assets (id,storage_provider,storage_key,original_filename,content_type,size_bytes,sha256,uploaded_by_user_id,status)
             VALUES (?,?,?,?,?,?,?,?, 'available')`,
            [id, storage.provider, key, String(file.originalname || "file").split(/[\\/]/).pop().replace(/[\r\n\0]/g, "_").slice(0, 255), contentType, file.size, sha256, userId]
        );
    } catch (error) {
        await storage.remove(key).catch(() => {});
        throw error;
    }
    return { id, key, contentType, size: file.size };
}

async function removeNewAssets(assets) {
    for (const asset of assets) await storage.remove(asset.key).catch(() => {});
}

async function getTeacherCurriculum() {
    const [rows] = await db.execute(
        `SELECT ss.semester_id AS semesterId,s.name AS semesterName,s.academic_year AS academicYear,
                cs.id AS subjectId,cs.code,cs.name,cs.description
         FROM semester_subjects ss JOIN semesters s ON s.id=ss.semester_id
         JOIN curriculum_subjects cs ON cs.id=ss.curriculum_subject_id
         WHERE s.status='active' AND cs.status='active' ORDER BY s.academic_year,s.name,cs.code`
    );
    return rows;
}

async function listTeacherOfferings(teacherProfileId) {
    const [rows] = await db.execute(`${offeringSelect} WHERE o.teacher_profile_id=? ORDER BY o.created_at DESC`, [teacherProfileId]);
    return rows.map(mapOffering);
}

async function createOffering(teacherProfileId, body) {
    const subjectId = requireUuid(body?.curriculumSubjectId, "Curriculum subject ID");
    const semesterId = requireUuid(body?.semesterId, "Semester ID");
    const section = requireString(body?.sectionCode ?? "", "Section", 40, { optional: true }) || "";
    const description = requireString(body?.description ?? "", "Description", 20000, { optional: true }) || "";
    return transaction(async (connection) => {
        const [mapping] = await connection.execute(
            `SELECT ss.semester_id FROM semester_subjects ss
             JOIN semesters s ON s.id=ss.semester_id JOIN curriculum_subjects cs ON cs.id=ss.curriculum_subject_id
             WHERE ss.semester_id=? AND ss.curriculum_subject_id=? AND s.status='active' AND cs.status='active' FOR UPDATE`,
            [semesterId, subjectId]
        );
        if (!mapping[0]) bad("Choose an active official subject mapped to the selected semester.", "INVALID_CURRICULUM_MAPPING", 409);
        const id = crypto.randomUUID();
        try {
            await connection.execute(
                `INSERT INTO offerings (id,teacher_profile_id,curriculum_subject_id,semester_id,section_code,description,status)
                 VALUES (?,?,?,?,?,?,'active')`, [id, teacherProfileId, subjectId, semesterId, section, description]
            );
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") bad("You already have an offering for this subject, semester, and section.", "DUPLICATE_OFFERING", 409);
            throw error;
        }
        return teacherOffering(connection, teacherProfileId, id);
    });
}

async function getTeacherOffering(teacherProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    const offering = await teacherOffering(db, teacherProfileId, id);
    const [materials] = await db.execute(
        `SELECT m.id,m.file_asset_id AS fileAssetId,m.title,m.material_type AS materialType,m.description,m.external_url AS externalUrl,
                m.created_at AS createdAt,fa.original_filename AS filename,fa.content_type AS contentType,fa.size_bytes AS sizeBytes
         FROM materials m LEFT JOIN file_assets fa ON fa.id=m.file_asset_id WHERE m.offering_id=? ORDER BY m.created_at DESC`, [id]
    );
    const [assignments] = await db.execute(
        `SELECT a.id,a.title,a.description,a.start_at AS startAt,a.due_at AS dueAt,a.marks,a.status,a.created_at AS createdAt,
                COUNT(s.id) AS submissionCount,SUM(s.status IN ('submitted','late','graded')) AS submittedCount
         FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id
         WHERE a.offering_id=? GROUP BY a.id ORDER BY a.due_at`, [id]
    );
    const [quizzes] = await db.execute(
        `SELECT id,title,description,google_form_url AS googleFormUrl,duration_minutes AS durationMinutes,
                start_at AS startAt,due_at AS dueAt,status FROM quizzes WHERE offering_id=? ORDER BY start_at`, [id]
    );
    const [sessions] = await db.execute(
        `SELECT ats.id,ats.title,ats.starts_at AS startsAt,ats.ends_at AS endsAt,ats.status,
                COUNT(ar.id) AS markedCount FROM attendance_sessions ats LEFT JOIN attendance_records ar ON ar.attendance_session_id=ats.id
         WHERE ats.offering_id=? GROUP BY ats.id ORDER BY ats.starts_at DESC`, [id]
    );
    const [[count]] = await db.execute(
        `SELECT COUNT(*) AS total FROM student_profiles sp JOIN users u ON u.id=sp.user_id
         WHERE sp.current_semester_id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized' AND u.account_status='active'`,
        [offering.semesterId]
    );
    return { offering, materials, assignments, quizzes, attendanceSessions: sessions, eligibleStudentCount: Number(count.total) };
}

async function updateOffering(teacherProfileId, offeringId, body) {
    const id = requireUuid(offeringId, "Offering ID");
    return transaction(async (connection) => {
        const offering = await teacherOffering(connection, teacherProfileId, id, true);
        const description = body?.description === undefined ? offering.description : requireString(body.description, "Description", 20000, { optional: true }) || "";
        const section = body?.sectionCode === undefined ? offering.sectionCode : requireString(body.sectionCode, "Section", 40, { optional: true }) || "";
        const status = body?.status === undefined ? offering.status : requireEnum(body.status, "Status", ["active", "inactive"]);
        try {
            await connection.execute("UPDATE offerings SET description=?,section_code=?,status=? WHERE id=?", [description, section, status, id]);
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") bad("That offering section already exists for this subject and semester.", "DUPLICATE_OFFERING", 409);
            throw error;
        }
        return teacherOffering(connection, teacherProfileId, id);
    });
}

async function offeringFileIds(connection, offeringId) {
    const [rows] = await connection.execute(
        `SELECT file_asset_id AS id FROM materials WHERE offering_id=? AND file_asset_id IS NOT NULL
         UNION SELECT sf.file_asset_id AS id FROM submission_files sf JOIN assignment_submissions sub ON sub.id=sf.submission_id
         JOIN assignments a ON a.id=sub.assignment_id WHERE a.offering_id=?`, [offeringId, offeringId]
    );
    return rows.map((row) => row.id);
}

async function deleteOfferingInTransaction(connection, offeringId) {
    const fileIds = await offeringFileIds(connection, offeringId);
    await connection.execute(
        `DELETE sf FROM submission_files sf JOIN assignment_submissions sub ON sub.id=sf.submission_id
         JOIN assignments a ON a.id=sub.assignment_id WHERE a.offering_id=?`, [offeringId]
    );
    await connection.execute("DELETE FROM materials WHERE offering_id=?", [offeringId]);
    await connection.execute("DELETE FROM offerings WHERE id=?", [offeringId]);
    return fileIds;
}

async function finishDeletion(fileIds) {
    await transaction((connection) => queueUnreferencedFiles(connection, fileIds));
    const results = await drainCleanupJobs(fileIds);
    const pendingCount = await pendingAssetCleanupCount(fileIds);
    if (results.some((result) => !result.complete) || pendingCount > 0) {
        throw new ApiError(503, "FILE_CLEANUP_PENDING", "Database deletion is complete, but private file cleanup is still pending. The cleanup worker will retry.");
    }
}

async function deleteOffering(teacherProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    const fileIds = await transaction(async (connection) => {
        await teacherOffering(connection, teacherProfileId, id, true);
        return deleteOfferingInTransaction(connection, id);
    });
    await finishDeletion(fileIds);
    return { deleted: true };
}

async function createMaterial(teacherProfileId, userId, offeringId, body, files) {
    const id = requireUuid(offeringId, "Offering ID");
    const title = requireString(body?.title, "Title", 200);
    const type = requireEnum(body?.materialType, "Material type", ["book", "notes", "resource"]);
    const description = requireString(body?.description ?? "", "Description", 20000, { optional: true }) || "";
    const externalUrl = safeExternalUrl(body?.externalUrl || null);
    if ((files?.length || 0) > 1 || (!files?.length && !externalUrl)) bad("Add one file or an HTTPS resource link.");
    const saved = [];
    try {
        const result = await transaction(async (connection) => {
            await teacherOffering(connection, teacherProfileId, id, true);
            const asset = files?.[0] ? await createAsset(connection, files[0], userId) : null;
            if (asset) saved.push(asset);
            const materialId = crypto.randomUUID();
            await connection.execute(
                `INSERT INTO materials (id,offering_id,file_asset_id,title,material_type,description,external_url)
                 VALUES (?,?,?,?,?,?,?)`, [materialId, id, asset?.id || null, title, type, description, externalUrl]
            );
            return { id: materialId, offeringId: id, title, materialType: type, description, externalUrl, fileAssetId: asset?.id || null };
        });
        return result;
    } catch (error) { await removeNewAssets(saved); throw error; }
}

async function updateMaterial(teacherProfileId, materialId, body) {
    const id = requireUuid(materialId, "Material ID");
    return transaction(async (connection) => {
        const [rows] = await connection.execute(
            `SELECT m.id,m.offering_id AS offeringId,m.title,m.material_type AS materialType,m.description,m.external_url AS externalUrl
             FROM materials m JOIN offerings o ON o.id=m.offering_id WHERE m.id=? AND o.teacher_profile_id=? FOR UPDATE`,
            [id, teacherProfileId]
        );
        const current = rows[0];
        if (!current) throw new ApiError(404, "MATERIAL_NOT_FOUND", "Material not found.");
        const title = body?.title === undefined ? current.title : requireString(body.title, "Title", 200);
        const description = body?.description === undefined ? current.description : requireString(body.description, "Description", 20000, { optional: true }) || "";
        const type = body?.materialType === undefined ? current.materialType : requireEnum(body.materialType, "Material type", ["book", "notes", "resource"]);
        const url = body?.externalUrl === undefined ? current.externalUrl : safeExternalUrl(body.externalUrl || null);
        const [assetRows] = await connection.execute("SELECT file_asset_id AS fileAssetId FROM materials WHERE id=?", [id]);
        if (!url && !assetRows[0]?.fileAssetId) bad("A material must retain a file or an external resource link.");
        await connection.execute("UPDATE materials SET title=?,material_type=?,description=?,external_url=? WHERE id=?", [title, type, description, url, id]);
        return { ...current, title, description, materialType: type, externalUrl: url };
    });
}

async function deleteMaterial(teacherProfileId, materialId) {
    const id = requireUuid(materialId, "Material ID");
    const fileIds = await transaction(async (connection) => {
        const [rows] = await connection.execute(
            "SELECT m.file_asset_id AS fileAssetId FROM materials m JOIN offerings o ON o.id=m.offering_id WHERE m.id=? AND o.teacher_profile_id=? FOR UPDATE",
            [id, teacherProfileId]
        );
        if (!rows[0]) throw new ApiError(404, "MATERIAL_NOT_FOUND", "Material not found.");
        await connection.execute("DELETE FROM materials WHERE id=?", [id]);
        return rows[0].fileAssetId ? [rows[0].fileAssetId] : [];
    });
    await finishDeletion(fileIds);
    return { deleted: true };
}

async function createAssignment(teacherProfileId, offeringId, body) {
    const id = requireUuid(offeringId, "Offering ID");
    const title = requireString(body?.title, "Title", 200);
    const description = requireString(body?.description ?? "", "Description", 20000, { optional: true }) || "";
    const startAt = dateValue(body?.startAt, "Start time");
    const dueAt = dateValue(body?.dueAt, "Due time");
    if (Date.parse(startAt) >= Date.parse(dueAt)) bad("The assignment deadline must be after its start time.");
    const marks = positiveMarks(body?.maximumMarks ?? body?.marks);
    const status = requireEnum(body?.status || "published", "Status", ["draft", "published"]);
    return transaction(async (connection) => {
        await teacherOffering(connection, teacherProfileId, id, true);
        const assignmentId = crypto.randomUUID();
        await connection.execute(
            `INSERT INTO assignments (id,offering_id,title,description,start_at,due_at,marks,status) VALUES (?,?,?,?,?,?,?,?)`,
            [assignmentId, id, title, description, startAt, dueAt, marks, status]
        );
        return { id: assignmentId, offeringId: id, title, description, startAt, dueAt, marks, status };
    });
}

async function updateAssignment(teacherProfileId, assignmentId, body) {
    const id = requireUuid(assignmentId, "Assignment ID");
    return transaction(async (connection) => {
        const [rows] = await connection.execute(
            `SELECT a.* FROM assignments a JOIN offerings o ON o.id=a.offering_id WHERE a.id=? AND o.teacher_profile_id=? FOR UPDATE`,
            [id, teacherProfileId]
        );
        const row = rows[0];
        if (!row) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
        const startAt = body?.startAt === undefined ? row.start_at : dateValue(body.startAt, "Start time");
        const dueAt = body?.dueAt === undefined ? row.due_at : dateValue(body.dueAt, "Due time");
        if (Date.parse(startAt) >= Date.parse(dueAt)) bad("The assignment deadline must be after its start time.");
        const title = body?.title === undefined ? row.title : requireString(body.title, "Title", 200);
        const description = body?.description === undefined ? row.description : requireString(body.description, "Description", 20000, { optional: true }) || "";
        const marks = body?.marks === undefined ? row.marks : positiveMarks(body.marks);
        if (marks != null) {
            const [[topGrade]] = await connection.execute("SELECT MAX(grade) AS maximumGrade FROM assignment_submissions WHERE assignment_id=?", [id]);
            if (topGrade.maximumGrade != null && Number(topGrade.maximumGrade) > Number(marks)) {
                bad("Maximum marks cannot be lower than a grade already returned.", "MAXIMUM_MARKS_CONFLICT", 409);
            }
        }
        const status = body?.status === undefined ? row.status : requireEnum(body.status, "Status", ["draft", "published", "closed"]);
        await connection.execute("UPDATE assignments SET title=?,description=?,start_at=?,due_at=?,marks=?,status=? WHERE id=?", [title, description, startAt, dueAt, marks, status, id]);
        return { id, offeringId: row.offering_id, title, description, startAt, dueAt, marks, status };
    });
}

async function deleteAssignment(teacherProfileId, assignmentId) {
    const id = requireUuid(assignmentId, "Assignment ID");
    const fileIds = await transaction(async (connection) => {
        const [rows] = await connection.execute(
            `SELECT a.id FROM assignments a JOIN offerings o ON o.id=a.offering_id WHERE a.id=? AND o.teacher_profile_id=? FOR UPDATE`,
            [id, teacherProfileId]
        );
        if (!rows[0]) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
        const [assets] = await connection.execute(
            `SELECT DISTINCT sf.file_asset_id AS id FROM submission_files sf JOIN assignment_submissions s ON s.id=sf.submission_id WHERE s.assignment_id=?`, [id]
        );
        await connection.execute("DELETE sf FROM submission_files sf JOIN assignment_submissions s ON s.id=sf.submission_id WHERE s.assignment_id=?", [id]);
        await connection.execute("DELETE FROM assignments WHERE id=?", [id]);
        return assets.map((item) => item.id);
    });
    await finishDeletion(fileIds);
    return { deleted: true };
}

async function listSubmissions(teacherProfileId, assignmentId) {
    const id = requireUuid(assignmentId, "Assignment ID");
    const [owner] = await db.execute("SELECT a.id FROM assignments a JOIN offerings o ON o.id=a.offering_id WHERE a.id=? AND o.teacher_profile_id=?", [id, teacherProfileId]);
    if (!owner[0]) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    const [rows] = await db.execute(
        `SELECT s.id,s.student_profile_id AS studentProfileId,u.display_name AS studentName,u.email,s.status,s.submitted_at AS submittedAt,
                s.grade,s.feedback,s.graded_at AS gradedAt
         FROM assignment_submissions s JOIN student_profiles sp ON sp.id=s.student_profile_id JOIN users u ON u.id=sp.user_id
         WHERE s.assignment_id=? AND s.status<>'draft' ORDER BY s.submitted_at`, [id]
    );
    for (const row of rows) {
        const [files] = await db.execute(
            `SELECT sf.file_asset_id AS fileAssetId,fa.original_filename AS filename,fa.size_bytes AS sizeBytes
             FROM submission_files sf JOIN file_assets fa ON fa.id=sf.file_asset_id WHERE sf.submission_id=?`, [row.id]
        );
        row.files = files.map((file) => ({ ...file, downloadUrl: `/api/files/${file.fileAssetId}` }));
    }
    return rows;
}

async function gradeSubmission(teacherProfileId, submissionId, body, userId) {
    const id = requireUuid(submissionId, "Submission ID");
    const grade = Number(body?.grade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 999999.99 || Math.round(grade * 100) !== grade * 100) bad("Grade must be a nonnegative number with at most two decimal places.");
    const feedback = requireString(body?.feedback ?? "", "Feedback", 20000, { optional: true }) || "";
    return transaction(async (connection) => {
        const [rows] = await connection.execute(
            `SELECT s.id,s.status,a.marks FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
             JOIN offerings o ON o.id=a.offering_id WHERE s.id=? AND o.teacher_profile_id=? FOR UPDATE`,
            [id, teacherProfileId]
        );
        const row = rows[0];
        if (!row) throw new ApiError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
        if (row.status === "draft") bad("Only submitted work can be graded.", "SUBMISSION_NOT_READY", 409);
        if (row.marks != null && grade > Number(row.marks)) bad("Grade cannot exceed the assignment maximum marks.");
        await connection.execute(
            `UPDATE assignment_submissions SET status='graded',grade=?,feedback=?,graded_by_user_id=?,graded_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
            [grade.toFixed(2), feedback, userId, id]
        );
        return { id, status: "graded", grade: grade.toFixed(2), feedback };
    });
}

async function createQuiz(teacherProfileId, offeringId, body) {
    const id = requireUuid(offeringId, "Offering ID");
    const title = requireString(body?.title, "Title", 200);
    const description = requireString(body?.description ?? "", "Description", 20000, { optional: true }) || "";
    const url = googleFormsUrl(body?.googleFormUrl);
    const duration = Number(body?.durationMinutes ?? 60);
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) bad("Duration must be between 1 and 600 minutes.");
    const startAt = dateValue(body?.startAt, "Start time");
    const dueAt = dateValue(body?.dueAt, "Due time");
    if (Date.parse(startAt) >= Date.parse(dueAt)) bad("The quiz deadline must be after its start time.");
    const status = requireEnum(body?.status || "published", "Status", ["draft", "published"]);
    return transaction(async (connection) => {
        await teacherOffering(connection, teacherProfileId, id, true);
        const quizId = crypto.randomUUID();
        await connection.execute(
            `INSERT INTO quizzes (id,offering_id,title,description,google_form_url,duration_minutes,start_at,due_at,status) VALUES (?,?,?,?,?,?,?,?,?)`,
            [quizId, id, title, description, url, duration, startAt, dueAt, status]
        );
        return { id: quizId, offeringId: id, title, description, googleFormUrl: url, durationMinutes: duration, startAt, dueAt, status };
    });
}

async function updateQuiz(teacherProfileId, quizId, body) {
    const id = requireUuid(quizId, "Quiz ID");
    return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT q.* FROM quizzes q JOIN offerings o ON o.id=q.offering_id WHERE q.id=? AND o.teacher_profile_id=? FOR UPDATE", [id, teacherProfileId]);
        const row = rows[0];
        if (!row) throw new ApiError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
        const title = body?.title === undefined ? row.title : requireString(body.title, "Title", 200);
        const description = body?.description === undefined ? row.description : requireString(body.description, "Description", 20000, { optional: true }) || "";
        const url = body?.googleFormUrl === undefined ? row.google_form_url : googleFormsUrl(body.googleFormUrl);
        const duration = body?.durationMinutes === undefined ? Number(row.duration_minutes) : Number(body.durationMinutes);
        if (!Number.isInteger(duration) || duration < 1 || duration > 600) bad("Duration must be between 1 and 600 minutes.");
        const startAt = body?.startAt === undefined ? row.start_at : dateValue(body.startAt, "Start time");
        const dueAt = body?.dueAt === undefined ? row.due_at : dateValue(body.dueAt, "Due time");
        if (Date.parse(startAt) >= Date.parse(dueAt)) bad("The quiz deadline must be after its start time.");
        const status = body?.status === undefined ? row.status : requireEnum(body.status, "Status", ["draft", "published", "closed"]);
        await connection.execute("UPDATE quizzes SET title=?,description=?,google_form_url=?,duration_minutes=?,start_at=?,due_at=?,status=? WHERE id=?", [title, description, url, duration, startAt, dueAt, status, id]);
        return { id, offeringId: row.offering_id, title, description, googleFormUrl: url, durationMinutes: duration, startAt, dueAt, status };
    });
}

async function deleteOwnedChild(table, teacherProfileId, childId, errorCode, label) {
    if (!["quizzes"].includes(table)) throw new Error("Unsupported child table.");
    const id = requireUuid(childId, `${label} ID`);
    const [result] = await db.execute(`DELETE child FROM ${table} child JOIN offerings o ON o.id=child.offering_id WHERE child.id=? AND o.teacher_profile_id=?`, [id, teacherProfileId]);
    if (!result.affectedRows) throw new ApiError(404, errorCode, `${label} not found.`);
    return { deleted: true };
}

async function createAttendanceSession(teacherProfileId, offeringId, body) {
    const id = requireUuid(offeringId, "Offering ID");
    const title = requireString(body?.title, "Title", 200);
    const startsAt = dateValue(body?.startsAt, "Start time");
    const endsAt = optionalDate(body?.endsAt, "End time");
    if (endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) bad("Attendance end time must be after start time.");
    const status = requireEnum(body?.status || "held", "Status", ["scheduled", "held"]);
    return transaction(async (connection) => {
        await teacherOffering(connection, teacherProfileId, id, true);
        const sessionId = crypto.randomUUID();
        await connection.execute("INSERT INTO attendance_sessions (id,offering_id,title,starts_at,ends_at,status) VALUES (?,?,?,?,?,?)", [sessionId, id, title, startsAt, endsAt, status]);
        return { id: sessionId, offeringId: id, title, startsAt, endsAt, status };
    });
}

async function attendanceRoster(teacherProfileId, sessionId) {
    const id = requireUuid(sessionId, "Attendance session ID");
    const [sessionRows] = await db.execute(
        `SELECT ats.id,ats.offering_id AS offeringId,ats.title,ats.starts_at AS startsAt,ats.ends_at AS endsAt,ats.status
         FROM attendance_sessions ats JOIN offerings o ON o.id=ats.offering_id
         WHERE ats.id=? AND o.teacher_profile_id=?`, [id, teacherProfileId]
    );
    const session = sessionRows[0];
    if (!session) throw new ApiError(404, "ATTENDANCE_SESSION_NOT_FOUND", "Attendance session not found.");
    const offering = await teacherOffering(db, teacherProfileId, session.offeringId);
    const [students] = await db.execute(
        `SELECT sp.id AS studentProfileId,u.display_name AS studentName,u.email,ar.attendance_status AS attendanceStatus,ar.note
         FROM student_profiles sp JOIN users u ON u.id=sp.user_id
         LEFT JOIN attendance_records ar ON ar.student_profile_id=sp.id AND ar.attendance_session_id=?
         WHERE sp.current_semester_id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized' AND u.account_status='active'
         ORDER BY u.display_name`, [id, offering.semesterId]
    );
    return { session, students };
}

async function markAttendance(teacherProfileId, sessionId, studentProfileId, body, userId) {
    const id = requireUuid(sessionId, "Attendance session ID");
    const studentId = requireUuid(studentProfileId, "Student profile ID");
    const status = requireEnum(body?.attendanceStatus, "Attendance status", ["present", "absent", "late", "excused"]);
    const note = requireString(body?.note ?? "", "Note", 500, { optional: true }) || null;
    return transaction(async (connection) => {
        const [sessions] = await connection.execute(
            `SELECT ats.id, o.semester_id AS semesterId FROM attendance_sessions ats JOIN offerings o ON o.id=ats.offering_id
             WHERE ats.id=? AND o.teacher_profile_id=? AND ats.status<>'cancelled' FOR UPDATE`, [id, teacherProfileId]
        );
        if (!sessions[0]) throw new ApiError(404, "ATTENDANCE_SESSION_NOT_FOUND", "Attendance session not found.");
        const [eligible] = await connection.execute(
            `SELECT sp.id FROM student_profiles sp JOIN users u ON u.id=sp.user_id
             WHERE sp.id=? AND sp.current_semester_id=? AND sp.admission_status='admitted'
               AND sp.authorization_status='authorized' AND u.account_status='active' FOR UPDATE`,
            [studentId, sessions[0].semesterId]
        );
        if (!eligible[0]) throw new ApiError(404, "STUDENT_NOT_ELIGIBLE", "Student is not eligible for this offering.");
        const recordId = crypto.randomUUID();
        await connection.execute(
            `INSERT INTO attendance_records (id,attendance_session_id,student_profile_id,attendance_status,marked_by_user_id,note)
             VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attendance_status=VALUES(attendance_status),marked_by_user_id=VALUES(marked_by_user_id),note=VALUES(note),marked_at=CURRENT_TIMESTAMP(3)`,
            [recordId, id, studentId, status, userId, note]
        );
        const [[record]] = await connection.execute("SELECT id,attendance_session_id AS sessionId,student_profile_id AS studentProfileId,attendance_status AS attendanceStatus,note,updated_at AS updatedAt FROM attendance_records WHERE attendance_session_id=? AND student_profile_id=?", [id, studentId]);
        return record;
    });
}

async function getStudentOfferings(studentProfileId) {
    const [rows] = await db.execute(
        `${offeringSelect} JOIN student_profiles sp ON sp.current_semester_id=o.semester_id
         JOIN users su ON su.id=sp.user_id
         WHERE sp.id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized'
           AND su.account_status='active' AND o.status='active' AND s.status='active' AND cs.status='active'
         ORDER BY cs.name,o.section_code`, [studentProfileId]
    );
    return rows.map(mapOffering);
}

async function getStudentOffering(studentProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    const offering = await eligibleStudentOffering(db, studentProfileId, id);
    const [materials] = await db.execute(
        `SELECT m.id,m.file_asset_id AS fileAssetId,m.title,m.material_type AS materialType,m.description,m.external_url AS externalUrl,
                fa.original_filename AS filename,fa.content_type AS contentType,fa.size_bytes AS sizeBytes
         FROM materials m LEFT JOIN file_assets fa ON fa.id=m.file_asset_id WHERE m.offering_id=? ORDER BY m.created_at DESC`, [id]
    );
    const [assignments] = await db.execute(
        `SELECT a.id,a.title,a.description,a.start_at AS startAt,a.due_at AS dueAt,a.marks AS maximumMarks,a.status,
                sub.id AS submissionId,sub.status AS submissionStatus,sub.submitted_at AS submittedAt,
                IF(sub.status='graded',sub.grade,NULL) AS grade,IF(sub.status='graded',sub.feedback,NULL) AS feedback,
                IF(sub.status='graded',sub.graded_at,NULL) AS gradedAt
         FROM assignments a LEFT JOIN assignment_submissions sub ON sub.assignment_id=a.id AND sub.student_profile_id=?
         WHERE a.offering_id=? AND a.status='published' ORDER BY a.due_at`, [studentProfileId, id]
    );
    for (const assignment of assignments) {
        assignment.files = [];
        if (assignment.submissionId) {
            const [files] = await db.execute(
                `SELECT sf.file_asset_id AS fileAssetId,fa.original_filename AS filename,fa.size_bytes AS sizeBytes
                 FROM submission_files sf JOIN file_assets fa ON fa.id=sf.file_asset_id WHERE sf.submission_id=?`, [assignment.submissionId]
            );
            assignment.files = files;
        }
    }
    const [quizzes] = await db.execute(
        `SELECT id,title,description,google_form_url AS googleFormUrl,duration_minutes AS durationMinutes,start_at AS startAt,due_at AS dueAt
         FROM quizzes WHERE offering_id=? AND status='published' ORDER BY start_at`, [id]
    );
    const [attendance] = await db.execute(
        `SELECT ats.id,ats.title,ats.starts_at AS startsAt,ats.status,ar.attendance_status AS attendanceStatus,ar.note
         FROM attendance_sessions ats LEFT JOIN attendance_records ar ON ar.attendance_session_id=ats.id AND ar.student_profile_id=?
         WHERE ats.offering_id=? AND ats.status='held' ORDER BY ats.starts_at DESC`, [studentProfileId, id]
    );
    const [[summary]] = await db.execute(
        `SELECT COUNT(*) AS sessions,SUM(ar.attendance_status='present') AS present,
                SUM(ar.attendance_status IN ('absent','late')) AS missed
         FROM attendance_sessions ats LEFT JOIN attendance_records ar ON ar.attendance_session_id=ats.id AND ar.student_profile_id=?
         WHERE ats.offering_id=? AND ats.status='held'`, [studentProfileId, id]
    );
    return { offering, materials, assignments, quizzes, attendance: { sessions: attendance, summary } };
}

async function submitAssignment(studentProfileId, offeringId, assignmentId, files, requestedStatus = "submitted") {
    const offering = requireUuid(offeringId, "Offering ID");
    const assignment = requireUuid(assignmentId, "Assignment ID");
    const status = requireEnum(requestedStatus || "submitted", "Submission status", ["draft", "submitted"]);
    if ((files?.length || 0) > 5) bad("A submission can include at most five files.");
    const created = [];
    try {
        const result = await transaction(async (connection) => {
            await eligibleStudentOffering(connection, studentProfileId, offering, true);
            const [rows] = await connection.execute(
                `SELECT id,title,status,start_at AS startAt,due_at AS dueAt,CURRENT_TIMESTAMP(3) AS now,
                        (CURRENT_TIMESTAMP(3) BETWEEN start_at AND due_at) AS inWindow FROM assignments
                 WHERE id=? AND offering_id=? FOR UPDATE`, [assignment, offering]
            );
            const assignmentRow = rows[0];
            if (!assignmentRow || assignmentRow.status !== "published") throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment is unavailable.");
            if (!Number(assignmentRow.inWindow)) {
                bad("This assignment is outside its submission window.", "SUBMISSION_WINDOW_CLOSED", 409);
            }
            const [existingRows] = await connection.execute(
                "SELECT id,status FROM assignment_submissions WHERE assignment_id=? AND student_profile_id=? FOR UPDATE", [assignment, studentProfileId]
            );
            const existing = existingRows[0];
            if (existing && existing.status !== "draft") bad("A submission has already been recorded for this assignment.", "DUPLICATE_SUBMISSION", 409);
            const [[existingFiles]] = await connection.execute("SELECT COUNT(*) AS total FROM submission_files WHERE submission_id=?", [existing?.id || "00000000-0000-4000-8000-000000000000"]);
            if (!files?.length && (!existing || Number(existingFiles.total) === 0)) bad("Attach at least one submission file.");
            let submissionId = existing?.id;
            if (!submissionId) {
                submissionId = crypto.randomUUID();
                await connection.execute("INSERT INTO assignment_submissions (id,assignment_id,student_profile_id,status,submitted_at) VALUES (?,?,?,?,IF(?='submitted',CURRENT_TIMESTAMP(3),NULL))", [submissionId, assignment, studentProfileId, status, status]);
            } else {
                await connection.execute("UPDATE assignment_submissions SET status=?,submitted_at=IF(?='submitted',CURRENT_TIMESTAMP(3),NULL) WHERE id=?", [status, status, submissionId]);
            }
            for (const file of files) {
                const asset = await createAsset(connection, file, null);
                created.push(asset);
                await connection.execute("INSERT INTO submission_files (id,submission_id,file_asset_id) VALUES (?,?,?)", [crypto.randomUUID(), submissionId, asset.id]);
            }
            return { id: submissionId, assignmentId: assignment, status, submittedAt: status === "submitted" ? assignmentRow.now : null, files: created.map(({ id, size }, index) => ({ fileAssetId: id, filename: files[index]?.originalname, size })) };
        });
        return result;
    } catch (error) { await removeNewAssets(created); throw error; }
}

async function ownSubmission(studentProfileId, offeringId, assignmentId) {
    const detail = await getStudentOffering(studentProfileId, offeringId);
    const assignment = detail.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    return assignment;
}

async function createAttendanceSessionList(teacherProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    await teacherOffering(db, teacherProfileId, id);
    const [rows] = await db.execute("SELECT id,title,starts_at AS startsAt,ends_at AS endsAt,status FROM attendance_sessions WHERE offering_id=? ORDER BY starts_at DESC", [id]);
    return rows;
}

async function getStudentAttendance(studentProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    await eligibleStudentOffering(db, studentProfileId, id);
    const [records] = await db.execute(
        `SELECT ats.id AS sessionId,ats.title,ats.starts_at AS startsAt,ats.status,ar.attendance_status AS attendanceStatus,ar.note
         FROM attendance_sessions ats LEFT JOIN attendance_records ar ON ar.attendance_session_id=ats.id AND ar.student_profile_id=?
         WHERE ats.offering_id=? AND ats.status='held' ORDER BY ats.starts_at DESC`, [studentProfileId, id]
    );
    const [summary] = await db.execute(
        `SELECT COUNT(*) AS sessions,SUM(ar.attendance_status='present') AS present,
                SUM(ar.attendance_status IN ('absent','late')) AS missed
         FROM attendance_sessions ats LEFT JOIN attendance_records ar ON ar.attendance_session_id=ats.id AND ar.student_profile_id=?
         WHERE ats.offering_id=? AND ats.status='held'`, [studentProfileId, id]
    );
    return { records, summary: summary[0] };
}

async function getFileForUser(user, assetId) {
    const id = requireUuid(assetId, "File ID");
    const connection = await db.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [rows] = await connection.execute(
            "SELECT id,storage_provider AS provider,storage_key AS storageKey,original_filename AS filename,content_type AS contentType,size_bytes AS sizeBytes,status FROM file_assets WHERE id=? AND status='available' FOR SHARE",
            [id]
        );
        const file = rows[0];
        if (!file) throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
        let [allowed] = await connection.execute(
            `SELECT 1 AS allowed FROM materials m JOIN offerings o ON o.id=m.offering_id
             WHERE m.file_asset_id=? AND ${user.role === "teacher" ? "o.teacher_profile_id=?" : "o.id IN (SELECT o2.id FROM offerings o2 JOIN semesters os ON os.id=o2.semester_id JOIN curriculum_subjects oc ON oc.id=o2.curriculum_subject_id JOIN student_profiles sp ON sp.current_semester_id=o2.semester_id JOIN users su ON su.id=sp.user_id WHERE sp.id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized' AND su.account_status='active' AND os.status='active' AND oc.status='active' AND o2.status='active')"}
             LIMIT 1`, [id, user.role === "teacher" ? user.teacherProfileId : user.studentProfileId]
        );
        if (!allowed[0] && user.role === "teacher") {
            [allowed] = await connection.execute(
                `SELECT 1 AS allowed FROM submission_files sf JOIN assignment_submissions s ON s.id=sf.submission_id
                 JOIN assignments a ON a.id=s.assignment_id JOIN offerings o ON o.id=a.offering_id
                 WHERE sf.file_asset_id=? AND o.teacher_profile_id=? LIMIT 1`, [id, user.teacherProfileId]
            );
        } else if (!allowed[0] && user.role === "student") {
            [allowed] = await connection.execute(
                `SELECT 1 AS allowed FROM submission_files sf JOIN assignment_submissions s ON s.id=sf.submission_id
                 WHERE sf.file_asset_id=? AND s.student_profile_id=? LIMIT 1`, [id, user.studentProfileId]
            );
        }
        if (!allowed[0]) throw new ApiError(403, "FILE_ACCESS_DENIED", "You do not have access to this file.");
        if (file.provider !== storage.provider) throw new ApiError(503, "FILE_STORAGE_UNAVAILABLE", "File storage is unavailable.");
        const opened = await storage.open(file.storageKey);
        let released = false;
        const release = async () => {
            if (released) return;
            released = true;
            try { await connection.commit(); }
            finally { connection.release(); }
        };
        opened.stream.once("close", () => { void release(); });
        return { ...file, ...opened, release };
    } catch (error) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch {}
        }
        connection.release();
        throw error;
    }
}

async function listCurrentSemesterEligibleStudents(teacherProfileId, offeringId) {
    const id = requireUuid(offeringId, "Offering ID");
    const offering = await teacherOffering(db, teacherProfileId, id);
    const [rows] = await db.execute(
        `SELECT sp.id,display_name AS displayName FROM student_profiles sp JOIN users u ON u.id=sp.user_id
         WHERE sp.current_semester_id=? AND sp.admission_status='admitted' AND sp.authorization_status='authorized' AND u.account_status='active'
         ORDER BY u.display_name`, [offering.semesterId]
    );
    return rows;
}

module.exports = {
    MAX_FILE_SIZE, types, getTeacherCurriculum, listTeacherOfferings, createOffering, getTeacherOffering,
    updateOffering, deleteOffering, createMaterial, updateMaterial, deleteMaterial, createAssignment,
    updateAssignment, deleteAssignment, listSubmissions, gradeSubmission, createQuiz, updateQuiz,
    deleteQuiz: (teacherProfileId, quizId) => deleteOwnedChild("quizzes", teacherProfileId, quizId, "QUIZ_NOT_FOUND", "Quiz"),
    createAttendanceSession, createAttendanceSessionList, attendanceRoster, markAttendance,
    getStudentOfferings, getStudentOffering, submitAssignment, ownSubmission,
    getStudentAttendance, getFileForUser, listCurrentSemesterEligibleStudents, offeringFileIds
};
