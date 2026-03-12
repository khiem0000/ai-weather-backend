// File: controllers/adminController.js
const db = require('../config/db');

// 1. LẤY DANH SÁCH NGƯỜI DÙNG
exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, full_name, email, avatar, role, is_locked, created_at FROM users ORDER BY created_at DESC'
        );
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error("Lỗi getAllUsers:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 6. XÓA NGƯỜI DÙNG
exports.deleteUser = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;

        // Chống Admin tự hủy (tự xóa tài khoản của chính mình)
        if (adminId.toString() === targetUserId.toString()) {
            return res.status(400).json({ success: false, message: "Bạn không thể tự xóa tài khoản của mình!" });
        }

        await db.query('DELETE FROM users WHERE id = ?', [targetUserId]);
        res.status(200).json({ success: true, message: "Đã xóa người dùng thành công!" });
    } catch (error) {
        console.error("Lỗi deleteUser:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};



// 2. KHÓA / MỞ KHÓA TÀI KHOẢN
exports.toggleUserLock = async (req, res) => {
    try {
        const adminId = req.user.id; // ID của admin đang thao tác
        const targetUserId = req.params.id; // ID của user bị khóa
        const { is_locked } = req.body; // true (khóa) hoặc false (mở)

        // Không cho phép Admin tự khóa chính mình
        if (adminId.toString() === targetUserId.toString()) {
            return res.status(400).json({ success: false, message: "Bạn không thể tự khóa tài khoản của chính mình!" });
        }

        await db.query('UPDATE users SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, targetUserId]);
        
        const statusMsg = is_locked ? "Đã khóa" : "Đã mở khóa";
        res.status(200).json({ success: true, message: `${statusMsg} tài khoản thành công!` });
    } catch (error) {
        console.error("Lỗi toggleUserLock:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 3. LẤY CẤU HÌNH HỆ THỐNG (API KEYS)
exports.getSystemSettings = async (req, res) => {
    try {
        const [settings] = await db.query('SELECT maintenance_mode, gemini_api_key, weather_api_key FROM system_settings WHERE id = 1');
        if (settings.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy cấu hình!" });
        }
        res.status(200).json({ success: true, settings: settings[0] });
    } catch (error) {
        console.error("Lỗi getSystemSettings:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 4. CẬP NHẬT CẤU HÌNH HỆ THỐNG
exports.updateSystemSettings = async (req, res) => {
    try {
        const { maintenance_mode, gemini_api_key, weather_api_key } = req.body;

        await db.query(
            `UPDATE system_settings 
             SET maintenance_mode = ?, gemini_api_key = ?, weather_api_key = ? 
             WHERE id = 1`,
            [maintenance_mode ? 1 : 0, gemini_api_key, weather_api_key]
        );

        res.status(200).json({ success: true, message: "Cập nhật cấu hình hệ thống thành công!" });
    } catch (error) {
        console.error("Lỗi updateSystemSettings:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 5. CẬP NHẬT QUYỀN NGƯỜI DÙNG (ROLE)
exports.changeUserRole = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        const { role } = req.body; // 'user' hoặc 'admin'

        // Kiểm tra dữ liệu đầu vào hợp lệ
        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ success: false, message: "Quyền không hợp lệ!" });
        }

        // Không cho phép Admin tự hạ quyền của chính mình (chống tự hủy)
        if (adminId.toString() === targetUserId.toString() && role === 'user') {
            return res.status(400).json({ success: false, message: "Bạn không thể tự tước quyền Admin của chính mình!" });
        }

        await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
        
        res.status(200).json({ success: true, message: `Đã cập nhật quyền thành ${role.toUpperCase()}!` });
    } catch (error) {
        console.error("Lỗi changeUserRole:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

