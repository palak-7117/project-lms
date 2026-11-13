require("../src/config/env");

const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
const argon2 = require("argon2");

const projectRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(projectRoot, "../frontend");
const TEST_ADMIN_EMAIL = "admin-test@learnspace.invalid";
const TEST_ADMIN_PASSWORD = "TestAdminPassword!2026";

function connectionOptions(database = process.env.DB_NAME) {
    return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database,
        charset: "utf8mb4",
        connectTimeout: 10000
    };
}

async function createIsolatedDatabase() {
    if (process.env.DB_NAME !== "learnspace_db") {
        throw new Error("Tests require DB_NAME=learnspace_db as the source schema; test writes use a generated isolated database.");
    }
    const name = `learnspace_test_b04_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const source = await mysql.createConnection(connectionOptions());
    let created = false;
    try {
        const [tables] = await source.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'`,
            [process.env.DB_NAME]
        );
        if (tables.length !== 19) throw new Error(`Expected 19 source tables; found ${tables.length}.`);

        await source.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
        created = true;
        const order = [
            "users", "semesters", "curriculum_subjects", "student_profiles", "teacher_profiles",
            "semester_subjects", "student_semester_history", "student_enrollment_requests",
            "offerings", "file_assets", "materials", "assignments", "assignment_submissions",
            "submission_files", "quizzes", "attendance_sessions", "attendance_records",
            "user_sessions", "file_cleanup_jobs"
        ];
        for (const table of order) {
            const [rows] = await source.query(`SHOW CREATE TABLE \`${process.env.DB_NAME}\`.\`${table}\``);
            let ddl = rows[0]["Create Table"].replace(
                new RegExp("^CREATE TABLE `" + table + "`"),
                "CREATE TABLE `" + name + "`.`" + table + "`"
            );
            ddl = ddl.replace(/REFERENCES `([^`]+)`/g, (_match, parent) => "REFERENCES `" + name + "`.`" + parent + "`");
            await source.query(ddl);
        }
    } catch (error) {
        if (created) {
            try { await source.query(`DROP DATABASE \`${name}\``); } catch {}
        }
        throw error;
    } finally {
        await source.end();
    }

    const pool = mysql.createPool({ ...connectionOptions(name), waitForConnections: true, connectionLimit: 5 });
    return {
        name,
        pool,
        async seedAdmin() {
            const passwordHash = await argon2.hash(TEST_ADMIN_PASSWORD, {
                type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1
            });
            await pool.execute(
                `INSERT INTO users (id,email,password_hash,display_name,role,account_status)
                 VALUES (?,?,?,'Test Admin','admin','active')`,
                [crypto.randomUUID(), TEST_ADMIN_EMAIL, passwordHash]
            );
        },
        async destroy() {
            await pool.end();
            const cleanup = await mysql.createConnection(connectionOptions());
            try {
                if (!/^learnspace_test_b04_[0-9]+_[a-f0-9]+$/.test(name)) throw new Error("Refusing to remove a non-test database.");
                await cleanup.query(`DROP DATABASE \`${name}\``);
            } finally { await cleanup.end(); }
        }
    };
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function startBackend(databaseName, frontendOrigin) {
    const port = await freePort();
    const logs = [];
    const storagePath = path.join(os.tmpdir(), `learnspace-test-files-${crypto.randomBytes(12).toString("hex")}`);
    const child = spawn(process.execPath, ["src/server.js"], {
        cwd: projectRoot,
        env: {
            ...process.env,
            NODE_ENV: "test",
            DB_NAME: databaseName,
            PORT: String(port),
            HOST: "127.0.0.1",
            FRONTEND_ORIGIN: frontendOrigin,
            FILE_STORAGE_DIR: storagePath
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    const baseUrl = `http://127.0.0.1:${port}/api`;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Test backend exited early: ${logs.join("")}`);
        try {
            const response = await fetch(`${baseUrl}/health`);
            if (response.ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const response = await fetch(`${baseUrl}/health`).catch(() => null);
    if (!response?.ok) {
        child.kill();
        throw new Error(`Test backend did not become ready: ${logs.join("")}`);
    }
    return {
        port, baseUrl, child, logs, storagePath,
        async stop() {
            if (child.exitCode !== null) return;
            child.kill("SIGTERM");
            await Promise.race([
                new Promise((resolve) => child.once("exit", resolve)),
                new Promise((resolve) => setTimeout(resolve, 5000))
            ]);
            if (child.exitCode === null) child.kill("SIGKILL");
            await fs.rm(storagePath, { recursive: true, force: true });
        }
    };
}

async function startFrontend() {
    const port = await freePort();
    const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
    const server = http.createServer(async (req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
            if (pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
            const relative = pathname === "/" ? "/index.html" : pathname;
            const target = path.resolve(frontendRoot, `.${relative}`);
            if (!target.startsWith(frontendRoot + path.sep)) { res.writeHead(403).end(); return; }
            const fs = require("node:fs");
            const data = await fs.promises.readFile(target);
            res.writeHead(200, { "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream" });
            res.end(data);
        } catch { res.writeHead(404).end("Not found"); }
    });
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    return {
        port, origin: `http://127.0.0.1:${port}`, server,
        stop: () => new Promise((resolve) => server.close(resolve))
    };
}

function createApiClient(baseUrl, origin = null) {
    const cookies = new Map();
    let csrfToken = null;
    function updateCookies(response) {
        for (const cookie of response.headers.getSetCookie?.() || []) {
            const pair = cookie.split(";", 1)[0];
            const separator = pair.indexOf("=");
            if (separator < 0) continue;
            const name = pair.slice(0, separator);
            const value = pair.slice(separator + 1);
            if (!value) cookies.delete(name); else cookies.set(name, value);
        }
    }
    async function send(method, route, body) {
        const headers = { Accept: "application/json" };
        if (origin) headers.Origin = origin;
        if (cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
            if (!csrfToken) await getCsrf();
            headers["X-CSRF-Token"] = csrfToken;
        }
        const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
        if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
        const response = await fetch(`${baseUrl}${route}`, { method, headers, body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body) });
        updateCookies(response);
        const json = await response.json().catch(() => ({}));
        if (json.data?.csrfToken) csrfToken = json.data.csrfToken;
        return { status: response.status, body: json };
    }
    async function getCsrf() {
        const response = await fetch(`${baseUrl}/auth/csrf`, { headers: origin ? { Origin: origin } : {} });
        updateCookies(response);
        const json = await response.json();
        csrfToken = json.data.csrfToken;
        return csrfToken;
    }
    return {
        get: (route) => send("GET", route),
        post: (route, body = {}) => send("POST", route, body),
        postMultipart: (route, body) => send("POST", route, body),
        patch: (route, body = {}) => send("PATCH", route, body),
        put: (route, body) => send("PUT", route, body),
        delete: (route) => send("DELETE", route),
        getCsrf,
        login: async (role, email, password) => { await getCsrf(); return send("POST", `/auth/${role}/login`, { email, password }); },
        cookieHeader: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        sessionToken: () => [...cookies].find(([name]) => name.endsWith("session"))?.[1] || null
    };
}

module.exports = {
    TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, createIsolatedDatabase,
    startBackend, startFrontend, createApiClient, freePort
};
