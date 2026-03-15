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

// 7. GỬI THÔNG BÁO HỆ THỐNG + PUSH NOTIFICATION
exports.sendSystemAnnouncement = async (req, res) => {
    try {
        const { message, sendPush } = req.body;
        if (message === undefined) return res.status(400).json({ success: false, message: "Nội dung trống!" });

        // A. Cập nhật SQL cho Popup trong web
        await db.query("DELETE FROM notifications WHERE user_id IS NULL AND type = 'system'");
        if (message.trim() !== "") {
            await db.query("INSERT INTO notifications (title, message, type, created_at) VALUES (?, ?, 'system', NOW())", ["🚨 Thông báo Hệ thống", message]);
        }
        
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

// ============================================================
// API: NHẬN LOG TỪ FRONTEND
// ============================================================
exports.logFrontendApi = async (req, res) => {
    try {
        const { userId, apiName, statusCode, responseTimeMs, errorMessage } = req.body;
        
        // Đã xóa dòng const { logApiUsage } = require... bị thừa ở đây

        await logApiUsage({
            userId: userId || null,
            apiName: apiName || 'Unknown API',
            statusCode: statusCode || 200,
            responseTimeMs: responseTimeMs || 0,
            errorMessage: errorMessage || null
        });
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Lỗi logFrontendApi:", error);
        res.status(500).json({ success: false, message: "Lỗi lưu log" });
    }
};

// 9. GET ANALYTICS DATA cho Dashboard
// ============================================================
// API: THỐNG KÊ ANALYTICS (SIÊU AN TOÀN - CHỐNG CRASH & LỌC TỌA ĐỘ)
// ============================================================
exports.getAnalyticsData = async (req, res) => {
    try {
        const range = req.query.range || 'today';
        let dateCondition = 'DATE(created_at) = CURDATE()';
        
        if (range === '7days') dateCondition = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        if (range === '30days') dateCondition = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

        // 1 & 2 & 3. Dùng 1 Query gộp để lấy Total, Success và Avg Latency
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as totalRequests,
                SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as successCount,
                ROUND(AVG(response_time_ms)) as avgLatency
            FROM api_logs 
            WHERE ${dateCondition}
        `);
        
        const total = stats[0].totalRequests || 0;
        const success = stats[0].successCount || 0;
        const latency = stats[0].avgLatency || 0;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

        // 4. ĐẾM ACTIVE SESSIONS THỰC TẾ (Số User độc lập có gọi API)
        const [activeUsers] = await db.query(`
            SELECT COUNT(DISTINCT user_id) as activeSessions 
            FROM api_logs 
            WHERE user_id IS NOT NULL AND ${dateCondition}
        `);
        const activeSessionsCount = activeUsers[0].activeSessions || 0;

        // 5. Lấy dữ liệu Biểu đồ Traffic (Đã ép đủ 24 giờ)
        let trafficQuery = range === 'today' 
            ? `SELECT HOUR(created_at) as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY HOUR(created_at), api_name ORDER BY time_unit ASC`
            : `SELECT DATE_FORMAT(created_at, '%m-%d') as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY DATE(created_at), api_name ORDER BY DATE(created_at) ASC`;
        
        const [trafficData] = await db.query(trafficQuery);
        
        let labels = [];
        if (range === 'today') {
            // Tạo sẵn 24 mốc giờ để biểu đồ luôn hiện đường kẻ ngang dù chỉ có 1 điểm
            for(let i=0; i<24; i++) labels.push(`${String(i).padStart(2, '0')}:00`);
        } else {
            const labelsSet = new Set();
            trafficData.forEach(row => labelsSet.add(row.time_unit));
            labels = Array.from(labelsSet).sort();
        }
        
        const openweather = new Array(labels.length).fill(0);
        const weatherapi = new Array(labels.length).fill(0);
        const gemini = new Array(labels.length).fill(0);
        
        trafficData.forEach(row => {
            let label = range === 'today' ? `${String(row.time_unit).padStart(2, '0')}:00` : row.time_unit;
            let idx = labels.indexOf(label);
            if (idx !== -1) {
                let name = (row.api_name || '').toLowerCase();
                if (name.includes('openweather')) openweather[idx] = row.count;
                else if (name.includes('weatherapi')) weatherapi[idx] = row.count;
                else if (name.includes('gemini')) gemini[idx] = row.count;
            }
        });

        // 6. Bảng xếp hạng Hiệu suất API
        const [apiPerformance] = await db.query(`SELECT api_name, ROUND(AVG(response_time_ms)) as avg_time FROM api_logs WHERE ${dateCondition} GROUP BY api_name ORDER BY avg_time ASC`);

        // 7. Lấy Lỗi gần đây
        const [recentErrors] = await db.query(`SELECT api_name, status_code, error_message, created_at FROM api_logs WHERE status_code != 200 AND ${dateCondition} ORDER BY created_at DESC LIMIT 5`);

        res.status(200).json({
            success: true, 
            totalRequests: total, successRate, avgLatency: latency, 
            activeSessions: activeSessionsCount, // Đẩy con số thật về Frontend
            apiTraffic: { labels, openweather, weatherapi, gemini },
            apiPerformance, recentErrors
        });
    } catch (error) {
        console.error("Lỗi getAnalyticsData:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

