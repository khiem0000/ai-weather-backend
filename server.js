const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');

const app = express();

// Cấu hình CORS cho phép requests từ Live Server và các port khác
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'],
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

// =========================================================

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "success", message: "API Server đang hoạt động cực tốt!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server Backend đang chạy tại http://localhost:${PORT}`);
});
