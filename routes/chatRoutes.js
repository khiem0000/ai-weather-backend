// File: routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

// 1. GET /api/chat/status - Trả về trạng thái bảo trì (Public - Ai cũng gọi được để check nút)
router.get('/status', chatController.getChatStatus);

// 2. POST /api/chat - Gửi tin nhắn chat (Private - Cần đăng nhập)
router.post('/', authMiddleware, chatController.handleChat);

module.exports = router;

