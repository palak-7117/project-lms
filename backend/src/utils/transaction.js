const db = require("../config/db");

async function transaction(work) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        try {
            await connection.rollback();
        } catch {
            // Preserve the original error; rollback failures are not sent to clients.
        }
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = transaction;
