const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireCsrf = require("../middleware/requireCsrf");
const upload = require("../middleware/upload");
const controller = require("../controllers/academic-student.controller");

router.use(requireAuth, requireRole("student"));
router.get("/offerings", asyncHandler(controller.offerings));
router.get("/offerings/:offeringId", asyncHandler(controller.offering));
router.get("/offerings/:offeringId/assignments/:assignmentId/submission", asyncHandler(controller.submission));
router.post("/offerings/:offeringId/assignments/:assignmentId/submission", requireCsrf, upload.multiple, asyncHandler(controller.submitAssignment));
router.get("/offerings/:offeringId/attendance", asyncHandler(controller.attendance));

module.exports = router;
