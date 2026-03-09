const jwt = require('jsonwebtoken');

// Middleware xác thực JWT token
const authMiddleware = (req, res, next) => {
    try {
        // Lấy token từ header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Không tìm thấy token xác thực!" });
        }
        
        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'TranHoangKhiem_SecretKey_2026');
        
        // Lưu thông tin user vào request
        req.user = decoded;
        next();
        
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
    }
};

module.exports = authMiddleware;

