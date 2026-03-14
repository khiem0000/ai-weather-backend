const db = require('../config/db');

const logApiUsage = async ({ userId = null, apiName, statusCode, responseTimeMs, location = 'Unknown', errorMessage = null }) => {
    try {
        await db.query(
            `INSERT INTO api_logs (user_id, api_name, status_code, response_time_ms, location, error_message) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, apiName, statusCode, responseTimeMs, location, errorMessage]
        );
    } catch (error) {
        console.error('❌ Lỗi ghi log API:', error.message);
    }
};

module.exports = { logApiUsage };
