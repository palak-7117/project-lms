const express = require("express");

const router = express.Router();

const db = require("../config/db");

router.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        status: "ok",
        service: "learnspace-backend"
    });
});

router.get("/db", async (req, res, next) => {
    try {
        await db.query("SELECT 1");
        res.status(200).json({
            success: true,
            status: "ok",
            service: "learnspace-database"
        });
    } catch (error) {
        const safeError = new Error("Database health check failed");
        safeError.status = 503;
        safeError.code = "DB_UNAVAILABLE";
        next(safeError);
    }
});

module.exports = router;
