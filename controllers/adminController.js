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

// 7. THỐNG KÊ ANALYTICS (Real-time) - FIX LỖI TIMEZONE & ACTIVE SESSIONS
exports.getAnalyticsData = async (req, res) => {
    try {
        // BIẾN THỜI GIAN CHUẨN VIỆT NAM (UTC+7) ĐỂ QUERY CHÍNH XÁC
        const vnTime = `DATE_ADD(NOW(), INTERVAL 7 HOUR)`;

        // 1. Total Requests (Hôm nay theo giờ VN)
        const [totalReq] = await db.query(`SELECT COUNT(*) as total FROM api_logs WHERE DATE(created_at) = DATE(${vnTime})`);
        const totalRequests = totalReq[0].total || 0;

        // 2. Success Rate
        const [successReq] = await db.query(`SELECT COUNT(*) as success FROM api_logs WHERE status_code = 200 AND DATE(created_at) = DATE(${vnTime})`);
        const successRate = totalRequests > 0 ? Math.round((successReq[0].success / totalRequests) * 100) : 0;

        // 3. Avg Latency
        const [avgLat] = await db.query(`SELECT AVG(response_time_ms) as avg_time FROM api_logs WHERE DATE(created_at) = DATE(${vnTime})`);
        const avgLatency = avgLat[0].avg_time ? Math.round(avgLat[0].avg_time) : 0;

        // 4. Active Sessions (Fix: Đếm user có ID + Ước lượng Khách vãng lai)
        const [activeUsers] = await db.query(`SELECT COUNT(DISTINCT user_id) as active FROM api_logs WHERE created_at >= ${vnTime} - INTERVAL 5 MINUTE AND user_id IS NOT NULL`);
        const [guestReqs] = await db.query(`SELECT COUNT(*) as guest_reqs FROM api_logs WHERE created_at >= ${vnTime} - INTERVAL 5 MINUTE AND user_id IS NULL`);
        
        // Tính tổng: Người có tài khoản (Distinct) + Khách (Trung bình 3 request = 1 người)
        const activeSessions = (activeUsers[0].active || 0) + Math.ceil((guestReqs[0].guest_reqs || 0) / 3);

        // 5. API Traffic (Biểu đồ theo 7 giờ gần nhất)
        const [traffic] = await db.query(`
            SELECT HOUR(created_at) as hour, api_name, COUNT(*) as count
            FROM api_logs
            WHERE DATE(created_at) = DATE(${vnTime})
            GROUP BY HOUR(created_at), api_name
            ORDER BY hour ASC
        `);

        // Tính mốc giờ hiện tại ở VN
        const currentVnDate = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
        const currentVnHour = currentVnDate.getHours();
        
        const labels = [];
        const openweather = [];
        const weatherapi = [];
        const gemini = [];

        // Lấy 7 mốc giờ gần nhất (từ currentVnHour - 6 đến currentVnHour)
        for (let i = 6; i >= 0; i--) {
            let h = currentVnHour - i;
            if (h < 0) h += 24; // Xử lý lùi giờ khi qua ngày mới (VD: 1h sáng lùi về 20h đêm)
            
            labels.push(h + ':00');
            
            const ow = traffic.find(t => t.hour === h && t.api_name && t.api_name.toLowerCase().includes('openweather'));
            const wa = traffic.find(t => t.hour === h && t.api_name && t.api_name.toLowerCase().includes('weatherapi'));
            const gm = traffic.find(t => t.hour === h && t.api_name && t.api_name.toLowerCase().includes('gemini'));

            openweather.push(ow ? ow.count : 0);
            weatherapi.push(wa ? wa.count : 0);
            gemini.push(gm ? gm.count : 0);
        }

        // 6. API Performance
        const [apiPerf] = await db.query(`
            SELECT api_name, AVG(response_time_ms) as avg_time
            FROM api_logs
            WHERE DATE(created_at) = DATE(${vnTime})
            GROUP BY api_name
        `);

        // 7. Recent Errors
        const [recentErrors] = await db.query(`
            SELECT created_at, api_name, status_code, error_message
            FROM api_logs
            WHERE status_code >= 400
            ORDER BY created_at DESC
            LIMIT 5
        `);

        // 8. System Health
        const os = require('os');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMemGB = ((totalMem - freeMem) / (1024 * 1024 * 1024)).toFixed(2);
        const cpuUsage = Math.round(os.loadavg()[0] * 100) || 5; 
        const uptimeHours = Math.floor(process.uptime() / 3600);
        const uptimeMins = Math.floor((process.uptime() % 3600) / 60);

        res.status(200).json({
            success: true,
            totalRequests,
            successRate,
            avgLatency,
            activeSessions,
            apiTraffic: { labels, openweather, weatherapi, gemini },
            apiPerformance: apiPerf.map(a => ({ api_name: a.api_name, avg_time: Math.round(a.avg_time) })),
            recentErrors,
            systemHealth: {
                cpuPercent: cpuUsage > 100 ? 100 : cpuUsage,
                memoryUsedGB: usedMemGB,
                uptime: `${uptimeHours}h ${uptimeMins}m`,
                avgLatency
            }
        });

    } catch (error) {
        console.error("Lỗi Analytics:", error);
        res.status(500).json({ success: false, message: "Lỗi tải Analytics" });
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

