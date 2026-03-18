const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');

const app = express();

// Cấu hình CORS cho phép requests từ production domain
// Thay đổi origin thành domain thật khi deploy
const allowedOrigins = [
    'http://127.0.0.1:5500', 
    'http://localhost:5500', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    // Thêm production domains vào đây:
    'https://aiweather.id.vn', 
    'https://admin.aiweather.id.vn' // <--- THÊM Ở ĐÂY LÀ CHUẨN XÁC 100%
];

// Kiểm tra nếu có biến môi trường CORS_ORIGIN thì sử dụng
if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').forEach(origin => {
        if (origin.trim()) allowedOrigins.push(origin.trim());
    });
}

app.use(cors({
    origin: function(origin, callback) {
        // Cho phép requests không có origin (như mobile apps, Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            // Log nhưng không chặn - có thể bật chế độ strict trong production
            console.log('CORS request from origin:', origin);
            // Trong production, uncomment dòng dưới để chặn:
            // return callback(new Error('Not allowed by CORS'), false);
        }
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// =========================================================
// ĐÂY LÀ KHÚC QUAN TRỌNG NHẤT BỊ THIẾU DẪN ĐẾN LỖI 404:
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// =========================================================
// WEB PUSH ROUTES
const pushRoutes = require('./routes/pushRoutes');
app.use('/api/push', pushRoutes);

// =========================================================
// NOTIFICATION ROUTES - System Popup
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// =========================================================
// CHAT ROUTES - AI Chat Assistant với Gemini
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// =========================================================
// ADMIN ROUTES - Hệ thống Quản trị
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// =========================================================
// WEB PUSH CRON JOBS
const pushCronJobs = require('./services/pushCronJobs');
pushCronJobs.startCronJobs();

app.get('/', async (req, res) => {
    try {
        // Gửi 1 câu lệnh SQL siêu nhẹ để đánh thức MySQL
        await db.query('SELECT 1'); 
        res.status(200).send('Backend & Database AI Weather đều đang thức 24/24!');
    } catch (error) {
        console.error('❌ Lỗi Database ngủ quên:', error);
        res.status(500).send('Database mất kết nối rồi!');
    }
});

// =========================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "success", message: "API Server đang hoạt động cực tốt!" });
});

// ==========================================
// CƠ CHẾ DỌN RÁC TỰ ĐỘNG (AUTO-CLEANUP LOGS)
// ==========================================

// Cứ mỗi 12 tiếng, Server sẽ tự động thức dậy và xóa sạch các log cũ hơn 7 ngày
setInterval(async () => {
    try {
        console.log("🧹 Bắt đầu dọn dẹp dữ liệu log cũ...");
        // Chỉ giữ lại log của 7 ngày gần nhất để xem Analytics, còn lại xóa hết!
        const [result] = await db.query(`DELETE FROM api_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
        console.log(`✅ Đã xóa ${result.affectedRows} dòng log rác! Giải phóng dung lượng thành công.`);
    } catch (error) {
        console.error("❌ Lỗi dọn rác:", error);
    }
}, 12 * 60 * 60 * 1000); // 12 giờ x 60 phút x 60 giây x 1000ms

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server Backend đang chạy tại http://localhost:${PORT}`);
});
