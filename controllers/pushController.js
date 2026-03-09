/**
 * pushController.js
 * Xử lý các API liên quan đến Web Push Notifications
 * 
 * Các endpoint:
 * - POST /api/push/subscribe: Lưu subscription từ frontend
 * - DELETE /api/push/unsubscribe: Xóa subscription khỏi DB
 * - GET /api/push/vapidPublicKey: Lấy VAPID Public Key cho frontend
 */

require('dotenv').config();
const webpush = require('web-push');
const db = require('../config/db');

// ============================================================
// CẤU HÌNH WEB-PUSH VỚI VAPID KEYS
// ============================================================

// Lấy VAPID keys từ .env
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@aiweather.com';

// Kiểm tra nếu VAPID keys chưa được cấu hình
if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('⚠️ CẢNH BÁO: VAPID Keys chưa được cấu hình trong .env!');
    console.warn('⚠️ Hãy chạy: node generate-vapid-keys.js');
} else {
    // Cấu hình web-push với VAPID keys
    webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey
    );
    console.log('✅ Web-Push đã được cấu hình với VAPID Keys');
}

// ============================================================
// HELPER: GỬI PUSH NOTIFICATION VỚI XỬ LÝ LỖI
// ============================================================

/**
 * Gửi push notification đến một subscription
 * @param {Object} subscription - Đối tượng subscription từ PushManager
 * @param {Object} payload - Dữ liệu notification (title, body, icon, data...)
 * @returns {Promise<boolean>} - Trả về true nếu gửi thành công, false nếu thất bại
 */
async function sendPushNotification(subscription, payload) {
    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify(payload)
        );
        return true;
    } catch (error) {
        console.error('❌ Lỗi gửi Push Notification:', error.message);
        
        // XỬ LÝ LỖI ĐẶC BIỆT:
        // Nếu subscription đã hết hạn hoặc user đã gỡ quyền (410 Gone hoặc 404 Not Found)
        // Chúng ta cần xóa subscription khỏi Database
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('🗑️ Subscription đã hết hạn, đánh dấu để xóa khỏi DB');
            return 'expired';
        }
        
        return false;
    }
}

/**
 * Gửi notification cho nhiều subscriptions của cùng một user
 * @param {number} userId - ID của user
 * @param {Object} payload - Dữ liệu notification
 * @returns {Object} - Kết quả gửi notification
 */
