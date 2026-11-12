const db = require("../config/db");
const transaction = require("../utils/transaction");
const localStorage = require("../storage/local");

async function queueUnreferencedFiles(connection, assetIds) {
    const queued = [];
    for (const assetId of new Set(assetIds.filter(Boolean))) {
        const [assets] = await connection.execute(
            "SELECT id,storage_provider AS provider,storage_key AS storageKey,status FROM file_assets WHERE id=? FOR UPDATE",
            [assetId]
        );
        const asset = assets[0];
        if (!asset || asset.status !== "available") continue;
        const [refs] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM materials WHERE file_asset_id=?) +
                    (SELECT COUNT(*) FROM submission_files WHERE file_asset_id=?) AS total`,
            [assetId, assetId]
        );
        if (Number(refs[0].total) !== 0) continue;
        await connection.execute("UPDATE file_assets SET status='pending_delete' WHERE id=?", [assetId]);
        await connection.execute(
            `INSERT INTO file_cleanup_jobs (file_asset_id,storage_provider,storage_key,status,attempt_count,next_attempt_at)
             VALUES (?,?,?,'queued',0,CURRENT_TIMESTAMP(3))
             ON DUPLICATE KEY UPDATE status='queued',storage_provider=VALUES(storage_provider),
               storage_key=VALUES(storage_key),attempt_count=0,next_attempt_at=CURRENT_TIMESTAMP(3),last_error=NULL,completed_at=NULL`,
            [assetId, asset.provider, asset.storageKey]
        );
        queued.push(assetId);
    }
    return queued;
}

async function claimJob(jobId = null) {
    return transaction(async (connection) => {
        const [rows] = await connection.execute(
            `SELECT id,file_asset_id AS assetId,storage_provider AS provider,storage_key AS storageKey,attempt_count AS attemptCount
             FROM file_cleanup_jobs WHERE status IN ('queued','failed') AND next_attempt_at<=CURRENT_TIMESTAMP(3)
               AND (? IS NULL OR id=?) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
            [jobId, jobId]
        );
        const job = rows[0];
        if (!job) return null;
        if (job.provider !== localStorage.provider || !job.storageKey) {
            await connection.execute(
                "UPDATE file_cleanup_jobs SET status='failed',attempt_count=attempt_count+1,last_error='Unsupported storage provider or missing key',next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=?",
                [job.id]
            );
            return { ...job, unavailable: true };
        }
        const [assets] = await connection.execute(
            "SELECT status FROM file_assets WHERE id=? FOR UPDATE", [job.assetId]
        );
        if (assets[0]?.status !== "pending_delete") {
            await connection.execute(
                "UPDATE file_cleanup_jobs SET status='failed',attempt_count=attempt_count+1,last_error='File is no longer pending deletion',next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=?",
                [job.id]
            );
            return { ...job, unavailable: true };
        }
        const [refs] = await connection.execute(
            `SELECT (SELECT COUNT(*) FROM materials WHERE file_asset_id=?) +
                    (SELECT COUNT(*) FROM submission_files WHERE file_asset_id=?) AS total`,
            [job.assetId, job.assetId]
        );
        if (Number(refs[0].total) !== 0) {
            await connection.execute("UPDATE file_assets SET status='available' WHERE id=?", [job.assetId]);
            await connection.execute(
                "UPDATE file_cleanup_jobs SET status='failed',last_error='File still has retained references',next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=?",
                [job.id]
            );
            return { ...job, unavailable: true };
        }
        await connection.execute(
            "UPDATE file_cleanup_jobs SET status='processing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?",
            [job.id]
        );
        return job;
    });
}

async function processJob(job) {
    if (job.unavailable) return { complete: false, jobId: job.id };
    try {
        if (job.provider !== localStorage.provider) throw new Error("Unsupported storage provider.");
        await localStorage.remove(job.storageKey);
        await transaction(async (connection) => {
            await connection.execute("DELETE FROM file_assets WHERE id=? AND status='pending_delete'", [job.assetId]);
            await connection.execute(
                `UPDATE file_cleanup_jobs SET status='completed',storage_key=NULL,completed_at=CURRENT_TIMESTAMP(3),last_error=NULL
                 WHERE id=? AND status='processing'`,
                [job.id]
            );
        });
        return { complete: true, jobId: job.id };
    } catch (error) {
        await db.execute(
            `UPDATE file_cleanup_jobs SET status='failed',last_error=?,
             next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL LEAST(3600,POW(2,LEAST(attempt_count,12))) SECOND)
             WHERE id=? AND status='processing'`,
            [String(error.message || "File cleanup failed").slice(0, 1000), job.id]
        );
        return { complete: false, jobId: job.id };
    }
}

async function drainCleanupJobs(assetIds = null) {
    const output = [];
    if (assetIds) {
        for (const id of assetIds) {
            const [rows] = await db.execute("SELECT id FROM file_cleanup_jobs WHERE file_asset_id=? AND status<>'completed'", [id]);
            if (!rows[0]) continue;
            const job = await claimJob(rows[0].id);
            if (job) output.push(await processJob(job));
        }
        return output;
    }
    for (let i = 0; i < 20; i += 1) {
        const job = await claimJob();
        if (!job) break;
        output.push(await processJob(job));
    }
    return output;
}

module.exports = { queueUnreferencedFiles, drainCleanupJobs };
