const db = require("../config/db");
const transaction = require("../utils/transaction");
const ApiError = require("../utils/ApiError");
const { requireUuid } = require("../utils/validation");
const { queueUnreferencedFiles, drainCleanupJobs, pendingAssetCleanupCount } = require("./file-cleanup.service");
const { offeringFileIds } = require("./academic.service");

async function finish(fileIds) {
    await transaction((connection) => queueUnreferencedFiles(connection, fileIds));
    const outcomes = await drainCleanupJobs(fileIds);
    const pendingCount = await pendingAssetCleanupCount(fileIds);
    if (outcomes.some((item) => !item.complete) || pendingCount > 0) {
        throw new ApiError(503, "FILE_CLEANUP_PENDING", "Database deletion is complete, but private file cleanup is still pending. The cleanup worker will retry.");
    }
}

async function deleteStudent(profileId) {
    const id = requireUuid(profileId, "Student profile ID");
    const fileIds = await transaction(async (connection) => {
        const [profiles] = await connection.execute(
            `SELECT sp.id,sp.user_id AS userId FROM student_profiles sp WHERE sp.id=? FOR UPDATE`, [id]
        );
        const profile = profiles[0];
        if (!profile) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student not found.");
        const [assets] = await connection.execute(
            `SELECT DISTINCT sf.file_asset_id AS id FROM submission_files sf JOIN assignment_submissions sub ON sub.id=sf.submission_id
             WHERE sub.student_profile_id=?`, [id]
        );
        const [uploads] = await connection.execute("SELECT id FROM file_assets WHERE uploaded_by_user_id=?", [profile.userId]);
        await connection.execute(
            "DELETE sf FROM submission_files sf JOIN assignment_submissions sub ON sub.id=sf.submission_id WHERE sub.student_profile_id=?", [id]
        );
        await connection.execute("DELETE FROM attendance_records WHERE student_profile_id=?", [id]);
        await connection.execute("DELETE FROM assignment_submissions WHERE student_profile_id=?", [id]);
        await connection.execute("DELETE FROM users WHERE id=? AND role='student'", [profile.userId]);
        return [...assets.map((item) => item.id), ...uploads.map((item) => item.id)];
    });
    await finish(fileIds);
    return { deleted: true };
}

async function deleteTeacher(profileId) {
    const id = requireUuid(profileId, "Teacher profile ID");
    const fileIds = await transaction(async (connection) => {
        const [profiles] = await connection.execute(
            `SELECT tp.id,tp.user_id AS userId FROM teacher_profiles tp WHERE tp.id=? FOR UPDATE`, [id]
        );
        const profile = profiles[0];
        if (!profile) throw new ApiError(404, "TEACHER_NOT_FOUND", "Teacher not found.");
        const [offerings] = await connection.execute("SELECT id FROM offerings WHERE teacher_profile_id=? FOR UPDATE", [id]);
        const ids = [];
        for (const offering of offerings) ids.push(...await offeringFileIds(connection, offering.id));
        const [uploads] = await connection.execute("SELECT id FROM file_assets WHERE uploaded_by_user_id=?", [profile.userId]);
        for (const offering of offerings) {
            const offeringId = offering.id;
            await connection.execute(
                `DELETE sf FROM submission_files sf JOIN assignment_submissions sub ON sub.id=sf.submission_id
                 JOIN assignments a ON a.id=sub.assignment_id WHERE a.offering_id=?`, [offeringId]
            );
            await connection.execute("DELETE FROM materials WHERE offering_id=?", [offeringId]);
        }
        await connection.execute("DELETE FROM offerings WHERE teacher_profile_id=?", [id]);
        await connection.execute("DELETE FROM users WHERE id=? AND role='teacher'", [profile.userId]);
        return [...ids, ...uploads.map((item) => item.id)];
    });
    await finish(fileIds);
    return { deleted: true };
}

module.exports = { deleteStudent, deleteTeacher };
