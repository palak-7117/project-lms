require("./config/env");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getAllowedOrigins } = require("./config/env");
const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const studentRoutes = require("./routes/student.routes");
const academicStudentRoutes = require("./routes/academic-student.routes");
const teacherRoutes = require("./routes/teacher.routes");
const fileRoutes = require("./routes/file.routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const allowedOrigins = getAllowedOrigins();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
    origin(origin, callback) {
        // Non-browser clients and same-origin requests do not send Origin.
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.has(origin));
    },
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/student", academicStudentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/files", fileRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
