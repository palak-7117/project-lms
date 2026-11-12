const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function getAllowedOrigins() {
    const raw = process.env.FRONTEND_ORIGIN || "";
    const origins = raw.split(",").map((origin) => origin.trim()).filter(Boolean);

    if (origins.includes("*")) {
        throw new Error("FRONTEND_ORIGIN must contain explicit origins; wildcard CORS is disabled.");
    }

    for (const origin of origins) {
        let parsed;
        try {
            parsed = new URL(origin);
        } catch {
            throw new Error("FRONTEND_ORIGIN contains an invalid origin.");
        }

        if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
            throw new Error("FRONTEND_ORIGIN entries must be exact HTTP or HTTPS origins.");
        }
    }

    return new Set(origins);
}

module.exports = { getAllowedOrigins };
