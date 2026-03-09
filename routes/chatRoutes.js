/**
 * ============================================================
 * CHAT ROUTES - AI Chat Assistant API
 * ============================================================
 * Định nghĩa các route cho tính năng chat với AI
 */

const express = require('express');
const router = express.Router();

// Import controller
const chatController = require('../controllers/chatController');

// Import auth middleware (bảo vệ route - chỉ user đã đăng nhập mới được chat)
const authMiddleware = require('../middleware/authMiddleware');

/**
 * POST /api/chat
 * Gửi tin nhắn chat cho AI
 * 
 * Request Body:
 * {
 *   "userMessage": "string - tin nhắn của user",
 *   "weatherContext": "object - dữ liệu thời tiết 7 ngày"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "reply": "string - câu trả lời từ AI"
 * }
 */
router.post('/', authMiddleware, chatController.handleChat);

module.exports = router;

