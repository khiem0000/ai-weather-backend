const mysql = require('mysql2/promise');
require('dotenv').config();

// Tạo pool kết nối tới MySQL XAMPP chuẩn bảo mật
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(conn => {
        console.log('✅ Kết nối thành công tới MySQL (XAMPP)!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Lỗi kết nối MySQL:', err.message);
    });

module.exports = pool;