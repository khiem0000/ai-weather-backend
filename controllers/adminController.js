// File: controllers/adminController.js
const db = require('../config/db'); 
const { logApiUsage } = require('../helpers/apiLogger');
const webpush = require('web-push');
require('dotenv').config();

// ============================================
// 🔑 CẤU HÌNH WEB-PUSH
// ============================================
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@aiweather.id.vn',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

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
        const [settings] = await db.query('SELECT maintenance_mode, gemini_api_key, weather_api_key, weatherapi_key FROM system_settings WHERE id = 1');
        if (settings.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy cấu hình!" });
        res.status(200).json({ success: true, settings: settings[0] });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 4. CẬP NHẬT CẤU HÌNH HỆ THỐNG
exports.updateSystemSettings = async (req, res) => {
    try {
        const { maintenance_mode, gemini_api_key, weather_api_key, weatherapi_key } = req.body;
        await db.query(`UPDATE system_settings SET gemini_api_key = ?, weather_api_key = ?, weatherapi_key = ?, maintenance_mode = ? WHERE id = 1`, [gemini_api_key, weather_api_key, weatherapi_key, maintenance_mode ? 1 : 0]);
        res.status(200).json({ success: true, message: "Cập nhật thành công!" });
    } catch (error) { res.status(500).json({ success: false }); }
};

// 5. CẬP NHẬT QUYỀN
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

// 7. GỬI THÔNG BÁO HỆ THỐNG + PUSH NOTIFICATION (ĐÃ XÓA LOGIC LỖI)
exports.sendSystemAnnouncement = async (req, res) => {
    try {
        const { message, sendPush } = req.body;
        if (message === undefined) return res.status(400).json({ success: false, message: "Nội dung trống!" });

        // A. Cập nhật SQL cho Popup trong web
        await db.query("DELETE FROM notifications WHERE user_id IS NULL AND type = 'system'");
        if (message.trim() !== "") {
            await db.query("INSERT INTO notifications (title, message, type, created_at) VALUES (?, ?, 'system', NOW())", ["🚨 Thông báo Hệ thống", message]);
        }
        
        // ĐÃ XÓA DÒNG UPDATE system_settings GÂY LỖI 500 Ở ĐÂY

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

// 8. LOG FRONTEND API CALLS (cho OpenWeatherMap từ Frontend)
exports.logFrontendApi = async (req, res) => {
    try {
        const { apiName, statusCode, responseTimeMs, location, errorMessage } = req.body;
        if (!apiName) {
            return res.status(400).json({ success: false, message: "Thiếu apiName" });
        }
        await logApiUsage({ 
            userId: null, 
            apiName, 
            statusCode: parseInt(statusCode) || 500, 
            responseTimeMs: parseInt(responseTimeMs) || 0, 
            location: location || 'Unknown', 
            errorMessage 
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Lỗi logFrontendApi:", error);
        res.status(500).json({ success: false });
    }
};

// 9. GET ANALYTICS DATA cho Dashboard
exports.getAnalyticsData = async (req, res) => {
    try {
        // Today only
        const today = new Date().toISOString().split('T')[0];
        
        const [totalRow] = await db.query('SELECT COUNT(*) as total FROM api_logs WHERE DATE(created_at) = ?', [today]);
        const totalRequests = totalRow[0].total;

        const [successRow] = await db.query('SELECT COUNT(*) as success FROM api_logs WHERE status_code = 200 AND DATE(created_at) = ?', [today]);
        const successRate = totalRequests > 0 ? ((successRow[0].success / totalRequests) * 100).toFixed(2) : 0;

        const [avgRow] = await db.query('SELECT AVG(response_time_ms) as avg FROM api_logs WHERE DATE(created_at) = ?', [today]);
        const avgLatency = avgRow[0].avg ? Math.round(avgRow[0].avg) : 0;

        // Hourly traffic by API (today)
        const [traffic] = await db.query(`
            SELECT 
                HOUR(created_at) as hour,
                api_name,
                COUNT(*) as count
            FROM api_logs 
            WHERE DATE(created_at) = ? 
            GROUP BY HOUR(created_at), api_name 
            ORDER BY hour, count DESC
        `, [today]);

        // Top locations
        const [locations] = await db.query(`
            SELECT location, COUNT(*) as count 
            FROM api_logs 
            WHERE DATE(created_at) = ? 
            GROUP BY location 
            ORDER BY count DESC 
            LIMIT 5
        `, [today]);

        // Recent errors
        const [errors] = await db.query(`
            SELECT api_name, status_code, response_time_ms, location, error_message, created_at 
            FROM api_logs 
            WHERE status_code != 200 AND DATE(created_at) = ? 
            ORDER BY created_at DESC 
            LIMIT 5
        `, [today]);

        res.json({ 
            success: true,
            data: {
                totalRequests,
                successRate: parseFloat(successRate),
                avgLatency,
                apiTraffic: traffic,
                topLocations: locations,
                recentErrors: errors
            }
        });
    } catch (error) {
        console.error("Lỗi getAnalyticsData:", error);
        res.status(500).json({ success: false, message: "Lỗi truy vấn analytics" });
    }
};

