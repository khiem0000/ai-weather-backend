/**
 * pushCronJobs.js
 * Cron Jobs cho Web Push Notifications
 * 
 * Cron 1: 7:00 AM hàng ngày - Gửi thông báo thời tiết
 * Cron 2: 20:00 PM hàng ngày - Nhắc nhở lịch trình
 */

require('dotenv').config();
const cron = require('node-cron');
const db = require('../config/db');
const pushController = require('../controllers/pushController');

// Cấu hình Weather API
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'd96db3ca494c4a359b8135749260103';
const WEATHER_API_URL = 'https://api.weatherapi.com/v1';

// ============================================================
// HELPER: LẤY THÔNG TIN THỜI TIẾT TỪ API
// ============================================================

/**
 * Lấy dữ liệu thời tiết từ WeatherAPI
 * @param {string} city - Tên thành phố
 * @returns {Object|null} - Dữ liệu thời tiết hoặc null nếu lỗi
 */
async function fetchWeatherData(city) {
    try {
        const response = await fetch(
            `${WEATHER_API_URL}/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&days=1&aqi=no&lang=vi`
        );
        
        if (!response.ok) {
            console.error(`❌ Lỗi API thời tiết: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Lỗi fetchWeatherData:', error.message);
        return null;
    }
}

// ============================================================
// CRON 1: THÔNG BÁO THỜI TIẾT HÀNG NGÀY (7:00 AM)
// ============================================================

/**
 * Gửi thông báo thời tiết hàng ngày cho các user có bật notifyDaily
 * Chạy vào lúc 7:00 AM mỗi ngày
 */
async function sendDailyWeatherNotification() {
    console.log('\n' + '='.repeat(50));
    console.log('🌅 Bắt đầu Cron Job: Thông báo thời tiết hàng ngày (7:00 AM)');
    console.log('='.repeat(50));
    
    try {
        // Lấy tất cả user có bật notifyDaily = true
        const [users] = await db.query(`
            SELECT u.id, u.email, u.full_name, s.city, s.language
            FROM users u
            INNER JOIN settings s ON u.id = s.user_id
            WHERE s.notify_daily = 1
        `);
        
        console.log(`📋 Tìm thấy ${users.length} user có bật thông báo thời tiết`);
        
        let successCount = 0;
        let failedCount = 0;
        
        for (const user of users) {
            try {
                // Lấy thông tin thời tiết của user
                const city = user.city || 'Can Tho';
                const weatherData = await fetchWeatherData(city);
                
                if (!weatherData) {
                    console.log(`⚠️ Không lấy được thời tiết cho user ${user.id} (${city})`);
                    failedCount++;
                    continue;
                }
                
                // Biên dịch thông điệp thời tiết
                const current = weatherData.current;
                const location = weatherData.location;
                const lang = user.language || 'vi';
                
                let title, body;
                
                if (lang === 'vi') {
                    title = `🌤️ Thời tiết ${location.name}`;
                    body = `${current.condition.text}, ${Math.round(current.temp_c)}°C\n`;
                    body += `💧 Độ ẩm: ${current.humidity}% | 💨 Gió: ${current.wind_kph} km/h\n`;
                    
                    // Thêm cảnh báo mưa nếu có
                    if (current.precip_mm > 0) {
                        body += `\n🌧️ Có mưa: ${current.precip_mm}mm`;
                    }
                    if (current.uv >= 8) {
                        body += `\n⚠️ UV rất cao: ${current.uv}`;
                    }
                } else {
                    title = `🌤️ Weather in ${location.name}`;
                    body = `${current.condition.text}, ${Math.round(current.temp_c)}°C\n`;
                    body += `💧 Humidity: ${current.humidity}% | 💨 Wind: ${current.wind_kph} km/h\n`;
                    
                    if (current.precip_mm > 0) {
                        body += `\n🌧️ Rain: ${current.precip_mm}mm`;
                    }
                    if (current.uv >= 8) {
                        body += `\n⚠️ Very High UV: ${current.uv}`;
                    }
                }
                
                // Tạo payload cho notification
                const payload = {
                    title: title,
                    body: body,
                    icon: 'https://cdn.weatherapi.com/weather/64x64/day/116.png',
                    badge: 'https://cdn.weatherapi.com/weather/64x64/day/116.png',
                    image: weatherData.forecast?.forecastday?.[0]?.day?.condition?.icon 
                        ? `https:${weatherData.forecast.forecastday[0].day.condition.icon}` 
                        : null,
                    tag: 'daily-weather',
                    data: {
                        type: 'daily-weather',
                        city: city,
                        temp: Math.round(current.temp_c),
                        condition: current.condition.text
                    }
                };
                
                // Gửi notification
                const result = await pushController.sendPushToUser(user.id, payload);
                
                if (result.success > 0) {
                    console.log(`✅ Đã gửi thời tiết cho user ${user.id} (${user.full_name})`);
                    successCount++;
                } else {
                    console.log(`⚠️ Không gửi được cho user ${user.id}`);
                    failedCount++;
                }
                
            } catch (userError) {
                console.error(`❌ Lỗi xử lý user ${user.id}:`, userError.message);
                failedCount++;
            }
        }
        
        console.log(`\n📊 Kết quả Cron Weather: ${successCount} thành công, ${failedCount} thất bại`);
        
    } catch (error) {
        console.error('❌ Lỗi Cron Job Weather:', error);
    }
}

// ============================================================
// CRON 2: NHẮC NHỞ LỊCH TRÌNH (20:00 PM)
// ============================================================

/**
 * Gửi thông báo nhắc nhở lịch trình cho các user có bật notifyPlanner
 * Chạy vào lúc 20:00 PM mỗi ngày
 */
async function sendPlannerReminder() {
    console.log('\n' + '='.repeat(50));
    console.log('📅 Bắt đầu Cron Job: Nhắc nhở lịch trình (20:00 PM)');
    console.log('='.repeat(50));
    
    try {
        // Tính ngày mai
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        console.log(`📅 Ngày mai: ${tomorrowStr}`);
        
        // Lấy tất cả user có bật notifyPlanner = true
        const [users] = await db.query(`
            SELECT u.id, u.email, u.full_name, s.language
            FROM users u
            INNER JOIN settings s ON u.id = s.user_id
            WHERE s.notify_planner = 1
        `);
        
        console.log(`📋 Tìm thấy ${users.length} user có bật nhắc nhở lịch trình`);
        
        let successCount = 0;
        let failedCount = 0;
        
        for (const user of users) {
            try {
                // Lấy các task của user vào ngày mai
                const [tasks] = await db.query(
                    'SELECT id, task_text, task_date FROM tasks WHERE user_id = ? AND task_date = ? AND is_completed = 0',
                    [user.id, tomorrowStr]
                );
                
                const lang = user.language || 'vi';
                
                if (tasks.length === 0) {
                    // Không có task nào cho ngày mai - gửi thông báo nhẹ nhàng
                    const payload = {
                        title: lang === 'vi' ? '📅 Lịch trình ngày mai' : '📅 Tomorrow\'s Schedule',
                        body: lang === 'vi' 
                            ? 'Bạn không có công việc nào cho ngày mai. Hãy tận hưởng ngày nghỉ!' 
                            : 'You have no tasks for tomorrow. Enjoy your day!',
                        icon: '/assets/icon-192.png',
                        badge: '/assets/badge-72.png',
                        tag: 'planner-reminder',
                        data: { type: 'planner-empty', date: tomorrowStr }
                    };
                    
                    await pushController.sendPushToUser(user.id, payload);
                    console.log(`📭 User ${user.id}: Không có task cho ngày mai`);
                    successCount++;
                    
                } else {
                    // Có task - liệt kê các task
                    const taskList = tasks.map(t => `• ${t.task_text}`).join('\n');
                    
                    let title, body;
                    
                    if (lang === 'vi') {
                        title = `📝 Bạn có ${tasks.length} công việc cho ngày mai`;
                        body = taskList;
                    } else {
                        title = `📝 You have ${tasks.length} task(s) for tomorrow`;
                        body = taskList;
                    }
                    
                    const payload = {
                        title: title,
                        body: body,
                        icon: '/assets/icon-192.png',
                        badge: '/assets/badge-72.png',
                        tag: 'planner-reminder',
                        data: {
                            type: 'planner-tasks',
                            date: tomorrowStr,
                            taskCount: tasks.length,
                            tasks: tasks.map(t => t.task_text)
                        }
                    };
                    
                    await pushController.sendPushToUser(user.id, payload);
                    console.log(`✅ User ${user.id}: ${tasks.length} task(s) cho ngày mai`);
                    successCount++;
                }
                
            } catch (userError) {
                console.error(`❌ Lỗi xử lý user ${user.id}:`, userError.message);
                failedCount++;
            }
        }
        
        console.log(`\n📊 Kết quả Cron Planner: ${successCount} thành công, ${failedCount} thất bại`);
        
    } catch (error) {
        console.error('❌ Lỗi Cron Job Planner:', error);
    }
}

// ============================================================
// KHỞI ĐỘNG CRON JOBS
// ============================================================

/**
 * Khởi động tất cả cron jobs
 * Cron 1: 7:00 AM mỗi ngày - Thời tiết
 * Cron 2: 20:00 PM mỗi ngày - Lịch trình
 */
function startCronJobs() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 Khởi động Web Push Cron Jobs...');
    console.log('='.repeat(50));
    
    // Cron 1: 7:00 AM mỗi ngày
    // Format: giây phút giờ ngày_tháng thứ
    cron.schedule('0 7 * * *', () => {
        console.log('\n⏰ Đến giờ gửi thông báo thời tiết (7:00 AM)');
        sendDailyWeatherNotification();
    }, {
        scheduled: true,
        timezone: 'Asia/Ho_Chi_Minh' // Múi giờ Việt Nam
    });
    
    // Cron 2: 20:00 PM mỗi ngày
    cron.schedule('0 20 * * *', () => {
        console.log('\n⏰ Đến giờ gửi nhắc nhở lịch trình (20:00 PM)');
        sendPlannerReminder();
    }, {
        scheduled: true,
        timezone: 'Asia/Ho_Chi_Minh' // Múi giờ Việt Nam
    });
    
    console.log('✅ Cron Jobs đã được khởi động!');
    console.log('📅 Cron 1: 7:00 AM - Thông báo thời tiết hàng ngày');
    console.log('📅 Cron 2: 20:00 PM - Nhắc nhở lịch trình');
    console.log('='.repeat(50) + '\n');
}

// Export các hàm để có thể test thủ công
module.exports = {
    startCronJobs,
    sendDailyWeatherNotification,
    sendPlannerReminder
};

