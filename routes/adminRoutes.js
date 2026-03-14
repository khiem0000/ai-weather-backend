// File: routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Áp dụng Cận vệ: Khách phải Đăng nhập (auth) VÀ phải là Admin (admin)
router.use(authMiddleware, adminMiddleware);

// Public API Log (no auth required)
router.post('/log-api', adminController.logFrontendApi);

// Protected Admin Routes (auth + admin required)
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

