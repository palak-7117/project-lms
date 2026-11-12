const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(process.env.FILE_STORAGE_DIR || path.resolve(__dirname, "../../private-storage"));
const extensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".doc", ".docx", ".ppt", ".pptx"]);

function getPath(key) {
    if (typeof key !== "string" || !/^[a-f0-9-]{36}\.(pdf|png|jpg|jpeg|gif|webp|doc|docx|ppt|pptx)$/i.test(key)) {
        throw new Error("Invalid private file key.");
    }
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid private file path.");
    return target;
}

function validateContent(buffer, extension) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
    const ext = extension.toLowerCase();
    if (ext === ".pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
    if (ext === ".png") return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (ext === ".jpg" || ext === ".jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (ext === ".gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString());
    if (ext === ".webp") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
    if ([".doc", ".ppt"].includes(ext)) return buffer.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
    if ([".docx", ".pptx"].includes(ext)) return buffer.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
    return false;
}

async function put(key, buffer) {
    const extension = path.extname(key);
    if (!extensions.has(extension.toLowerCase()) || !validateContent(buffer, extension)) {
        const error = new Error("The file contents do not match a supported file type.");
        error.status = 400;
        error.code = "UNSUPPORTED_FILE";
        throw error;
    }
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.writeFile(getPath(key), buffer, { flag: "wx", mode: 0o600 });
}

async function open(key) {
    const target = getPath(key);
    return { path: target, stream: require("node:fs").createReadStream(target) };
}

async function remove(key) {
    try { await fs.unlink(getPath(key)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
}

module.exports = { provider: "local", put, open, remove, getPath, root };
