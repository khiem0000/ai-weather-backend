// File: controllers/adminController.js
const db = require('../config/db'); 
const { logApiUsage } = require('../helpers/apiLogger');
const webpush = require('web-push');
require('dotenv').config();
const os = require('os');

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

        await db.query("DELETE FROM notifications WHERE user_id IS NULL AND type = 'system'");
        if (message.trim() !== "") {
            await db.query("INSERT INTO notifications (title, message, type, created_at) VALUES (?, ?, 'system', NOW())", ["🚨 Thông báo Hệ thống", message]);
        }
        
        let pushResult = { success: 0, failed: 0 };

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
// API: THỐNG KÊ ANALYTICS (ĐÃ FIX MÚI GIỜ VIỆT NAM +7)
// ============================================================
exports.getAnalyticsData = async (req, res) => {
    try {
        const range = req.query.range || 'today';
        
        // FIX MÚI GIỜ: Cộng 7 tiếng vào created_at và NOW() để đưa về giờ Việt Nam
        let dateCondition = 'DATE(DATE_ADD(created_at, INTERVAL 7 HOUR)) = DATE(DATE_ADD(NOW(), INTERVAL 7 HOUR))';
        
        if (range === '7days') dateCondition = 'DATE_ADD(created_at, INTERVAL 7 HOUR) >= DATE_SUB(DATE_ADD(NOW(), INTERVAL 7 HOUR), INTERVAL 7 DAY)';
        if (range === '30days') dateCondition = 'DATE_ADD(created_at, INTERVAL 7 HOUR) >= DATE_SUB(DATE_ADD(NOW(), INTERVAL 7 HOUR), INTERVAL 30 DAY)';

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

        // 4. ĐẾM ACTIVE SESSIONS THỰC TẾ (User đang online trong 5 phút vừa qua)
        const [activeUsers] = await db.query(`
            SELECT COUNT(DISTINCT user_id) as activeSessions 
            FROM api_logs 
            WHERE user_id IS NOT NULL 
              AND created_at >= DATE_SUB(DATE_ADD(NOW(), INTERVAL 7 HOUR), INTERVAL 5 MINUTE)
        `);
        const activeSessionsCount = activeUsers[0].activeSessions || 0;

        // 5. Lấy dữ liệu Biểu đồ Traffic (Đã ép chuẩn giờ Việt Nam +7)
        let trafficQuery = range === 'today' 
            ? `SELECT HOUR(DATE_ADD(created_at, INTERVAL 7 HOUR)) as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY HOUR(DATE_ADD(created_at, INTERVAL 7 HOUR)), api_name ORDER BY time_unit ASC`
            : `SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 7 HOUR), '%m-%d') as time_unit, api_name, COUNT(*) as count FROM api_logs WHERE ${dateCondition} GROUP BY DATE(DATE_ADD(created_at, INTERVAL 7 HOUR)), api_name ORDER BY DATE(DATE_ADD(created_at, INTERVAL 7 HOUR)) ASC`;
        
        const [trafficData] = await db.query(trafficQuery);
        
        let labels = [];
        if (range === 'today') {
            // Đã fix lỗi cú pháp "Asc;" ở đây
            for (let i = 0; i <= 23; i++) {
                labels.push(`${String(i).padStart(2, '0')}:00`);
            }
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
        const [recentErrors] = await db.query(`SELECT api_name, status_code, error_message, DATE_ADD(created_at, INTERVAL 7 HOUR) as created_at FROM api_logs WHERE status_code != 200 AND ${dateCondition} ORDER BY created_at DESC LIMIT 5`);

        // ==========================================
        // ĐO NHỊP TIM MÁY CHỦ (SYSTEM HEALTH)
        // ==========================================
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsedGB = (usedMem / 1024 / 1024 / 1024).toFixed(2);

        const cpus = os.cpus().length;
        let cpuLoad = Math.round((os.loadavg()[0] / cpus) * 100); 
        const cpuPercent = cpuLoad > 100 ? 100 : cpuLoad;

        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeString = `${hours}h ${minutes}m`;

        const systemHealth = {
            cpuPercent: cpuPercent,
            memoryUsedGB: memoryUsedGB,
            uptime: uptimeString
        };

        res.status(200).json({
            success: true, 
            totalRequests: total, successRate, avgLatency: latency, 
            activeSessions: activeSessionsCount, 
            apiTraffic: { labels, openweather, weatherapi, gemini },
            apiPerformance, recentErrors, systemHealth
        });
    } catch (error) {
        console.error("Lỗi getAnalyticsData:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// ============================================================
// API: HỆ THỐNG HỖ TRỢ NGƯỜI DÙNG (SUPPORT TICKETS)
// ============================================================

// 10. (PUBLIC) User gửi thư hỗ trợ
exports.submitSupportTicket = async (req, res) => {
    try {
        const { userId, email, title, message, image1, image2, image3 } = req.body;

        if (!email || !title || !message) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ email, tiêu đề và nội dung!" });
        }

        await db.query(
            `INSERT INTO support_tickets (user_id, email, title, message, image1, image2, image3)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId || null, email, title, message, image1 || null, image2 || null, image3 || null]
        );

        res.status(200).json({ success: true, message: "Đã gửi yêu cầu hỗ trợ thành công!" });
    } catch (error) {
        console.error("Lỗi submitSupportTicket:", error);
        res.status(500).json({ success: false, message: "Lỗi Server khi gửi thư!" });
    }
};
// (PUBLIC) Lấy danh sách thư hỗ trợ của User
exports.getUserTickets = async (req, res) => {
    try {
        const userEmail = req.query.email; 
        
        if (!userEmail) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp email để xem lịch sử!" });
        }

        const [tickets] = await db.query(`
            SELECT id, title, message, status, admin_reply, DATE_ADD(replied_at, INTERVAL 7 HOUR) as replied_at, DATE_ADD(created_at, INTERVAL 7 HOUR) as created_at 
            FROM support_tickets 
            WHERE email = ? 
            ORDER BY created_at DESC
        `, [userEmail]);

        res.status(200).json({ success: true, tickets });
    } catch (error) {
        console.error("Lỗi getUserTickets:", error);
        res.status(500).json({ success: false, message: "Lỗi tải lịch sử hỗ trợ!" });
    }
};
// 11. (ADMIN) Lấy danh sách thư (Không load ảnh để tránh giật lag)
exports.getSupportTickets = async (req, res) => {
    try {
        const [tickets] = await db.query(`
            SELECT id, user_id, email, title, message, status, DATE_ADD(created_at, INTERVAL 7 HOUR) as created_at
            FROM support_tickets
            ORDER BY created_at DESC
        `);
        res.status(200).json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi tải danh sách thư!" });
    }
};

// 12. (ADMIN) Lấy chi tiết 1 bức thư (bao gồm load 3 ảnh Base64)
exports.getTicketDetails = async (req, res) => {
    try {
        const [ticket] = await db.query(`
            SELECT id, user_id, email, title, message, image1, image2, image3, status, DATE_ADD(created_at, INTERVAL 7 HOUR) as created_at
            FROM support_tickets WHERE id = ?
        `, [req.params.id]);

        if (ticket.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy thư!" });
        res.status(200).json({ success: true, ticket: ticket[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi tải chi tiết thư!" });
    }
};

// 13. (ADMIN) Đánh dấu đã xử lý xong (Resolved)
exports.resolveTicket = async (req, res) => {
    try {
        await db.query('UPDATE support_tickets SET status = "resolved" WHERE id = ?', [req.params.id]);
        res.status(200).json({ success: true, message: "Đã đánh dấu xử lý xong!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái!" });
    }
};

// 14. (ADMIN) Gửi phản hồi cho User & Đánh dấu hoàn thành
exports.replySupportTicket = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { replyMessage } = req.body;

        if (!replyMessage) {
            return res.status(400).json({ success: false, message: "Nội dung phản hồi không được để trống!" });
        }

        // 1. Lưu câu trả lời của Admin và đổi trạng thái thành in_progress (Đang xử lý)
        await db.query(`
            UPDATE support_tickets 
            SET admin_reply = ?, 
                replied_at = DATE_ADD(NOW(), INTERVAL 7 HOUR), 
                status = 'in_progress'
            WHERE id = ?
        `, [replyMessage, ticketId]);

        // 2. (TÍNH NĂNG VIP): Bắn thông báo vào quả chuông của User
        const [ticketInfo] = await db.query("SELECT user_id, title FROM support_tickets WHERE id = ?", [ticketId]);
        
        if (ticketInfo.length > 0 && ticketInfo[0].user_id) {
            const notifTitle = "Thư hỗ trợ đã được phản hồi!";
            const notifMsg = `Admin đã trả lời yêu cầu: "${ticketInfo[0].title}". Vui lòng kiểm tra email hoặc mục hỗ trợ.`;
            
            await db.query(`
                INSERT INTO notifications (user_id, title, message, type, created_at) 
                VALUES (?, ?, ?, 'system', DATE_ADD(NOW(), INTERVAL 7 HOUR))
            `, [ticketInfo[0].user_id, notifTitle, notifMsg]);
        }

        res.status(200).json({ success: true, message: "Đã gửi phản hồi thành công!" });
    } catch (error) {
        console.error("Lỗi replySupportTicket:", error);
        res.status(500).json({ success: false, message: "Lỗi Server khi gửi phản hồi!" });
    }
};

// 15. (ADMIN) Thay đổi trạng thái thư (Đã xử lý / Từ chối)
exports.changeTicketStatus = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { status } = req.body;

        // Chỉ chấp nhận 4 trạng thái có trong ENUM MySQL
        if (!['pending', 'in_progress', 'resolved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ!" });
        }

        await db.query('UPDATE support_tickets SET status = ? WHERE id = ?', [status, ticketId]);
        res.status(200).json({ success: true, message: "Đã cập nhật trạng thái thư!" });
    } catch (error) {
        console.error("Lỗi changeTicketStatus:", error);
        res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái!" });
    }
};

// 16. (USER) Gửi phản hồi lại cho Admin trong thư đã có
exports.replySupportTicketUser = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { replyMessage } = req.body;

        if (!replyMessage) {
            return res.status(400).json({ success: false, message: "Thiếu nội dung phản hồi!" });
        }

        // Nối tin nhắn mới vào đoạn message cũ (thêm xuống dòng cho đẹp)
        // Đồng thời chuyển trạng thái về 'pending' để Admin biết có thư mới cần xử lý
        const appendText = `\n\n-------------------------\n[BẠN PHẢN HỒI THÊM]:\n${replyMessage}`;

        const [result] = await db.query(
            `UPDATE support_tickets 
             SET message = CONCAT(message, ?), status = 'pending' 
             WHERE id = ?`,
            [appendText, ticketId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy thư hỗ trợ!" });
        }

        res.status(200).json({ success: true, message: "Đã gửi phản hồi thành công!" });
    } catch (error) {
        console.error("Lỗi replySupportTicketUser:", error);
        res.status(500).json({ success: false, message: "Lỗi Server khi gửi phản hồi!" });
    }
};

