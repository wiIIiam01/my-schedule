// File: src/script/api/drive.js
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './config.js';

const CLIENT_ID = GOOGLE_CLIENT_ID;
const CLIENT_SECRET = GOOGLE_CLIENT_SECRET;

let GOOGLE_ACCESS_TOKEN = null;
let DATA_FILE_ID = localStorage.getItem('drive_data_id') || null;
let MANIFEST_FILE_ID = localStorage.getItem('drive_manifest_id') || null;

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
            console.log("Đã tải Token mới thành công.");
            return true;
        } else {
            console.warn("Refresh token hết hạn hoặc bị thu hồi.");
            return false;
        }
    } catch (error) {
        return false;
    }
}

// KHÁM PHÁ CẢ 2 FILE TRÊN DRIVE
export async function ensureDriveFiles() {
    if (!GOOGLE_ACCESS_TOKEN) return;
    if (DATA_FILE_ID && MANIFEST_FILE_ID) return;

    try {
        const query = encodeURIComponent("trashed = false and (name = 'MySchedule_Data.json' or name = 'MySchedule_Manifest.json')");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        const data = await response.json();
        
        if (data.files) {
            data.files.forEach(f => {
                if (f.name === 'MySchedule_Data.json') {
                    DATA_FILE_ID = f.id;
                    localStorage.setItem('drive_data_id', f.id);
                }
                if (f.name === 'MySchedule_Manifest.json') {
                    MANIFEST_FILE_ID = f.id;
                    localStorage.setItem('drive_manifest_id', f.id);
                }
            });
        }
    } catch (error) {
        console.error("Lỗi tìm file trên Drive:", error);
    }
}

// KÉO/ĐẨY MANIFEST (Trạm Gác)
export async function pullManifest() {
    if (!GOOGLE_ACCESS_TOKEN || !MANIFEST_FILE_ID) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${MANIFEST_FILE_ID}?alt=media&t=${Date.now()}`, {
            headers: { 
                'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        if (res.status === 404) {
            console.warn("Không tìm thấy Manifest trên Drive. Tiến hành reset ID...");
            MANIFEST_FILE_ID = null;
            localStorage.removeItem('drive_manifest_id');
            return null;
        }
        
        if (res.ok) return await res.json();
    } catch (error) { }
    return null;
}

export async function pushManifest(jsonString) {
    if (!GOOGLE_ACCESS_TOKEN) return;
    await uploadFileToDrive('MySchedule_Manifest.json', MANIFEST_FILE_ID, jsonString, (newId) => {
        MANIFEST_FILE_ID = newId;
        localStorage.setItem('drive_manifest_id', newId);
    });
}

// KÉO/ĐẨY DATA CHÍNH
export async function pullData() {
    if (!GOOGLE_ACCESS_TOKEN || !DATA_FILE_ID) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${DATA_FILE_ID}?alt=media`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        if (res.ok) return await res.json();
    } catch (error) { }
    return null;
}

export async function pushData(jsonString) {
    if (!GOOGLE_ACCESS_TOKEN) return;
    await uploadFileToDrive('MySchedule_Data.json', DATA_FILE_ID, jsonString, (newId) => {
        DATA_FILE_ID = newId;
        localStorage.setItem('drive_data_id', newId);
    });
}

// HÀM LÕI ĐẨY FILE
async function uploadFileToDrive(fileName, fileId, jsonContent, onNewIdGenerated) {
    const metadata = { name: fileName, mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (fileId) { 
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    }

    try {
        let response = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` },
            body: form
        });
        if (response.status === 404 && method === 'PATCH') {
            console.warn(`File ${fileName} bị xóa. Tự động tạo file mới...`);
            url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            method = 'POST';
            response = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` },
                body: form
            });
        }

        const result = await response.json();
        // Chỉ lưu ID mới nếu đó là hành động POST (tạo mới)
        if (result.id && method === 'POST') {
            onNewIdGenerated(result.id);
        }
    } catch (error) {
        console.error("Lỗi upload:", fileName, error);
    }
}