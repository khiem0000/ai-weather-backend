const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Phân luồng 2 đường dẫn cho đăng ký và đăng nhập
router.post('/register', authController.register);
router.post('/login', authController.login);

// API Xác thực token (cần middleware để verify token)
router.get('/verify-token', authMiddleware, authController.verifyToken);

// API Quên mật khẩu - OTP
router.post('/check-email', authController.checkEmail);
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/reset-password', authController.resetPassword);

// API Profile (Cần xác thực)
router.get('/profile', authMiddleware, authController.getProfile);
router.put('/profile', authMiddleware, authController.updateProfile);

// API Login History (Cần xác thực)
router.get('/login-history', authMiddleware, authController.getLoginHistory);

// API Settings (Cần xác thực)
router.get('/settings', authMiddleware, authController.getSettings);
router.put('/settings', authMiddleware, authController.updateSettings);

// API Planner Tasks (Cần xác thực)
router.get('/tasks', authMiddleware, authController.getTasks);
router.post('/tasks', authMiddleware, authController.createTask);
router.put('/tasks/:id', authMiddleware, authController.updateTask);
router.delete('/tasks/:id', authMiddleware, authController.deleteTask);

// API Thay đổi Email (Cần xác thực) - Bảo mật với OTP
router.post('/request-email-change', authMiddleware, authController.requestEmailChange);
router.post('/verify-email-change', authMiddleware, authController.verifyEmailChange);

module.exports = router;
