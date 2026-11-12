const service = require("../services/academic.service");

function send(res, data, status = 200) { res.status(status).json({ success: true, data }); }

module.exports = {
    curriculum: async (req, res) => send(res, await service.getTeacherCurriculum()),
    offerings: async (req, res) => send(res, await service.listTeacherOfferings(req.auth.teacherProfileId)),
    createOffering: async (req, res) => send(res, await service.createOffering(req.auth.teacherProfileId, req.body), 201),
    offering: async (req, res) => send(res, await service.getTeacherOffering(req.auth.teacherProfileId, req.params.offeringId)),
    updateOffering: async (req, res) => send(res, await service.updateOffering(req.auth.teacherProfileId, req.params.offeringId, req.body)),
    deleteOffering: async (req, res) => send(res, await service.deleteOffering(req.auth.teacherProfileId, req.params.offeringId)),
    createMaterial: async (req, res) => send(res, await service.createMaterial(req.auth.teacherProfileId, req.auth.userId, req.params.offeringId, req.body, req.files), 201),
    updateMaterial: async (req, res) => send(res, await service.updateMaterial(req.auth.teacherProfileId, req.params.materialId, req.body)),
    deleteMaterial: async (req, res) => send(res, await service.deleteMaterial(req.auth.teacherProfileId, req.params.materialId)),
    createAssignment: async (req, res) => send(res, await service.createAssignment(req.auth.teacherProfileId, req.params.offeringId, req.body), 201),
    updateAssignment: async (req, res) => send(res, await service.updateAssignment(req.auth.teacherProfileId, req.params.assignmentId, req.body)),
    deleteAssignment: async (req, res) => send(res, await service.deleteAssignment(req.auth.teacherProfileId, req.params.assignmentId)),
    submissions: async (req, res) => send(res, await service.listSubmissions(req.auth.teacherProfileId, req.params.assignmentId)),
    gradeSubmission: async (req, res) => send(res, await service.gradeSubmission(req.auth.teacherProfileId, req.params.submissionId, req.body, req.auth.userId)),
    createQuiz: async (req, res) => send(res, await service.createQuiz(req.auth.teacherProfileId, req.params.offeringId, req.body), 201),
    updateQuiz: async (req, res) => send(res, await service.updateQuiz(req.auth.teacherProfileId, req.params.quizId, req.body)),
    deleteQuiz: async (req, res) => send(res, await service.deleteQuiz(req.auth.teacherProfileId, req.params.quizId)),
    attendanceSessions: async (req, res) => send(res, await service.createAttendanceSessionList(req.auth.teacherProfileId, req.params.offeringId)),
    createAttendanceSession: async (req, res) => send(res, await service.createAttendanceSession(req.auth.teacherProfileId, req.params.offeringId, req.body), 201),
    eligibleStudents: async (req, res) => send(res, await service.listCurrentSemesterEligibleStudents(req.auth.teacherProfileId, req.params.offeringId)),
    attendanceRoster: async (req, res) => send(res, await service.attendanceRoster(req.auth.teacherProfileId, req.params.sessionId)),
    markAttendance: async (req, res) => send(res, await service.markAttendance(req.auth.teacherProfileId, req.params.sessionId, req.params.studentProfileId, req.body, req.auth.userId))
};
