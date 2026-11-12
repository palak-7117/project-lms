const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireCsrf = require("../middleware/requireCsrf");
const controller = require("../controllers/student.controller");

router.use(requireAuth, requireRole("student"));
router.get("/enrollment-options", asyncHandler(controller.enrollmentOptions));
router.get("/enrollment-requests", asyncHandler(controller.listEnrollmentRequests));
router.post("/enrollment-requests", requireCsrf, asyncHandler(controller.createEnrollmentRequest));
router.post("/enrollment-requests/:requestId/withdraw", requireCsrf, asyncHandler(controller.withdrawEnrollmentRequest));

module.exports = router;
