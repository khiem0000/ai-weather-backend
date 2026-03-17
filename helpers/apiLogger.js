const db = require('../config/db');

const logApiUsage = async ({ userId = null, apiName, statusCode, responseTimeMs, errorMessage = null }) => {
    try {
        // FIX MÚI GIỜ: Thêm cột created_at và ép cộng 7 tiếng (Giờ Việt Nam)
        await db.query(
            `INSERT INTO api_logs (user_id, api_name, status_code, response_time_ms, error_message, created_at) 
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 HOUR))`,
            [userId, apiName, statusCode, responseTimeMs, errorMessage]
        );
    } catch (error) {
        console.error('❌ Lỗi ghi log API:', error.message);
        throw error; // Ném lỗi ra ngoài để Admin Controller báo lỗi 500
    }
};

module.exports = { logApiUsage };
