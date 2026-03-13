// File: controllers/adminController.js
const db = require('../config/db'); 
const webpush = require('web-push');
require('dotenv').config();

// ============================================
// CẤU HÌNH WEB-PUSH VỚI VAPID KEYS
// ============================================
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@aiweather.id.vn',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

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

// 2. KHÓA / MỞ KHÓA TÀI KHOẢN
exports.toggleUserLock = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        const { is_locked } = req.body;

        if (adminId.toString() === targetUserId.toString()) {
            return res.status(400).json({ success: false, message: "Bạn không thể tự khóa mình!" });
        }

        await db.query('UPDATE users SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, targetUserId]);
        res.status(200).json({ success: true, message: is_locked ? "Đã khóa" : "Đã mở khóa" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 3. LẤY CẤU HÌNH HỆ THỐNG
exports.getSystemSettings = async (req, res) => {
    try {
        const [settings] = await db.query('SELECT maintenance_mode, gemini_api_key, weather_api_key FROM system_settings WHERE id = 1');
        if (settings.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy cấu hình!" });
        res.status(200).json({ success: true, settings: settings[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 4. CẬP NHẬT CẤU HÌNH HỆ THỐNG
exports.updateSystemSettings = async (req, res) => {
    try {
        const { maintenance_mode, gemini_api_key, weather_api_key } = req.body;
        await db.query(
            `UPDATE system_settings SET maintenance_mode = ?, gemini_api_key = ?, weather_api_key = ? WHERE id = 1`,
            [maintenance_mode ? 1 : 0, gemini_api_key, weather_api_key]
        );
        res.status(200).json({ success: true, message: "Cập nhật thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 5. CẬP NHẬT QUYỀN NGƯỜI DÙNG (ROLE)
exports.changeUserRole = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ success: false, message: "Quyền không hợp lệ!" });
        if (adminId.toString() === targetUserId.toString() && role === 'user') {
            return res.status(400).json({ success: false, message: "Không thể tự hạ quyền mình!" });
        }
        await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
        res.status(200).json({ success: true, message: `Đã cập nhật quyền thành ${role.toUpperCase()}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 6. XÓA NGƯỜI DÙNG
exports.deleteUser = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        if (adminId.toString() === targetUserId.toString()) {
            return res.status(400).json({ success: false, message: "Bạn không thể tự xóa tài khoản mình!" });
        }
        await db.query('DELETE FROM users WHERE id = ?', [targetUserId]);
        res.status(200).json({ success: true, message: "Đã xóa người dùng thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// 7. GỬI THÔNG BÁO HỆ THỐNG + PUSH NOTIFICATION (BẢN FIX CHUẨN)
exports.sendSystemAnnouncement = async (req, res) => {
    try {
        const { message, sendPush } = req.body;
        if (message === undefined) return res.status(400).json({ success: false, message: "Thiếu nội dung!" });

        // A. Cập nhật bảng 'notifications' (Cho Popup trang User)
        await db.query("DELETE FROM notifications WHERE user_id IS NULL AND type = 'system'");
        if (message.trim() !== "") {
            await db.query(
                "INSERT INTO notifications (title, message, type, created_at) VALUES (?, ?, 'system', NOW())",
                ["🚨 Thông báo Hệ thống", message]
            );
        }

        // B. Cập nhật bảng 'system_settings' (Lưu trạng thái)
        await db.query("UPDATE system_settings SET announcement = ? WHERE id = 1", [message]);

        let pushResult = { success: 0, failed: 0 };

        // C. Bắn Push Notification (Rung màn hình khóa)
        if (sendPush && message.trim() !== "") {
            try {
                const [subscriptions] = await db.query("SELECT endpoint, p256dh, auth FROM push_subscriptions");
                const payload = JSON.stringify({
                    title: "🚨 Thông báo Khẩn cấp",
                    body: message,
                    type: "severe",
                    url: "/"
                });

                for (const sub of subscriptions) {
                    try {
                        await webpush.sendNotification(
                            { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, 
                            payload
                        );
                        pushResult.success++;
                    } catch (e) {
                        pushResult.failed++;
                    }
                }
            } catch (err) {
                console.error("Lỗi hệ thống Push:", err);
            }
        }

        res.status(200).json({ 
            success: true, 
            message: message ? '✅ Đã phát sóng thành công!' : '🗑️ Đã gỡ thông báo!',
            pushResult
        });
    } catch (error) {
        console.error("❌ Lỗi sendSystemAnnouncement:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};