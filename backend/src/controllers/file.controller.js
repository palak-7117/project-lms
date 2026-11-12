const service = require("../services/academic.service");

module.exports = async function download(req, res, next) {
    try {
        const file = await service.getFileForUser(req.auth, req.params.fileId);
        const filename = String(file.filename || "download").replace(/[\r\n"\\]/g, "_");
        res.set({
            "Content-Type": file.contentType,
            "Content-Length": String(file.sizeBytes),
            "Content-Disposition": `attachment; filename="${filename.slice(0, 120)}"; filename*=UTF-8''${encodeURIComponent(file.filename || "download")}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
        });
        file.stream.on("error", next);
        file.stream.pipe(res);
    } catch (error) { next(error); }
};
