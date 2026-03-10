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
    // Thêm production domains vào đây khi deploy
    // 'https://your-production-domain.com'
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
// WEB PUSH CRON JOBS
const pushCronJobs = require('./services/pushCronJobs');
pushCronJobs.startCronJobs();

app.get('/', (req, res) => {
    res.status(200).send('Backend AI Weather đang thức 24/24!');
});

// =========================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "success", message: "API Server đang hoạt động cực tốt!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server Backend đang chạy tại http://localhost:${PORT}`);
});
