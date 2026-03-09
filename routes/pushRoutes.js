/**
 * pushRoutes.js
 * Định nghĩa các routes cho Web Push Notifications
 * 
 * Routes:
 * - GET  /api/push/vapidPublicKey - Lấy VAPID Public Key
 * - POST /api/push/subscribe     - Đăng ký Push Notification
 * - DELETE /api/push/unsubscribe - Hủy đăng ký
 * - GET  /api/push/status        - Kiểm tra trạng thái đăng ký
 */

const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');
const authMiddleware = require('../middleware/authMiddleware');

// ============================================================
// ROUTES - Tất cả các routes đều cần xác thực (trừ getVapidPublicKey)
// ============================================================

// GET /api/push/vapidPublicKey - Lấy VAPID Public Key (Public - không cần auth)
router.get('/vapidPublicKey', pushController.getVapidPublicKey);

// POST /api/push/subscribe - Đăng ký Push Notification (Cần auth)
router.post('/subscribe', authMiddleware, pushController.subscribe);

// DELETE /api/push/unsubscribe - Hủy đăng ký (Cần auth)
router.delete('/unsubscribe', authMiddleware, pushController.unsubscribe);

// GET /api/push/status - Kiểm tra trạng thái đăng ký (Cần auth)
router.get('/status', authMiddleware, pushController.getSubscriptionStatus);

module.exports = router;

