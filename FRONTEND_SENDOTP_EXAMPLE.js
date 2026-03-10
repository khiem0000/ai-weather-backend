/**
 * ============================================================
 * FRONTEND CODE EXAMPLE: GỬI OTP VỚI FETCH VÀ FINALLY
 * ============================================================
 * 
 * Đoạn code này demonstrate cách gọi API /api/auth/send-otp
 * với xử lý loading đúng cách sử dụng .finally()
 * 
 * Lưu ý: Đảm bảo bạn đã có các hàm showLoading() và hideLoading() 
 * trong file auth.js của frontend
 */

// ============================================================
// HÀM GỬI OTP (SEND OTP)
// ============================================================
async function sendOTP(email) {
    // Hiển thị loading spinner
    showLoading();
    
    try {
        const response = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Thành công
            console.log('Success:', data.message);
            alert(data.message);
            return { success: true, message: data.message };
        } else {
            // Lỗi từ server (400, 500, etc.)
            console.error('Error:', data.message);
            alert(data.message);
            return { success: false, message: data.message };
        }
        
    } catch (error) {
        // Lỗi network hoặc lỗi không xác định
        console.error('Network Error:', error);
        alert('Có lỗi xảy ra. Vui lòng thử lại sau!');
        return { success: false, message: 'Lỗi kết nối mạng' };
        
    } finally {
        // ✅ QUAN TRỌNG: Luôn ẩn loading bất kể thành công hay thất bại
        hideLoading();
    }
}

// ============================================================
// HÀM SHOW/HIDE LOADING (NẾU CHƯA CÓ TRONG auth.js)
// ============================================================
function showLoading() {
    // Tạo overlay loading nếu chưa có
    let loadingOverlay = document.getElementById('loadingOverlay');
    
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        loadingOverlay.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            ">
                <div style="
                    background: white;
                    padding: 20px 40px;
                    border-radius: 10px;
                    text-align: center;
                ">
                    <div style="
                        width: 40px;
                        height: 40px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #a855f7;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 10px;
                    "></div>
                    <p>Đang xử lý...</p>
                </div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(loadingOverlay);
    } else {
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// ============================================================
// CÁCH GỌI API KHÁC (SỬ DỤNG .then().catch().finally())
// ============================================================
function sendOTPWithThen(email) {
    // Hiển thị loading
    showLoading();
    
    return fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email })
    })
    .then(response => response.json())
    .then(data => {
        if (response.ok) {
            alert(data.message);
            return { success: true, message: data.message };
        } else {
            alert(data.message);
            return { success: false, message: data.message };
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Có lỗi xảy ra. Vui lòng thử lại sau!');
        return { success: false, message: 'Lỗi kết nối' };
    })
    .finally(() => {
        // ✅ LUÔN ẨN LOADING Ở ĐÂY
        hideLoading();
    });
}

// ============================================================
// VÍ DỤ SỬ DỤNG TRONG FORM QUÊN MẬT KHẨU
// ============================================================
/*
    <form id="forgotPasswordForm">
        <input type="email" id="email" placeholder="Nhập email của bạn" required>
        <button type="submit" id="sendOtpBtn">Gửi mã OTP</button>
    </form>

    <script>
        document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            
            // Gọi hàm sendOTP
            const result = await sendOTP(email);
            
            if (result.success) {
                // Chuyển sang bước nhập OTP
                // document.getElementById('otpStep').style.display = 'block';
            }
        });
    </script>
*/

// ============================================================
// END OF EXAMPLE
// ============================================================

