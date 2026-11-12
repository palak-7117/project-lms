require("./config/env");

const app = require("./app");
const db = require("./config/db");
const { drainCleanupJobs } = require("./services/file-cleanup.service");

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[server] PORT must be a valid TCP port number.");
    process.exit(1);
}

const server = app.listen(port, host, () => {
    console.log(`[server] LearnSpace API listening on ${host}:${port}`);
});
const cleanupTimer = setInterval(() => {
    void drainCleanupJobs().catch(() => console.error("[cleanup] File cleanup retry pass failed."));
}, 30000);
cleanupTimer.unref();
void drainCleanupJobs().catch(() => console.error("[cleanup] Initial file cleanup pass failed."));

server.on("error", (error) => {
    const code = typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code
        : "LISTEN_ERROR";
    console.error(`[server] Unable to start HTTP listener (${code}).`);
    db.end().finally(() => process.exit(1));
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    console.log(`[server] ${signal} received; shutting down.`);

    server.close(async () => {
        try {
            await db.end();
            console.log("[server] HTTP listener and database pool closed.");
        } catch {
            console.error("[server] Database pool shutdown failed.");
            process.exitCode = 1;
        }
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
