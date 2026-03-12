const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../config/db');

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

// 🛠️ PUBLIC KILL SWITCH API - Real-time Maintenance Mode Check (No Auth Required)
async function getMaintenanceStatus(req, res) {
    try {
        const [settings] = await db.query(
            'SELECT maintenance_mode FROM system_settings WHERE id = 1'
        );
        const maintenance = settings.length > 0 && settings[0].maintenance_mode === 1;
        res.status(200).json({ 
            maintenance: maintenance,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Maintenance status query error:', error);
        res.status(200).json({ maintenance: false }); // Graceful fallback
    }
}

router.get('/status', getMaintenanceStatus);

module.exports = router;
