/**
 * Script để tạo VAPID Keys cho Web Push Notifications
 * Chạy: node generate-vapid-keys.js
 * 
 * VAPID Keys dùng để xác thực giữa Server và Push Service
 * Public Key sẽ được dùng ở Frontend
 * Private Key giữ bí mật ở Server
 */

const webpush = require('web-push');

// Tạo VAPID Keys
const vapidKeys = webpush.generateVAPIDKeys();

console.log('='.repeat(50));
console.log('🎉 VAPID Keys đã được tạo thành công!');
console.log('='.repeat(50));
console.log('\n📋 Hướng dẫn sử dụng:');
console.log('1. Thêm các keys sau vào file .env của bạn:\n');

console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('VAPID_SUBJECT=mailto:your-email@example.com');

console.log('\n2. Copy Public Key vào Frontend (main.js)');
console.log('\n' + '='.repeat(50));
console.log('🔑 PUBLIC KEY (Dùng cho Frontend):');
console.log('='.repeat(50));
console.log(vapidKeys.publicKey);

console.log('\n' + '='.repeat(50));
console.log('🔐 PRIVATE KEY (Giữ bí mật, dùng cho Backend):');
console.log('='.repeat(50));
console.log(vapidKeys.privateKey);

console.log('\n✅ Hoàn tất! Chạy lại script này nếu cần tạo keys mới.');

