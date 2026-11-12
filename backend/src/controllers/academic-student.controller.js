const service = require("../services/academic.service");

function send(res, data, status = 200) { res.status(status).json({ success: true, data }); }

module.exports = {
    offerings: async (req, res) => send(res, await service.getStudentOfferings(req.auth.studentProfileId)),
    offering: async (req, res) => send(res, await service.getStudentOffering(req.auth.studentProfileId, req.params.offeringId)),
    submission: async (req, res) => send(res, await service.ownSubmission(req.auth.studentProfileId, req.params.offeringId, req.params.assignmentId)),
    submitAssignment: async (req, res) => send(res, await service.submitAssignment(req.auth.studentProfileId, req.params.offeringId, req.params.assignmentId, req.files), 201),
    attendance: async (req, res) => send(res, await service.getStudentAttendance(req.auth.studentProfileId, req.params.offeringId))
};
