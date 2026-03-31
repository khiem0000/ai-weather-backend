const mysql = require('mysql2/promise');
require('dotenv').config();

// Tạo pool kết nối tới MySQL với cấu hình SSL tự động (Cloud thì bật, Local thì tắt)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    
    // Đã sửa: Tự động tắt SSL nếu host là localhost (để chạy XAMPP)
    ssl: process.env.DB_HOST === 'localhost' ? false : {
        rejectUnauthorized: false
    },
    
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,      // GIỮ KẾT NỐI SỐNG
    keepAliveInitialDelay: 0    // Bắt đầu ngay lập tức
});

// Test kết nối
db.getConnection()
    .then(conn => {
        console.log('✅ Kết nối thành công tới MySQL!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Lỗi kết nối MySQL:', err.message);
    });

module.exports = db;