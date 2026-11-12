const service = require("../services/admin.service");
const db = require("../config/db");

module.exports = {
    enrollmentOptions: async (req, res) => {
        const [rows] = await db.query("SELECT id,name,academic_year AS academicYear FROM semesters WHERE status='active' ORDER BY academic_year,name");
        res.json({ success: true, data: rows });
    },
    createEnrollmentRequest: async (req, res) => {
        const data = await service.createEnrollmentRequest(req.auth.studentProfileId, req.body?.semesterId);
        res.status(201).json({ success: true, data });
    },
    withdrawEnrollmentRequest: async (req, res) => {
        const data = await service.withdrawEnrollmentRequest(req.auth.studentProfileId, req.params.requestId);
        res.json({ success: true, data });
    },
    listEnrollmentRequests: async (req, res) => {
        const [rows] = await db.execute(
            `SELECT r.id,r.semester_id AS semesterId,s.name AS semesterName,s.academic_year AS academicYear,
                    r.status,r.requested_at AS requestedAt,r.reviewed_at AS reviewedAt,r.review_note AS reviewNote
             FROM student_enrollment_requests r JOIN semesters s ON s.id=r.semester_id
             WHERE r.student_profile_id=? ORDER BY r.requested_at DESC`,
            [req.auth.studentProfileId]
        );
        res.json({ success: true, data: rows });
    }
};
