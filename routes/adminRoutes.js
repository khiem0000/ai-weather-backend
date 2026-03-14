// File: routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// ========================================================
// 1. API PUBLIC (Không cần quyền Admin)
// Phải đặt Ở ĐÂY, TRƯỚC KHI gọi router.use(...)
// ========================================================
router.post('/log-api', adminController.logFrontendApi);

// ========================================================
// 2. BỨC TƯỜNG BẢO VỆ (Từ dòng này trở xuống phải là Admin)
// ========================================================
router.use(authMiddleware, adminMiddleware);

// Quản lý Users
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/lock', adminController.toggleUserLock);
router.put('/users/:id/role', adminController.changeUserRole);
router.delete('/users/:id', adminController.deleteUser);

// Quản lý Hệ thống & API Keys
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Analytics
router.get('/analytics', adminController.getAnalyticsData);

module.exports = router;