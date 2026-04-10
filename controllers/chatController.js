// File: controllers/chatController.js
const { GoogleGenAI } = require("@google/genai");
const db = require('../config/db');
const { logApiUsage } = require('../helpers/apiLogger');

const ai = new GoogleGenAI({});

// ============================================================
// 1. API KIỂM TRA TRẠNG THÁI BẢO TRÌ CHO FRONTEND (NÚT XÁM)
// ============================================================
async function getChatStatus(req, res) {
    try {
        const [settings] = await db.query('SELECT maintenance_mode FROM system_settings WHERE id = 1');
        const isMaintenance = settings.length > 0 && settings[0].maintenance_mode === 1;
        
        res.status(200).json({ success: true, maintenance_mode: isMaintenance });
    } catch (error) {
        console.error("Lỗi getChatStatus:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
}

// ============================================================
// 2. API XỬ LÝ CHAT TIN NHẮN (BẢO VỆ LỚP 2)
// ============================================================
async function handleChat(req, res) {
    try {
        // Kiểm tra bảo trì lần 2 (Đề phòng hacker bypass Frontend)
        const [settings] = await db.query('SELECT maintenance_mode FROM system_settings WHERE id = 1');
        if (settings.length > 0 && settings[0].maintenance_mode === 1) {
            return res.json({ success: false, message: "🚧 Hệ thống AI Chatbot hiện đang được bảo trì để nâng cấp. Vui lòng quay lại sau nhé!" });
        }

        const { userMessage, weatherContext } = req.body;
        if (!weatherContext) {
            return res.json({ success: true, reply: "Tôi không thấy dữ liệu thời tiết. Hãy tìm kiếm thành phố trước nhé!" });
        }

        const startTime = Date.now();

        const prompt = `LUẬT CỦA BẠN: 
        1. Tên bạn là "khiewcokk AI" - trợ lý thời tiết của ứng dụng AI Weather.
        2. CHỈ trả lời về thời tiết và tính năng app. Từ chối câu hỏi ngoài lề.
        3. TRẢ LỜI NGẮN GỌN, SÚC TÍCH. Bắt buộc dùng gạch đầu dòng (-) cho các ý. In đậm (**) các thông số quan trọng.

        DỮ LIỆU THỜI TIẾT: ${JSON.stringify(weatherContext)}
        CÂU HỎI CỦA NGƯỜI DÙNG: ${userMessage}`;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview", 
            contents: prompt,
        });

        const responseTime = Date.now() - startTime;
        await logApiUsage({ 
            userId: req.user?.id, 
            apiName: 'Gemini', 
            statusCode: 200, 
            responseTimeMs: responseTime, 
            location: weatherContext.name 
        });
        return res.json({ success: true, reply: response.text });

    } catch (error) {
        const responseTime = Date.now() - startTime;
        await logApiUsage({ 
            userId: req.user?.id, 
            apiName: 'Gemini', 
            statusCode: 500, 
            responseTimeMs: responseTime, 
            location: weatherContext?.name || 'Unknown', 
            errorMessage: error.message 
        });
        console.error("❌ Lỗi xử lý Gemini API:", error);
        return res.status(500).json({ success: false, message: "Lỗi kết nối AI. Vui lòng thử lại sau!" });
    }
}

// XUẤT CẢ 2 HÀM RA NGOÀI
module.exports = { handleChat, getChatStatus };

