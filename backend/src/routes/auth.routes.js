const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireCsrf = require("../middleware/requireCsrf");
const controller = require("../controllers/auth.controller");

router.get("/csrf", controller.issueCsrf);
router.post("/:role/login", requireCsrf, asyncHandler(controller.login));
router.get("/me", requireAuth, controller.currentUser);
router.post("/logout", requireCsrf, asyncHandler(controller.logout));

module.exports = router;