async function sendPushToUser(userId, payload) {
    try {
        // Lấy tất cả subscriptions của user
        const [subscriptions] = await db.query(
            'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );
        
        if (subscriptions.length === 0) {
            console.log(`⚠️ User ${userId} không có subscription nào`);
            return { success: 0, failed: 0, expired: 0 };
        }
        
        let successCount = 0;
        let failedCount = 0;
        let expiredCount = 0;
        
        // Gửi notification cho từng subscription
        for (const sub of subscriptions) {
            const subscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            
            const result = await sendPushNotification(subscription, payload);
            
            if (result === true) {
                successCount++;
            } else if (result === 'expired') {
                expiredCount++;
                // Xóa subscription hết hạn khỏi DB
                await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                console.log(`🗑️ Đã xóa subscription hết hạn: ${sub.id}`);
            } else {
                failedCount++;
            }
        }
        
        console.log(`📊 Gửi notification cho user ${userId}: ${successCount} thành công, ${expiredCount} hết hạn, ${failedCount} thất bại`);
        
        return { success: successCount, failed: failedCount, expired: expiredCount };
        
    } catch (error) {
        console.error('❌ Lỗi khi gửi notification cho user:', error);
        return { success: 0, failed: 0, expired: 0, error: error.message };
    }
}

// ============================================================
// API 1: LẤY VAPID PUBLIC KEY
// ============================================================

/**
 * GET /api/push/vapidPublicKey
 * Trả về VAPID Public Key để frontend có thể đăng ký push
 */
exports.getVapidPublicKey = async (req, res) => {
    try {
        if (!vapidPublicKey) {
            return res.status(500).json({
                success: false,
                message: 'VAPID Keys chưa được cấu hình ở Server!'
            });
        }
        
        res.status(200).json({
            success: true,
            publicKey: vapidPublicKey
        });
    } catch (error) {
        console.error('Lỗi getVapidPublicKey:', error);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
};

// ============================================================
// API 2: ĐĂNG KÝ PUSH NOTIFICATION
// ============================================================

/**
 * POST /api/push/subscribe
 * Lưu subscription từ frontend vào Database
 * 
 * Request body:
 * {
 *   subscription: {
 *     endpoint: "https://fcm.googleapis.com/fcm/send/...",
 *     keys: {
 *       p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
 *       auth: "tBX4R8FkHiHl3dYvR6R6w"
 *     }
 *   }
 * }
 */
exports.subscribe = async (req, res) => {
    try {
        // Lấy user_id từ middleware (đã xác thực token)
        const userId = req.user.id;
        
        // Lấy subscription và loại thông báo từ request body
        const { subscription, notificationType = 'daily' } = req.body;
        
        // Validate dữ liệu
        if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu subscription không hợp lệ!'
            });
        }
        
        const { endpoint, keys } = subscription;
        // notificationType sẽ được dùng để gửi payload khác nhau
        const type = ['severe','daily','planner'].includes(notificationType) ? notificationType : 'daily';
        
        // Kiểm tra xem subscription đã tồn tại chưa
        const [existingSub] = await db.query(
            'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [userId, endpoint]
        );
        
        if (existingSub.length > 0) {
            // Cập nhật nếu đã tồn tại
            await db.query(
                'UPDATE push_subscriptions SET p256dh = ?, auth = ?, created_at = NOW() WHERE user_id = ? AND endpoint = ?',
                [keys.p256dh, keys.auth, userId, endpoint]
            );
            
            console.log(`✅ Đã cập nhật subscription cho user ${userId}`);
            
            return res.status(200).json({
                success: true,
                message: 'Cập nhật subscription thành công!'
            });
        }
        
        // Thêm mới subscription
        await db.query(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, NOW())',
            [userId, endpoint, keys.p256dh, keys.auth]
        );
        
        console.log(`✅ Đã thêm subscription mới cho user ${userId}`);
        console.log(`📍 Endpoint: ${endpoint}`);
        
        // Gửi notification xác nhận đăng ký thành công
        let bodyText = 'Bạn sẽ nhận được thông báo.';
        // Tùy nội dung theo loại thông báo
        if (type === 'daily') {
            bodyText = 'Bạn sẽ nhận được thông báo dự báo thời tiết hàng ngày.';
        } else if (type === 'planner') {
            bodyText = 'Bạn sẽ nhận được nhắc nhở lịch trình hàng ngày.';
        } else if (type === 'severe') {
            bodyText = 'Bạn sẽ nhận được cảnh báo thời tiết xấu khi có.';
        }
        const confirmPayload = {
            title: '🔔 Đăng ký thông báo thành công!',
            body: bodyText,
            icon: '/assets/icon-192.png',
            badge: '/assets/badge-72.png',
            tag: 'push-confirmation',
            data: { type: 'confirmation', notificationType: type }
        };
        
        await sendPushToUser(userId, confirmPayload);
        
        res.status(201).json({
            success: true,
            message: `Đăng ký Push Notification (${type}) thành công!`
        });
        
    } catch (error) {
        console.error('❌ Lỗi subscribe:', error);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
};

// ============================================================
// API 3: HỦY ĐĂNG KÝ PUSH NOTIFICATION
// ============================================================

/**
 * DELETE /api/push/unsubscribe
 * Xóa subscription khỏi Database
 * 
 * Request body:
 * {
 *   endpoint: "https://fcm.googleapis.com/fcm/send/..."
 * }
 */
exports.unsubscribe = async (req, res) => {
    try {
        // Lấy user_id từ middleware
        const userId = req.user.id;
        
        // Lấy endpoint từ request body
        const { endpoint } = req.body;
        
        if (!endpoint) {
            return res.status(400).json({
                success: false,
                message: 'Endpoint không hợp lệ!'
            });
        }
        
        // Xóa subscription
        const [result] = await db.query(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [userId, endpoint]
        );
        
        if (result.affectedRows > 0) {
            console.log(`✅ Đã xóa subscription cho user ${userId}`);
            
            return res.status(200).json({
                success: true,
                message: 'Hủy đăng ký Push Notification thành công!'
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Subscription không tồn tại!'
            });
        }
        
    } catch (error) {
        console.error('❌ Lỗi unsubscribe:', error);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
};

// ============================================================
// API 4: KIỂM TRA TRẠNG THÁI ĐĂNG KÝ
// ============================================================

/**
 * GET /api/push/status
 * Kiểm tra xem user đã đăng ký push chưa
 */
exports.getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [subscriptions] = await db.query(
            'SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );
        
        res.status(200).json({
            success: true,
            isSubscribed: subscriptions.length > 0,
            subscriptionCount: subscriptions.length,
            subscriptions: subscriptions.map(s => ({
                id: s.id,
                endpoint: s.endpoint,
                createdAt: s.created_at
            }))
        });
        
    } catch (error) {
        console.error('❌ Lỗi getSubscriptionStatus:', error);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
};

// ============================================================
// EXPORT HELPER FUNCTIONS CHO CRON JOBS
// ============================================================

module.exports.sendPushToUser = sendPushToUser;
module.exports.sendPushNotification = sendPushNotification;

