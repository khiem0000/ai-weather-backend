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
// ============================================================
// API: THỐNG KÊ ANALYTICS (FIXED BỞI GEMINI)
// ============================================================
exports.getAnalyticsData = async (req, res) => {
    try {
        const range = req.query.range || 'today';
        let dateCondition = 'DATE(created_at) = CURDATE()';
        
        if (range === '7days') {
            dateCondition = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        } else if (range === '30days') {
            dateCondition = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        }

        // 1. Lấy tổng số request
        const [[{ totalRequests }]] = await db.query(`SELECT COUNT(*) as totalRequests FROM api_logs WHERE ${dateCondition}`);
        
        // 2. Tính tỉ lệ thành công
        const [[{ successCount }]] = await db.query(`SELECT COUNT(*) as successCount FROM api_logs WHERE status_code = 200 AND ${dateCondition}`);
        const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0;

        // 3. Tính độ trễ trung bình
        const [[{ avgLatency }]] = await db.query(`SELECT ROUND(AVG(response_time_ms)) as avgLatency FROM api_logs WHERE ${dateCondition}`);

        // 4. Lấy dữ liệu Biểu đồ Traffic (Nhóm theo giờ hoặc theo ngày)
        let trafficQuery = '';
        if (range === 'today') {
            trafficQuery = `SELECT HOUR(created_at) as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY HOUR(created_at), api_name ORDER BY time_unit ASC`;
        } else {
            trafficQuery = `SELECT DATE_FORMAT(created_at, '%m-%d') as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY DATE(created_at), api_name ORDER BY DATE(created_at) ASC`;
        }
        
        const [trafficData] = await db.query(trafficQuery);
        
        // Xử lý dữ liệu thô thành mảng cho Chart.js
        const labelsSet = new Set();
        trafficData.forEach(row => {
            let label = range === 'today' ? `${String(row.time_unit).padStart(2, '0')}:00` : row.time_unit;
            labelsSet.add(label);
        });
        const labels = Array.from(labelsSet).sort(); // Sắp xếp thời gian tăng dần
        
        const openweather = new Array(labels.length).fill(0);
        const weatherapi = new Array(labels.length).fill(0);
        const gemini = new Array(labels.length).fill(0);
        
        trafficData.forEach(row => {
            let label = range === 'today' ? `${String(row.time_unit).padStart(2, '0')}:00` : row.time_unit;
            let index = labels.indexOf(label);
            let name = row.api_name.toLowerCase();
            
            if (name.includes('openweather')) openweather[index] = row.count;
            else if (name.includes('weatherapi')) weatherapi[index] = row.count;
            else if (name.includes('gemini')) gemini[index] = row.count;
        });

        // 5. Lấy Top Locations
        const [topLocations] = await db.query(`
            SELECT location as name, COUNT(*) as count 
            FROM api_logs 
            WHERE ${dateCondition} AND location IS NOT NULL AND location != 'Unknown'
            GROUP BY location 
            ORDER BY count DESC 
            LIMIT 5
        `);
        
        const locationsWithPercentage = topLocations.map(loc => ({
            name: loc.name,
            percentage: totalRequests > 0 ? Math.round((loc.count / totalRequests) * 100) : 0
        }));

        // 6. Lấy Lỗi gần đây
        const [recentErrors] = await db.query(`
            SELECT api_name, status_code, error_message, created_at 
            FROM api_logs 
            WHERE status_code != 200 AND ${dateCondition} 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        // Trả về JSON đúng chuẩn cho Frontend
        res.status(200).json({
            success: true,
            totalRequests: totalRequests || 0,
            successRate: successRate || 0,
            avgLatency: avgLatency || 0,
            apiTraffic: {
                labels,
                openweather,
                weatherapi,
                gemini
            },
            topLocations: locationsWithPercentage,
            recentErrors
        });
        
    } catch (error) {
        console.error("Lỗi getAnalyticsData:", error);
        res.status(500).json({ success: false, message: "Lỗi Server nội bộ" });
    }
};

