require('dotenv').config(); // ✅ Load dotenv FIRST at the very very top
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../config/db');

// ============================================================
// HELPER: Get device and browser info from request
// ============================================================
function getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Detect browser
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) browser = 'Internet Explorer';
    
    // Detect device type
    let device = 'Desktop';
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) device = 'Mobile';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) device = 'iPhone/iPad';
    
    // Detect OS
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    
    return `${device} - ${browser} (${os})`;
}

// ============================================================
// HELPER: Get IP address from request
// ============================================================
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'Unknown';
}

// ============================================================
// HELPER: Get location from IP address using ip-api.com (free)
// ============================================================
async function getLocationFromIP(ip) {
    // Skip private IPs and localhost
    if (!ip || ip === 'Unknown' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip.startsWith('::1') || ip.startsWith('fe80:')) {
        return 'Local Network';
    }
    
    try {
        // Use ip-api.com - free tier (100 requests/minute)
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Return Vietnamese location format
            if (data.country === 'Vietnam') {
                return `${data.city || 'Vietnam'}, ${data.country}`;
            }
            return `${data.city || ''}, ${data.regionName || ''}, ${data.country}`.replace(/^, |, $/g, '');
        }
        return 'Unknown Location';
    } catch (error) {
        console.error('Error getting location:', error);
        return 'Unknown Location';
    }
}

// ============================================================
// CẤU HÌNH EMAIL/SMTP - SỬ DỤNG GMAIL
// ============================================================
// Sử dụng Gmail với App Password (không dùng mật khẩu Gmail thường)
// Để tạo App Password: https://myaccount.google.com/apppasswords
const EMAIL_USER = process.env.EMAIL_USER || 'yourgmail@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'YOUR_APP_PASSWORD_HERE'; // App Password 16 ký tự
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;

// Cấu hình SMTP Transporter với defaults đảm bảo from luôn được xác định
const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false, // Sử dụng TLS cho port 587 (không dùng SSL)
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Tránh lỗi chứng chỉ trên localhost
    },
    // ✅ defaults đảm bảo 'from' luôn được xác định rõ ràng
    defaults: {
        from: `"AI Weather Support" <${EMAIL_USER}>`
    }
});

// Đối tượng lưu tạm mã OTP trong bộ nhớ (Để demo nhanh cho đồ án)
// Trong thực tế nên lưu vào Database kèm thời gian hết hạn
// Cấu trúc: { email: { otp: '123456', timestamp: Date.now() } }
let otpStore = {};

// Thời hạn hiệu lực của OTP (5 phút = 300000ms)
const OTP_EXPIRATION = 5 * 60 * 1000;

// ============================================================
// CÁC API AUTH
// ============================================================

// 1. API ĐĂNG KÝ (REGISTER)
exports.register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: "Email này đã được sử dụng!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await db.query(
            'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
            [full_name, email, hashedPassword]
        );

await db.query(
            'INSERT INTO settings (user_id, language, temp_unit, time_format, notify_severe, notify_daily, notify_planner, city, has_completed_onboarding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [result.insertId, 'en', 'C', '12h', 0, 0, 0, null, 0]
        );

        res.status(201).json({ message: "Đăng ký tài khoản thành công!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi Server, vui lòng thử lại sau!" });
    }
};

