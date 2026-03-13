// File: controllers/adminController.js
const db = require('../config/db'); const pushController = require('../controllers/pushController');

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

// 7. GỬI THÔNG BÁO HỆ THỐNG + PUSH NOTIFICATION (UPGRADED)
exports.sendSystemAnnouncement = async (req, res) => {
    try {
        const { message, sendPush } = req.body;
        
        if (message === undefined) {
            return res.status(400).json({ success: false, message: "Thiếu tham số message!" });
        }

        console.log("📢 [SYSTEM ANNOUNCEMENT]:", { message, sendPush });

        // 1. Lưu message vào Database (để hiển thị Popup trong Web)
        // Sử dụng system_settings.announcement thay vì table notifications để đơn giản
        await db.query("UPDATE system_settings SET announcement = ?", [message]);

        let pushResult = { success: 0, failed: 0, expired: 0 };

        // 2. NẾU ADMIN CHỌN SEND PUSH -> KÍCH HOẠT RUNG MÀN HÌNH KHÓA
        if (sendPush && message) {
            try {
                // Lấy tất cả user đã đăng ký nhận thông báo
                const [subscriptions] = await db.query(
                    "SELECT endpoint, p256dh, auth FROM push_subscriptions"
                );
                
                // Gói hàng Push Notification
                const payload = JSON.stringify({
                    title: "🚨 Thông báo Khẩn cấp",
                    body: message,
                    type: "severe",
                    url: "/" // Khi user bấm vào thông báo sẽ mở trang chủ
                });

                // Bắn súng liên thanh tới Google/Apple Push Servers
                for (const sub of subscriptions) {
                    const pushConfig = {
                        endpoint: sub.endpoint,
                        keys: { auth: sub.auth, p256dh: sub.p256dh }
                    };
                    const result = await pushController.sendPushNotification(pushConfig, payload);
                    
                    if (result === true) {
                        pushResult.success++;
                    } else if (result === 'expired') {
                        pushResult.expired++;
                    } else {
                        pushResult.failed++;
                    }
                }
                
                console.log(`📊 Push Results: ${pushResult.success} success, ${pushResult.failed} failed, ${pushResult.expired} expired`);
                
            } catch (error) {
                console.error("❌ Lỗi hệ thống Push:", error);
                pushResult.error = error.message;
            }
        }

        const responseMessage = message ? '✅ Đã phát sóng thành công!' : '🗑️ Đã gỡ thông báo!';
        
        res.status(200).json({ 
            success: true, 
            message: responseMessage,
            pushResult,
            notification: { message: message }
        });
    } catch (error) {
        console.error("❌ Lỗi sendSystemAnnouncement:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};



