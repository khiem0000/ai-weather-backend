# TODO_BACKEND: System Push Notification Handler

**Objective**: Upgrade `/api/notifications/system` POST to handle `sendPush=true` → webpush all subscriptions

## Files to Edit:
1. **routes/notificationRoutes.js** - Add POST handler  
2. **controllers/adminController.js** - Add `sendSystemAnnouncement` logic
3. **server.js** - Verify `web-push` import + VAPID keys

## Current Status:
```
routes/notificationRoutes.js: ✅ GET /system exists (popup polling)
adminController.js: ❌ No POST handler
push subscriptions: ✅ routes/pushRoutes.js handles subscribe
```

## Backend Plan:
```
POST /api/notifications/system {message, sendPush}:
1. UPDATE system_settings.announcement = message
2. IF sendPush && message:
   - Query: SELECT endpoint, keys.auth, keys.p256dh FROM push_subscriptions
   - For each sub: webpush.sendNotification() → {title:"🚨", body:message, type:"severe"}
3. Return {success:true, notification}
```

**Next**: Read notificationRoutes.js → add POST route → implement controller