// 2. API ĐĂNG NHẬP (LOGIN)
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).json({ message: "Email hoặc mật khẩu không chính xác!" });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Email hoặc mật khẩu không chính xác!" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || 'TranHoangKhiem_SecretKey_2026',
            { expiresIn: '7d' }
        );

        // ============================================================
        // LƯU LỊCH SỬ ĐĂNG NHẬP
        // ============================================================
        try {
            // Đánh dấu tất cả các session trước đó là không hoạt động
            await db.query('UPDATE login_history SET is_current = FALSE WHERE user_id = ?', [user.id]);

            // Lấy thông tin thiết bị và IP
            const deviceInfo = getDeviceInfo(req);
            const clientIP = getClientIP(req);

            // Lấy location từ IP
            const location = await getLocationFromIP(clientIP);

            // Lưu record đăng nhập mới
            await db.query(
                'INSERT INTO login_history (user_id, device_info, browser, ip_address, location, login_time, is_current) VALUES (?, ?, ?, ?, ?, NOW(), TRUE)',
                [user.id, deviceInfo, deviceInfo.split(' - ')[1] || 'Unknown', clientIP, location]
            );
        } catch (loginHistoryError) {
            console.error('Lỗi lưu lịch sử đăng nhập:', loginHistoryError);
            // Không ảnh hưởng đến việc đăng nhập nếu lỗi
        }

        // Lấy settings từ database
        let userSettings = null;
        try {
            const [settings] = await db.query(
                'SELECT language, temp_unit, has_completed_onboarding FROM settings WHERE user_id = ?',
                [user.id]
            );
            if (settings.length > 0) {
                userSettings = settings[0];
            }
        } catch (settingsError) {
            console.error('Lỗi lấy settings:', settingsError);
        }

        res.status(200).json({
            message: "Đăng nhập thành công!",
            token: token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                avatar: user.avatar,
                settings: {
                    language: userSettings ? userSettings.language : 'en',
                    tempUnit: userSettings ? userSettings.temp_unit : 'C',
                    hasCompletedOnboarding: userSettings ? Boolean(userSettings.has_completed_onboarding) : false
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi Server" });
    }
};

// 2.1. API XÁC THỰC TOKEN (VERIFY TOKEN)
exports.verifyToken = async (req, res) => {
    try {
        // Token đã được xác thực bởi middleware
        // req.user chứa thông tin từ token đã giải mã
        const userId = req.user.id;
        
        // Kiểm tra user có tồn tại trong database không
        const [users] = await db.query('SELECT id, full_name, email, avatar FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            // User đã bị xóa khỏi database
            return res.status(401).json({ 
                message: "Tài khoản không tồn tại hoặc đã bị xóa!",
                valid: false 
            });
        }
        
        const user = users[0];
        
        // Token hợp lệ và user tồn tại
        res.status(200).json({
            valid: true,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                avatar: user.avatar
            }
        });
        
    } catch (error) {
        console.error("Verify Token Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};
// 3. API GỬI MÃ OTP VÀ XÁC THỰC OTP (DÙNG CHO QUÊN MẬT KHẨU)

// A. API KIỂM TRA EMAIL TỒN TẠI
exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: "Vui lòng nhập email!", exists: false });
        }
        
        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        
        if (users.length > 0) {
            res.status(200).json({ exists: true, message: "Email tồn tại trong hệ thống" });
        } else {
            res.status(200).json({ exists: false, message: "Email không tồn tại trong hệ thống" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi Server", exists: false });
    }
};

// B. API GỬI MÃ OTP (SEND OTP)
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        
        // ✅ Kiểm tra email có tồn tại trong database không
        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).json({ message: "Email này chưa được đăng ký! Vui lòng đăng ký trước." });
        }
        
        // Tạo mã OTP ngẫu nhiên 6 chữ số
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Lưu mã OTP với timestamp để kiểm tra hết hạn (5 phút)
        otpStore[email] = {
            otp: otp,
            timestamp: Date.now()
        };
        
        // Nội dung Email
        const mailOptions = {
            from: `"AI Weather Support" <${EMAIL_USER}>`,
            to: email,
            subject: "Mã xác thực OTP đặt lại mật khẩu - AI Weather",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>Xác thực tài khoản AI Weather</h2>
                    <p>Chào bạn, mã OTP để đặt lại mật khẩu của bạn là:</p>
                    <h1 style="color: #a855f7; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>Mã này có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
                </div>
            `
        };

        // Thực hiện gửi mail với error handling chi tiết
        try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({ message: "Mã OTP đã được gửi thành công!" });
        } catch (emailError) {
            // Phân loại lỗi để hiển thị thông báo phù hợp
            if (emailError.code === 'ECONNREFUSED') {
                res.status(500).json({ message: "Không thể kết nối đến mail server. Vui liên hệ quản trị viên!" });
            } else if (emailError.code === 'ETIMEDOUT' || emailError.message.includes('timeout')) {
                res.status(500).json({ message: "Kết nối mail server quá thời gian. Vui thử lại sau!" });
            } else if (emailError.code === 'ENOTFOUND') {
                res.status(500).json({ message: "Không tìm thấy mail server. Vui kiểm tra cấu hình domain!" });
            } else if (emailError.message.includes('Invalid login') || emailError.message.includes('535')) {
                res.status(500).json({ message: "Tài khoản email không hợp lệ. Vui kiểm tra lại email/mật khẩu!" });
            } else {
                res.status(500).json({ message: "Không thể gửi email. Vui thử lại sau!" });
            }
        }
    } catch (error) {
        console.error("Lỗi sendOTP:", error);
        res.status(500).json({ message: "Lỗi Server, vui lòng thử lại sau!" });
    }
};

// B. API XÁC THỰC OTP (VERIFY OTP)
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;
    
    // Kiểm tra email có trong store không
    if (!otpStore[email]) {
        return res.status(400).json({ message: "Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng gửi lại mã OTP!" });
    }
    
    // Lấy thông tin OTP và timestamp
    const storedData = otpStore[email];
    const { otp: storedOTP, timestamp } = storedData;
    
    // Kiểm tra OTP đã hết hạn chưa (5 phút)
    const now = Date.now();
    if (now - timestamp > OTP_EXPIRATION) {
        // OTP đã hết hạn, xóa khỏi store
        delete otpStore[email];
        return res.status(400).json({ message: "Mã OTP đã hết hạn (quá 5 phút). Vui lòng gửi lại mã mới!" });
    }
    
    // Kiểm tra OTP khớp
    if (storedOTP === otp) {
        // Nếu khớp, xóa OTP đi để không dùng lại được lần 2
        delete otpStore[email]; 
        res.status(200).json({ message: "Xác thực thành công!" });
    } else {
        res.status(400).json({ message: "Mã OTP không chính xác!" });
    }
};

// C. API ĐẶT LẠI MẬT KHẨU (RESET PASSWORD)
exports.resetPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Vui lòng cung cấp đầy đủ thông tin!" });
        }

        // Kiểm tra email tồn tại
        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(400).json({ message: "Email không tồn tại trong hệ thống!" });
        }

        // Mã hóa mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Cập nhật mật khẩu trong database
        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        res.status(200).json({ message: "Đặt lại mật khẩu thành công!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi Server, vui lòng thử lại sau!" });
    }
};

// ============================================================
// 4. API LẤY THÔNG TIN PROFILE
// ============================================================
exports.getProfile = async (req, res) => {
    try {
        // Lấy user_id từ middleware (đã giải mã token)
        const userId = req.user.id;
        
        const [users] = await db.query(
            'SELECT id, full_name, email, avatar, created_at FROM users WHERE id = ?', 
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy người dùng!" });
        }
        
        const user = users[0];
        
        // Format ngày tham gia
        const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }) : 'Unknown';
        
        res.status(200).json({
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            avatar: user.avatar || null,
            member_since: memberSince,
            created_at: user.created_at
        });
        
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 5. API CẬP NHẬT THÔNG TIN PROFILE
// ============================================================
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, email, avatar } = req.body;
        
        // Validate input
        if (!full_name || !email) {
            return res.status(400).json({ message: "Vui lòng cung cấp đầy đủ thông tin!" });
        }
        
        // Kiểm tra email đã tồn tại chưa (trừ email hiện tại)
        const [existingUsers] = await db.query(
            'SELECT id FROM users WHERE email = ? AND id != ?', 
            [email, userId]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "Email này đã được sử dụng bởi người dùng khác!" });
        }
        
        // Cập nhật thông tin
        await db.query(
            'UPDATE users SET full_name = ?, email = ?, avatar = ? WHERE id = ?',
            [full_name, email, avatar || null, userId]
        );
        
        res.status(200).json({
            message: "Cập nhật thông tin thành công!",
            user: {
                id: userId,
                full_name: full_name,
                email: email,
                avatar: avatar || null
            }
        });
        
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 6. API LẤY LỊCH SỬ ĐĂNG NHẬP
// ============================================================
exports.getLoginHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Lấy lịch sử đăng nhập, sắp xếp theo thời gian mới nhất
        const [loginHistory] = await db.query(
            'SELECT id, device_info, browser, ip_address, location, login_time, logout_time, is_current FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT 20',
            [userId]
        );
        
        // Format dữ liệu trả về
        const formattedHistory = loginHistory.map(item => ({
            id: item.id,
            device: item.device_info || 'Unknown Device',
            browser: item.browser || 'Unknown',
            ip: item.ip_address || 'Unknown',
            location: item.location || 'Unknown',
            loginTime: item.login_time ? new Date(item.login_time).toISOString() : null,
            logoutTime: item.logout_time ? new Date(item.logout_time).toISOString() : null,
            isCurrent: Boolean(item.is_current)
        }));
        
        res.status(200).json({
            success: true,
            loginHistory: formattedHistory
        });
        
    } catch (error) {
        console.error("Get Login History Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 7. API LẤY THÔNG TIN CÀI ĐẶT
// ============================================================
exports.getSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [settings] = await db.query(
            'SELECT language, temp_unit, time_format, notify_severe, notify_daily, notify_planner, city, has_completed_onboarding FROM settings WHERE user_id = ?',
            [userId]
        );
        
        if (settings.length === 0) {
            // Nếu chưa có settings, tạo mới
            await db.query('INSERT INTO settings (user_id) VALUES (?)', [userId]);
            return res.status(200).json({
                language: 'en',
                tempUnit: 'C',
                timeFormat: '12h',
                notifySevere: true,
                notifyDaily: true,
                notifyPlanner: true,
                city: 'Can Tho',
                hasCompletedOnboarding: false
            });
        }
        
        const s = settings[0];
        res.status(200).json({
            language: s.language || 'en',
            tempUnit: s.temp_unit || 'C',
            timeFormat: s.time_format || '12h',
            notifySevere: Boolean(s.notify_severe),
            notifyDaily: Boolean(s.notify_daily),
            notifyPlanner: Boolean(s.notify_planner),
            city: s.city || 'Can Tho',
            hasCompletedOnboarding: Boolean(s.has_completed_onboarding)
        });
        
    } catch (error) {
        console.error("Get Settings Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 8. API CẬP NHẬT CÀI ĐẶT
// ============================================================
exports.updateSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { language, tempUnit, timeFormat, notifySevere, notifyDaily, notifyPlanner, city, hasCompletedOnboarding } = req.body;
        
        // Kiểm tra xem settings đã tồn tại chưa
        const [existingSettings] = await db.query('SELECT id FROM settings WHERE user_id = ?', [userId]);
        
        if (existingSettings.length === 0) {
            // Tạo mới nếu chưa có
            await db.query(
                'INSERT INTO settings (user_id, language, temp_unit, time_format, notify_severe, notify_daily, notify_planner, city, has_completed_onboarding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, language || 'en', tempUnit || 'C', timeFormat || '12h', notifySevere ? 1 : 0, notifyDaily ? 1 : 0, notifyPlanner ? 1 : 0, city || null, hasCompletedOnboarding ? 1 : 0]
            );
        } else {
            // Cập nhật nếu đã tồn tại
            // Build dynamic query based on provided fields
            let updateFields = [];
            let updateValues = [];
            
            if (language !== undefined) {
                updateFields.push('language = ?');
                updateValues.push(language);
            }
            if (tempUnit !== undefined) {
                updateFields.push('temp_unit = ?');
                updateValues.push(tempUnit);
            }
            if (timeFormat !== undefined) {
                updateFields.push('time_format = ?');
                updateValues.push(timeFormat);
            }
            if (notifySevere !== undefined) {
                updateFields.push('notify_severe = ?');
                updateValues.push(notifySevere ? 1 : 0);
            }
            if (notifyDaily !== undefined) {
                updateFields.push('notify_daily = ?');
                updateValues.push(notifyDaily ? 1 : 0);
            }
            if (notifyPlanner !== undefined) {
                updateFields.push('notify_planner = ?');
                updateValues.push(notifyPlanner ? 1 : 0);
            }
            if (city !== undefined) {
                updateFields.push('city = ?');
                updateValues.push(city);
            }
            if (hasCompletedOnboarding !== undefined) {
                updateFields.push('has_completed_onboarding = ?');
                updateValues.push(hasCompletedOnboarding ? 1 : 0);
            }
            
            if (updateFields.length > 0) {
                updateValues.push(userId);
                await db.query(
                    `UPDATE settings SET ${updateFields.join(', ')} WHERE user_id = ?`,
                    updateValues
                );
            }
        }
        
        res.status(200).json({
            message: "Cập nhật cài đặt thành công!",
            settings: {
                language: language || 'en',
                tempUnit: tempUnit || 'C',
                timeFormat: timeFormat || '12h',
                notifySevere: Boolean(notifySevere),
                notifyDaily: Boolean(notifyDaily),
                notifyPlanner: Boolean(notifyPlanner),
                city: city || null,
                hasCompletedOnboarding: Boolean(hasCompletedOnboarding)
            }
        });
        
    } catch (error) {
        console.error("Update Settings Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 9. API LẤY TẤT CẢ TASKS CỦA USER
// ============================================================
exports.getTasks = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [tasks] = await db.query(
            'SELECT id, user_id, task_date, task_text, color, is_completed FROM tasks WHERE user_id = ? ORDER BY task_date ASC',
            [userId]
        );
        
        // Format dữ liệu trả về
        const formattedTasks = tasks.map(task => ({
            id: task.id,
            userId: task.user_id,
            date: task.task_date,
            text: task.task_text,
            color: task.color || 'cb-pastel-blue',
            completed: Boolean(task.is_completed)
        }));
        
        // Chuyển đổi sang format của frontend
        const plannerEvents = {};
        formattedTasks.forEach(task => {
            if (!plannerEvents[task.date]) {
                plannerEvents[task.date] = [];
            }
            plannerEvents[task.date].push({
                id: task.id.toString(),
                text: task.text,
                color: task.color,
                checked: task.completed
            });
        });
        
        res.status(200).json({
            success: true,
            tasks: formattedTasks,
            plannerEvents: plannerEvents
        });
        
    } catch (error) {
        console.error("Get Tasks Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 10. API TẠO TASK MỚI
// ============================================================
exports.createTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { task_date, task_text, color } = req.body;
        
        // Validate input
        if (!task_date || !task_text) {
            return res.status(400).json({ message: "Vui lòng cung cấp đầy đủ thông tin!" });
        }
        
        const [result] = await db.query(
            'INSERT INTO tasks (user_id, task_date, task_text, color, is_completed) VALUES (?, ?, ?, ?, ?)',
            [userId, task_date, task_text, color || 'cb-pastel-blue', 0]
        );
        
        res.status(201).json({
            success: true,
            message: "Tạo task thành công!",
            task: {
                id: result.insertId,
                userId: userId,
                date: task_date,
                text: task_text,
                color: color || 'cb-pastel-blue',
                completed: false
            }
        });
        
    } catch (error) {
        console.error("Create Task Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 11. API CẬP NHẬT TASK
// ============================================================
exports.updateTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;
        const { task_text, color, is_completed } = req.body;
        
        // Kiểm tra task tồn tại và thuộc về user
        const [existingTask] = await db.query(
            'SELECT id FROM tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );
        
        if (existingTask.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy task!" });
        }
        
        // Cập nhật task
        await db.query(
            'UPDATE tasks SET task_text = ?, color = ?, is_completed = ? WHERE id = ? AND user_id = ?',
            [task_text, color, is_completed ? 1 : 0, taskId, userId]
        );
        
        res.status(200).json({
            success: true,
            message: "Cập nhật task thành công!",
            task: {
                id: parseInt(taskId),
                text: task_text,
                color: color,
                completed: Boolean(is_completed)
            }
        });
        
    } catch (error) {
        console.error("Update Task Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 12. API XÓA TASK
// ============================================================
exports.deleteTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;
        
        // Kiểm tra task tồn tại và thuộc về user
        const [existingTask] = await db.query(
            'SELECT id FROM tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );
        
        if (existingTask.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy task!" });
        }
        
        // Xóa task
        await db.query(
            'DELETE FROM tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );
        
        res.status(200).json({
            success: true,
            message: "Xóa task thành công!"
        });
        
    } catch (error) {
        console.error("Delete Task Error:", error);
        res.status(500).json({ message: "Lỗi Server!" });
    }
};

// ============================================================
// 13. API YÊU CẦU THAY ĐỔI EMAIL - GỬI OTP
// ============================================================
exports.requestEmailChange = async (req, res) => {
    try {
        const userId = req.user.id;
        const { newEmail } = req.body;
        
        // Validate input
        if (!newEmail) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập email mới!" });
        }
        
        // Validate định dạng email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ success: false, message: "Định dạng email không hợp lệ!" });
        }
        
        // Kiểm tra email mới đã được sử dụng chưa
        const [existingUsers] = await db.query(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [newEmail, userId]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: "Email này đã được sử dụng bởi người dùng khác!" });
        }
        
        // Kiểm tra email mới có trùng với email hiện tại không
        const [currentUser] = await db.query('SELECT email FROM users WHERE id = ?', [userId]);
        if (currentUser.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng!" });
        }
        
        if (currentUser[0].email === newEmail) {
            return res.status(400).json({ success: false, message: "Email mới phải khác với email hiện tại!" });
        }
        
        // Tạo mã OTP 6 số
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Lưu OTP vào bộ nhớ tạm với key riêng cho email change
        // Key: emailChange_newEmail để tránh xung đột với OTP quên mật khẩu
        const otpKey = `emailChange_${newEmail}`;
        otpStore[otpKey] = {
            otp: otp,
            timestamp: Date.now(),
            userId: userId,
            newEmail: newEmail
        };

        // ============================================================
        // PRODUCTION MODE: Gửi email thật
        // ============================================================
        const mailOptions = {
            from: `"AI Weather Support" <${EMAIL_USER}>`,
            to: newEmail,
            subject: "Mã xác thực thay đổi email - AI Weather",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>Xác thực thay đổi email AI Weather</h2>
                    <p>Chào bạn, mã OTP để thay đổi email của bạn là:</p>
                    <h1 style="color: #a855f7; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>Mã này có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
                </div>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({ success: true, message: "Mã OTP đã được gửi đến email mới của bạn!" });
        } catch (emailError) {
            res.status(500).json({ success: false, message: "Không thể gửi email. Vui lòng thử lại sau!" });
        }
        
    } catch (error) {
        console.error("Request Email Change Error:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

// ============================================================
// 14. API XÁC NHẬN THAY ĐỔI EMAIL - VERIFY OTP
// ============================================================
exports.verifyEmailChange = async (req, res) => {
    try {
        const userId = req.user.id;
        const { newEmail, otp } = req.body;
        
        // Validate input
        if (!newEmail || !otp) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp đầy đủ thông tin!" });
        }
        
        // Kiểm tra OTP trong bộ nhớ tạm
        const otpKey = `emailChange_${newEmail}`;
        const storedData = otpStore[otpKey];
        
        if (!storedData) {
            return res.status(400).json({ success: false, message: "Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng gửi lại mã OTP!" });
        }
        
        // Kiểm tra userId khớp với OTP (prevent hijacking)
        if (storedData.userId !== userId) {
            return res.status(403).json({ success: false, message: "Phiên không hợp lệ!" });
        }
        
        // Kiểm tra OTP đã hết hạn chưa (5 phút)
        const now = Date.now();
        if (now - storedData.timestamp > OTP_EXPIRATION) {
            delete otpStore[otpKey];
            return res.status(400).json({ success: false, message: "Mã OTP đã hết hạn (quá 5 phút). Vui lòng gửi lại mã mới!" });
        }
        
        // Kiểm tra OTP khớp
        if (storedData.otp !== otp) {
            return res.status(400).json({ success: false, message: "Mã OTP không chính xác!" });
        }
        
        // OTP đúng - Tiến hành cập nhật email
        await db.query('UPDATE users SET email = ? WHERE id = ?', [newEmail, userId]);
        
        // Xóa OTP sau khi sử dụng thành công
        delete otpStore[otpKey];
        
        res.status(200).json({ 
            success: true, 
            message: "Thay đổi email thành công!" 
        });
        
    } catch (error) {
        console.error("Verify Email Change Error:", error);
        res.status(500).json({ success: false, message: "Lỗi Server!" });
    }
};

