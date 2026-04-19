import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './config.js';

const CLIENT_ID = GOOGLE_CLIENT_ID;
const CLIENT_SECRET = GOOGLE_CLIENT_SECRET;

let GOOGLE_ACCESS_TOKEN = null;
let DRIVE_FILE_ID = localStorage.getItem('drive_file_id') || null;

export function isGoogleLoggedIn() {
    return GOOGLE_ACCESS_TOKEN !== null;
}

export async function loginGoogle() {
    try {
        const res1 = await fetch('https://oauth2.googleapis.com/device/code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${CLIENT_ID}&scope=https://www.googleapis.com/auth/drive.file`
        });
        const codeData = await res1.json();

        if (codeData.error) {
            alert(`Lỗi từ Google: ${codeData.error}`);
            return false;
        }

        const verifyUrl = codeData.verification_url || codeData.verification_uri;
        alert(`MÃ ĐĂNG NHẬP: ${codeData.user_code}\n\n1. Hãy mở trang: ${verifyUrl}\n2. Nhập mã trên để kết nối.\n\n(App sẽ đợi bạn xác nhận trong 2 phút)`);

        let isWaiting = true;
        let attempts = 0;
        const maxAttempts = 24; 

        while (isWaiting && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, codeData.interval * 1000 || 5000));
            attempts++;

            const res2 = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&device_code=${codeData.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
            });
            const tokenData = await res2.json();

            if (tokenData.access_token) {
                isWaiting = false;
                GOOGLE_ACCESS_TOKEN = tokenData.access_token;
                localStorage.setItem('google_refresh_token', tokenData.refresh_token);
                alert("Kết nối Google Drive thành công!");
                
                // LƯU Ý: Đã gỡ lệnh gọi smartSync() ở đây để tránh vòng lặp. 
                // Giao diện (script.js) sẽ tự gọi smartSync sau khi hàm này trả về true.
                return true; 
            } else if (tokenData.error && tokenData.error !== 'authorization_pending') {
                isWaiting = false;
                return false;
            }
        }
        
        if (attempts >= maxAttempts) alert("Đã hết thời gian chờ xác nhận.");
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function refreshGoogleToken() {
    const refreshToken = localStorage.getItem('google_refresh_token');
    if (!refreshToken) return false;

    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${refreshToken}&grant_type=refresh_token`
        });
        const data = await res.json();

        if (data.access_token) {
            GOOGLE_ACCESS_TOKEN = data.access_token;
            console.log("Đã tải Token mới thành công (Chạy ngầm)");
            return true;
        } else {
            console.warn("Refresh token hết hạn hoặc bị thu hồi.");
            return false;
        }
    } catch (error) {
        console.error("Lỗi khi refresh token:", error);
        return false;
    }
}

export async function ensureDriveFileId() {
    if (DRIVE_FILE_ID) return DRIVE_FILE_ID; // Đã có thì thôi
    if (!GOOGLE_ACCESS_TOKEN) return null;

    try {
        const query = encodeURIComponent("name = 'MySchedule_Sync_Data.json' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime%20desc&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
            DRIVE_FILE_ID = data.files[0].id;
            localStorage.setItem('drive_file_id', DRIVE_FILE_ID);
            console.log("Đã tìm thấy file đồng bộ cũ:", DRIVE_FILE_ID);
        }
    } catch (error) {
        console.error("Lỗi tìm file trên Drive:", error);
    }
    return DRIVE_FILE_ID;
}

export async function pullFromGoogleDrive() {
    if (!GOOGLE_ACCESS_TOKEN || !DRIVE_FILE_ID) return null;
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?alt=media`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error("Lỗi kéo dữ liệu:", error);
    }
    return null;
}

export async function pushToGoogleDrive(jsonString) {
    if (!GOOGLE_ACCESS_TOKEN) return;

    const metadata = { name: 'MySchedule_Sync_Data.json', mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonString], { type: 'application/json' }));

    try {
        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (DRIVE_FILE_ID) { 
            url = `https://www.googleapis.com/upload/drive/v3/files/${DRIVE_FILE_ID}?uploadType=multipart`;
            method = 'PATCH';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` },
            body: form
        });

        const result = await response.json();
        if (result.id && !DRIVE_FILE_ID) {
            DRIVE_FILE_ID = result.id; 
            localStorage.setItem('drive_file_id', result.id);
        }
    } catch (error) {
        console.error("Lỗi đẩy dữ liệu:", error);
    }
}