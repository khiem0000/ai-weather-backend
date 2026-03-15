const db = require('../config/db');

const logApiUsage = async ({ userId = null, apiName, statusCode, responseTimeMs, errorMessage = null }) => {
    try {
        // Đã xóa cột location khỏi câu lệnh INSERT
        await db.query(
            `INSERT INTO api_logs (user_id, api_name, status_code, response_time_ms, error_message) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, apiName, statusCode, responseTimeMs, errorMessage]
        );
    } catch (error) {
        console.error('❌ Lỗi ghi log API:', error.message);
        throw error; // Ném lỗi ra ngoài để Admin Controller biết mà báo 500
    }
};

module.exports = { logApiUsage };
