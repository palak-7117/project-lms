const multer = require("multer");
const path = require("node:path");
const { types, MAX_FILE_SIZE } = require("../services/academic.service");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 5, fields: 12, parts: 20 },
    fileFilter(_req, file, callback) {
        const extension = path.extname(file.originalname || "").toLowerCase();
        if (!types[extension]) {
            const error = new Error("This file type is not supported.");
            error.status = 400;
            error.code = "UNSUPPORTED_FILE";
            return callback(error);
        }
        callback(null, true);
    }
});

function mapUploadErrors(middleware) {
    return (req, res, next) => middleware(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            error.status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
            error.code = error.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "INVALID_UPLOAD";
        }
        next(error);
    });
}

module.exports = {
    single: mapUploadErrors(upload.array("files", 1)),
    multiple: mapUploadErrors(upload.array("files", 5))
};
