require("../config/env");

const readline = require("node:readline/promises");
const { emitKeypressEvents } = require("node:readline");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../config/db");
const { requireEmail, requirePassword, requireString } = require("../utils/validation");

function askSecret(prompt) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        if (!input.isTTY || typeof input.setRawMode !== "function") {
            reject(new Error("Admin bootstrap requires an interactive terminal."));
            return;
        }
        process.stdout.write(prompt);
        emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        let value = "";
        const onKeypress = (character, key = {}) => {
            if (key.ctrl && key.name === "c") {
                cleanup();
                reject(new Error("Bootstrap cancelled."));
            } else if (key.name === "return" || key.name === "enter") {
                cleanup();
                process.stdout.write("\n");
                resolve(value);
            } else if (key.name === "backspace") {
                value = value.slice(0, -1);
            } else if (character && !key.ctrl && !key.meta) {
                value += character;
            }
        };
        function cleanup() {
            input.removeListener("keypress", onKeypress);
            input.setRawMode(false);
        }
        input.on("keypress", onKeypress);
    });
}

async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let name;
    let email;
    try {
        name = requireString(await rl.question("Admin display name: "), "Name", 160);
        email = requireEmail(await rl.question("Admin email: "));
    } finally {
        rl.close();
    }
    const password = requirePassword(await askSecret("Admin password (12+ characters): "));
    const confirmation = await askSecret("Confirm password: ");
    if (password !== confirmation) throw new Error("Passwords did not match.");

    const connection = await db.getConnection();
    let lockAcquired = false;
    try {
        const [locks] = await connection.execute("SELECT GET_LOCK('learnspace_admin_bootstrap', 10) AS acquired");
        lockAcquired = locks[0]?.acquired === 1;
        if (!lockAcquired) throw new Error("Could not acquire the Admin bootstrap lock.");
        const [admins] = await connection.query("SELECT COUNT(*) AS total FROM users WHERE role='admin'");
        if (Number(admins[0].total) !== 0) throw new Error("Admin bootstrap is already complete; an Admin account exists.");

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1
        });
        await connection.execute(
            "INSERT INTO users (id,email,password_hash,display_name,role,account_status) VALUES (?,?,?,?,'admin','active')",
            [crypto.randomUUID(), email, passwordHash, name]
        );
        console.log("One-time Admin bootstrap completed.");
    } finally {
        if (lockAcquired) {
            try { await connection.execute("SELECT RELEASE_LOCK('learnspace_admin_bootstrap')"); } catch {}
        }
        connection.release();
        await db.end();
    }
}

main().catch(async (error) => {
    console.error(`Admin bootstrap failed: ${error.message}`);
    try { await db.end(); } catch {}
    process.exitCode = 1;
});
