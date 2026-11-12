const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const download = require("../controllers/file.controller");

router.get("/:fileId", requireAuth, requireRole("teacher", "student"), download);
module.exports = router;
