const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireCsrf = require("../middleware/requireCsrf");
const controller = require("../controllers/admin.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/summary", asyncHandler(controller.summary));
router.get("/students", asyncHandler(controller.listStudents));
router.post("/students", requireCsrf, asyncHandler(controller.createStudent));
router.get("/students/:profileId", asyncHandler(controller.getStudent));
router.delete("/students/:profileId", requireCsrf, asyncHandler(controller.deleteStudent));
router.patch("/students/:profileId/admission", requireCsrf, asyncHandler(controller.updateAdmission));
router.patch("/students/:profileId/authorization", requireCsrf, asyncHandler(controller.updateAuthorization));
router.post("/students/:profileId/allocation", requireCsrf, asyncHandler(controller.allocateStudent));

router.get("/teachers", asyncHandler(controller.listTeachers));
router.post("/teachers", requireCsrf, asyncHandler(controller.createTeacher));
router.get("/teachers/:profileId", asyncHandler(controller.getTeacher));
router.delete("/teachers/:profileId", requireCsrf, asyncHandler(controller.deleteTeacher));
router.patch("/users/:userId", requireCsrf, asyncHandler(controller.updateUser));
router.patch("/users/:userId/status", requireCsrf, asyncHandler(controller.updateUserStatus));

router.get("/semesters", asyncHandler(controller.listSemesters));
router.post("/semesters", requireCsrf, asyncHandler(controller.createSemester));
router.patch("/semesters/:semesterId", requireCsrf, asyncHandler(controller.updateSemester));
router.get("/curriculum-subjects", asyncHandler(controller.listSubjects));
router.post("/curriculum-subjects", requireCsrf, asyncHandler(controller.createSubject));
router.patch("/curriculum-subjects/:subjectId", requireCsrf, asyncHandler(controller.updateSubject));
router.post("/semesters/:semesterId/subjects/:subjectId", requireCsrf, asyncHandler(controller.mapSubject));
router.delete("/semesters/:semesterId/subjects/:subjectId", requireCsrf, asyncHandler(controller.unmapSubject));

router.get("/enrollment-requests", asyncHandler(controller.listRequests));
router.patch("/enrollment-requests/:requestId/review", requireCsrf, asyncHandler(controller.reviewRequest));

module.exports = router;
