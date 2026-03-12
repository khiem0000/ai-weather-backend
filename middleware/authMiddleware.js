const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware xác thực JWT token
const authMiddleware = async (req, res, next) => {
    try {
        // Lấy token từ header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Không tìm thấy token xác thực!" });
        }
        
        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'TranHoangKhiem_SecretKey_2026');
        
        // Thêm đoạn này: Đi hỏi DB xem thằng này vừa bị khóa không?
        const [users] = await db.query('SELECT is_locked FROM users WHERE id = ?', [decoded.id]);
        
        if (users.length === 0 || users[0].is_locked === 1) {
            return res.status(403).json({ success: false, message: "ACCOUNT_LOCKED" });
        }

        // Lưu thông tin user vào request
        req.user = decoded;
        next();
        
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
    }
};

module.exports = authMiddleware;

