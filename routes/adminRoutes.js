// File: routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// ========================================================
// 1. API PUBLIC (Không cần quyền Admin)
// ========================================================
router.post('/log-api', adminController.logFrontendApi);
router.post('/support', adminController.submitSupportTicket); 
router.get('/support/user', adminController.getUserTickets); 

// ========================================================
// 2. BỨC TƯỜNG BẢO VỆ ADMIN
// ========================================================
router.use(authMiddleware, adminMiddleware);

// Quản lý Users
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/lock', adminController.toggleUserLock);
router.put('/users/:id/role', adminController.changeUserRole);
router.delete('/users/:id', adminController.deleteUser);

// Quản lý Hệ thống & Cài đặt
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Thống kê Analytics (Real-time)
router.get('/analytics', adminController.getAnalyticsData);

// Quản lý Hộp thư Hỗ trợ (Support Inbox)
router.get('/support', adminController.getSupportTickets);
router.get('/support/:id', adminController.getTicketDetails);
router.put('/support/:id/resolve', adminController.resolveTicket);
router.put('/support/:id/reply', adminController.replySupportTicket);
router.put('/support/:id/status', adminController.changeTicketStatus);

module.exports = router;