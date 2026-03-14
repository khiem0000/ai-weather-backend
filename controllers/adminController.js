// File: controllers/adminController.js
const db = require('../config/db'); 
const webpush = require('web-push');
require('dotenv').config(); // Nạp biến môi trường từ file .env

// ============================================
// 🔑 CẤU HÌNH WEB-PUSH (BẮT BUỘC PHẢI CÓ)
// ============================================
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@aiweather.id.vn',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// 1. LẤY DANH SÁCH NGƯỜI DÙNG
exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, full_name, email, avatar, role, is_locked, created_at FROM users ORDER BY created_at DESC');
        res.status(200).json({ success: true, users });
    } catch (error) { res.status(500).json({ success: false, message: "Lỗi Server!" }); }
};

// 2. KHÓA / MỞ KHÓA TÀI KHOẢN
exports.toggleUserLock = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        const { is_locked } = req.body;
        if (adminId.toString() === targetUserId.toString()) return res.status(400).json({ success: false, message: "Không thể tự khóa mình!" });
        await db.query('UPDATE users SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, targetUserId]);
        res.status(200).json({ success: true, message: is_locked ? "Đã khóa" : "Đã mở khóa" });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 3. LẤY CẤU HÌNH HỆ THỐNG
exports.getSystemSettings = async (req, res) => {
    try {
        const [settings] = await db.query('SELECT maintenance_mode, gemini_api_key, weather_api_key FROM system_settings WHERE id = 1');
        res.status(200).json({ success: true, settings: settings[0] });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 4. CẬP NHẬT CẤU HÌNH HỆ THỐNG
exports.updateSystemSettings = async (req, res) => {
    try {
        const { maintenance_mode, gemini_api_key, weather_api_key } = req.body;
        await db.query(`UPDATE system_settings SET maintenance_mode = ?, gemini_api_key = ?, weather_api_key = ? WHERE id = 1`, [maintenance_mode ? 1 : 0, gemini_api_key, weather_api_key]);
        res.status(200).json({ success: true, message: "Cập nhật thành công!" });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 5. CẬP NHẬT QUYỀN (ROLE)
exports.changeUserRole = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        const { role } = req.body;
        if (adminId.toString() === targetUserId.toString() && role === 'user') return res.status(400).json({ success: false, message: "Không thể tự hạ quyền mình!" });
        await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
        res.status(200).json({ success: true, message: "Đã cập nhật quyền!" });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 6. XÓA NGƯỜI DÙNG
exports.deleteUser = async (req, res) => {
    try {
        const adminId = req.user.id;
        const targetUserId = req.params.id;
        if (adminId.toString() === targetUserId.toString()) return res.status(400).json({ success: false, message: "Không thể tự xóa mình!" });
        await db.query('DELETE FROM users WHERE id = ?', [targetUserId]);
        res.status(200).json({ success: true, message: "Đã xóa người dùng!" });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 7. GỬI THÔNG BÁO HỆ THỐNG + PUSH NOTIFICATION (BẢN FIX TRIỆT ĐỂ)
exports.sendSystemAnnouncement = async (req, res) => {
    try {
        const { message, sendPush } = req.body;
        if (message === undefined) return res.status(400).json({ success: false, message: "Nội dung trống!" });

        // A. Cập nhật SQL cho Popup trong web
        await db.query("DELETE FROM notifications WHERE user_id IS NULL AND type = 'system'");
        if (message.trim() !== "") {
            await db.query("INSERT INTO notifications (title, message, type, created_at) VALUES (?, ?, 'system', NOW())", ["🚨 Thông báo Hệ thống", message]);
        }
        await db.query("UPDATE system_settings SET announcement = ? WHERE id = 1", [message]);

        let pushResult = { success: 0, failed: 0 };

        // B. Bắn Push Notification lên màn hình khóa
        if (sendPush && message.trim() !== "") {
            const [subscriptions] = await db.query("SELECT endpoint, p256dh, auth FROM push_subscriptions");
            const payload = JSON.stringify({
                title: "🚨 Thông báo Khẩn cấp",
                body: message,
                type: "severe",
                url: "/"
            });

            for (const sub of subscriptions) {
                try {
                    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
                    pushResult.success++;
                } catch (e) { pushResult.failed++; }
            }
        }

        res.status(200).json({ 
            success: true, 
            message: message ? '✅ Đã phát sóng thành công!' : '🗑️ Đã gỡ thông báo!',
            pushResult
        });
    } catch (error) {
        console.error("❌ Lỗi Backend:", error);
        res.status(500).json({ success: false, message: "Lỗi Server nội bộ!" });
    }
};

