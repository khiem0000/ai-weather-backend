// File: middleware/adminMiddleware.js
const db = require('../config/db');

const adminMiddleware = async (req, res, next) => {
    try {
        // req.user đã được giải mã từ token (nhờ authMiddleware chạy trước đó)
        const userId = req.user.id;

        // Truy vấn DB để lấy role và trạng thái khóa của user
        const [users] = await db.query('SELECT role, is_locked FROM users WHERE id = ?', [userId]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: "Tài khoản không tồn tại!" });
        }

        const user = users[0];

        // 1. Kiểm tra tài khoản có bị khóa không
        if (user.is_locked) {
            return res.status(403).json({ 
                success: false, 
                message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên!" 
            });
        }

        // 2. Kiểm tra quyền Admin
        if (user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: "Truy cập bị từ chối! Chỉ Quản trị viên mới có quyền thực hiện." 
            });
        }

        // Nếu qua được 2 ải trên -> Đích thị là Admin đang hoạt động -> Cho phép đi tiếp API
        next();
        
    } catch (error) {
        console.error('Lỗi Admin Middleware:', error);
        res.status(500).json({ success: false, message: "Lỗi Server khi xác thực quyền!" });
    }
};

module.exports = adminMiddleware;

