const { GoogleGenAI } = require("@google/genai");

// Thư viện mới cực kỳ thông minh, nó sẽ tự động tìm biến GEMINI_API_KEY trong file .env
const ai = new GoogleGenAI({});

async function handleChat(req, res) {
    try {
        const { userMessage, weatherContext } = req.body;

        if (!weatherContext) {
            return res.json({ success: true, reply: "Tôi không thấy dữ liệu thời tiết. Hãy tìm kiếm thành phố trước nhé!" });
        }

        // Bơm thêm luật ép format ngắn gọn
        const prompt = `LUẬT CỦA BẠN: 
        1. Tên bạn là "khiewcokk AI" - trợ lý thời tiết của ứng dụng AI Weather.
        2. CHỈ trả lời về thời tiết và tính năng app. Từ chối câu hỏi ngoài lề.
        3. TRẢ LỜI NGẮN GỌN, SÚC TÍCH. Bắt buộc dùng gạch đầu dòng (-) cho các ý. In đậm (**) các thông số quan trọng (Nhiệt độ, thời gian). KHÔNG viết thành một đoạn văn dài liên tục.

        DỮ LIỆU THỜI TIẾT ĐỂ BẠN PHÂN TÍCH: 
        ${JSON.stringify(weatherContext)}

        CÂU HỎI CỦA NGƯỜI DÙNG: 
        ${userMessage}`;

        // Gọi model 2.5-flash theo chuẩn mới nhất
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: prompt,
        });

        // SDK mới trả về kết quả qua thuộc tính .text (không phải hàm .text() như cũ)
        return res.json({ success: true, reply: response.text });

    } catch (error) {
        console.error("❌ Lỗi xử lý Gemini API (SDK Mới):", error);
        return res.status(500).json({ success: false, message: "Lỗi kết nối AI. Vui lòng thử lại sau!" });
    }
}

module.exports = { handleChat };

