/**
 * ============================================================
 * NOTIFICATION ROUTES - System Announcement API
 * ============================================================
 * API để lấy thông báo hệ thống hiển thị popup trên frontend
 * 
 * Query: SELECT * FROM notifications 
 *        WHERE user_id IS NULL AND type = 'system' 
 *        ORDER BY created_at DESC LIMIT 1
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ============================================================
// GET /api/notifications/system
// Lấy thông báo hệ thống mới nhất (không thuộc về user cụ thể)
// ============================================================
router.get('/system', async (req, res) => {
    try {
        // Query lấy thông báo hệ thống mới nhất
        // user_id IS NULL: thông báo toàn hệ thống
        // type = 'system': loại thông báo hệ thống
        const [notifications] = await db.query(
            `SELECT * FROM notifications 
             WHERE user_id IS NULL AND type = 'system' 
             ORDER BY created_at DESC LIMIT 1`
        );

        if (notifications.length > 0) {
            // Có thông báo - trả về thông báo đầu tiên
            const notification = notifications[0];
            res.status(200).json({
                success: true,
                notification: {
                    id: notification.id,
                    title: notification.title,
                    message: notification.message,
                    type: notification.type,
                    created_at: notification.created_at
                }
            });
        } else {
            // Không có thông báo nào
            res.status(200).json({
                success: true,
                notification: null
            });
        }

    } catch (error) {
        console.error('❌ Lỗi khi lấy thông báo hệ thống:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi Server, không thể lấy thông báo',
            notification: null
        });
    }
});

module.exports = router;

