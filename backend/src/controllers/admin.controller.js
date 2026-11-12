const service = require("../services/admin.service");
const deletionService = require("../services/account-deletion.service");

function sendData(res, data, status = 200) {
    res.status(status).json({ success: true, data });
}

module.exports = {
    summary: async (req, res) => sendData(res, await service.getDashboardSummary()),
    listStudents: async (req, res) => sendData(res, await service.listStudents()),
    getStudent: async (req, res) => sendData(res, await service.getStudent(req.params.profileId)),
    createStudent: async (req, res) => sendData(res, await service.createStudent(req.body), 201),
    listTeachers: async (req, res) => sendData(res, await service.listTeachers()),
    getTeacher: async (req, res) => sendData(res, await service.getTeacher(req.params.profileId)),
    createTeacher: async (req, res) => sendData(res, await service.createTeacher(req.body), 201),
    updateUser: async (req, res) => sendData(res, await service.updateUser(req.params.userId, req.body)),
    updateUserStatus: async (req, res) => sendData(res, await service.updateAccountStatus(req.params.userId, req.body?.accountStatus)),
    updateAdmission: async (req, res) => sendData(res, await service.updateStudentAdmission(req.params.profileId, req.body?.admissionStatus)),
    updateAuthorization: async (req, res) => sendData(res, await service.updateStudentAuthorization(req.params.profileId, req.body?.authorizationStatus)),
    allocateStudent: async (req, res) => sendData(res, await service.allocateStudent(req.params.profileId, req.body?.semesterId, req.auth.userId, req.body?.reason)),
    listSemesters: async (req, res) => sendData(res, await service.listSemesters()),
    createSemester: async (req, res) => sendData(res, await service.createSemester(req.body), 201),
    updateSemester: async (req, res) => sendData(res, await service.updateSemester(req.params.semesterId, req.body)),
    listSubjects: async (req, res) => sendData(res, await service.listSubjects()),
    createSubject: async (req, res) => sendData(res, await service.createSubject(req.body), 201),
    updateSubject: async (req, res) => sendData(res, await service.updateSubject(req.params.subjectId, req.body)),
    mapSubject: async (req, res) => sendData(res, await service.mapSubject(req.params.semesterId, req.params.subjectId), 201),
    unmapSubject: async (req, res) => sendData(res, await service.unmapSubject(req.params.semesterId, req.params.subjectId)),
    listRequests: async (req, res) => sendData(res, await service.listEnrollmentRequests()),
    reviewRequest: async (req, res) => sendData(res, await service.reviewEnrollmentRequest(req.params.requestId, req.body?.decision, req.auth.userId, req.body?.reviewNote)),
    deleteStudent: async (req, res) => sendData(res, await deletionService.deleteStudent(req.params.profileId)),
    deleteTeacher: async (req, res) => sendData(res, await deletionService.deleteTeacher(req.params.profileId))
};
