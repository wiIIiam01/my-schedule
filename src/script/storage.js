let GOOGLE_ACCESS_TOKEN = null; 
// Biến này sẽ chứa ID file data trên Drive để tải về/ghi đè
let DRIVE_FILE_ID = localStorage.getItem('drive_file_id') || null;
// 1. Lấy các hàm cần thiết từ đối tượng Global của Tauri
const { readTextFile, writeTextFile, exists, mkdir, BaseDirectory } = window.__TAURI__.fs;

const DATA_FILE = 'data.json';
const SETTINGS_FILE = 'settings.json';

// 2. Trạng thái dữ liệu (Dùng export để script.js có thể import nếu dùng type="module")
export const state = {
    types: [], tasks: [], upcomingTasks: [], logs:[],
    editingTaskId: null, editingUpId: null, displayDaysIdx: [], lastLoggedDate: null,
    settings: null
};
let isDataCorrupted = false;
async function safeReadFile(fileName) {
    try {
        const hasFile = await exists(fileName, { baseDir: BaseDirectory.AppData });
        if (!hasFile) return null;
        const data = await readTextFile(fileName, { baseDir: BaseDirectory.AppData });
        return JSON.parse(data);
    } catch (e) {
        console.error(`Lỗi parse file ${fileName}:`, e);
        return null;
    }
}
// 3. Hàm kiểm tra và tạo thư mục AppData
async function ensureAppDir() {
    // Chỉnh sửa: Sử dụng BaseDirectory.AppData từ đối tượng đã lấy ở trên
    const hasDir = await exists('', { baseDir: BaseDirectory.AppData });
    if (!hasDir) {
        await mkdir('', { baseDir: BaseDirectory.AppData });
    }
}

export async function loadData() {
    await ensureAppDir();
    const isLoggedIn = await refreshGoogleToken();
    if (!isLoggedIn) {
        console.warn("Chưa kết nối Google Drive. Ứng dụng đang chạy hoàn toàn Offline.");
    }
    let parsed = await safeReadFile(DATA_FILE);
    if (!parsed) {
        console.warn("File chính hỏng, đang thử nạp file Backup...");
        parsed = await safeReadFile('data_backup.json');
    }

    if (parsed) {
        state.types = parsed.types || [];
        state.tasks = parsed.tasks || [];
        state.upcomingTasks = parsed.upcomingTasks || [];
        state.logs = parsed.logs || [];
        state.lastLoggedDate = parsed.lastLoggedDate || null;
    } else {
        // CẢNH BÁO KIỂM TRA LẦN ĐẦU CHẠY HAY BỊ HỎNG THẬT
        const hasMainFile = await exists(DATA_FILE, { baseDir: BaseDirectory.AppData });
        if (hasMainFile) {
            // Có file nhưng không parse được -> Hỏng nặng
            alert("LỖI NGHIÊM TRỌNG: Dữ liệu của bạn bị hỏng và không thể khôi phục từ Backup. Ứng dụng sẽ chuyển sang chế độ Chỉ-Đọc để bảo vệ file gốc.");
            isDataCorrupted = true; 
            return; // Dừng lại, không khởi tạo mặc định để tránh ghi đè
        } else {
            // Lần đầu tải app trên máy mới
            state.types = [
                { id: "t1", name: "Học tập", customCSS: "background: #e8f0fe; color: #1a73e8; border-left: 3px solid #1a73e8;" },
                { id: "t2", name: "Dạy TOEIC", customCSS: "background: #e6f4ea; color: #137333; border-left: 3px solid #137333;" }
            ];
            await saveData();
        }
    }
    // Tải cấu hình (Settings)
    const hasSettings = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    if (hasSettings) {
        try {
            const settingsData = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
            state.settings = JSON.parse(settingsData);
        } catch (error) { console.error("Lỗi đọc settings.json:", error); }
    } else {
        state.settings = { opacity: 0.7, resolution: "1050 x 800" };
        await saveSettings();
    }
    await smartSync();
    setInterval(smartSync, 300000);
}

export async function saveData() {
    if (isDataCorrupted) {
        console.warn("Chế độ bảo vệ: Bị chặn lưu dữ liệu vì file gốc đang lỗi.");
        return;
    }
    try {
        const dataToSave = JSON.stringify({ 
            types: state.types, tasks: state.tasks, upcomingTasks: state.upcomingTasks, 
            logs: state.logs, lastLoggedDate: state.lastLoggedDate 
        }, null, 2);
        
        await writeTextFile('data_backup.json', dataToSave, { baseDir: BaseDirectory.AppData });
        await writeTextFile(DATA_FILE, dataToSave, { baseDir: BaseDirectory.AppData });
                
    } catch (error) { console.error("Lỗi ghi data.json:", error); }
}

export async function saveSettings() {
    try {
        const dataToSave = JSON.stringify(state.settings, null, 2);
        await writeTextFile(SETTINGS_FILE, dataToSave, { baseDir: BaseDirectory.AppData });
    } catch (error) { console.error("Lỗi ghi settings.json:", error); }
}

function mergeArrays(localArr = [], cloudArr = []) {
    const map = new Map();
    
    // Đưa mảng mây (Cloud) vào Map
    cloudArr.forEach(item => {
        map.set(item.id || item.logId, item);
    });

    // Duyệt mảng máy (Local) để gộp và so sánh
    localArr.forEach(item => {
        const id = item.id || item.logId;
        const existing = map.get(id);
        
        if (existing) {
            // Nếu trùng ID -> So sánh tem thời gian
            const localTime = item.updatedAt || 0;
            const cloudTime = existing.updatedAt || 0;
            
            // Nếu ở máy tính sửa sau cùng -> Ghi đè cái trên mạng
            if (localTime >= cloudTime) {
                map.set(id, item);
            }
        } else {
            // Không trùng -> Task mới hoàn toàn -> Thêm vào Map
            map.set(id, item);
        }
    });

    return Array.from(map.values());
}

export async function smartSync() {
    // 1. Kiểm tra mạng
    if (!navigator.onLine) {
        console.warn("Đang Offline. Bỏ qua đồng bộ Drive.");
        return;
    }

    console.log("Bắt đầu tiến trình Smart Sync...");

    try {
        if (!DRIVE_FILE_ID) {
            DRIVE_FILE_ID = await findSyncFileOnDrive();
            if (DRIVE_FILE_ID) {
                localStorage.setItem('drive_file_id', DRIVE_FILE_ID);
            }
        }
        // 2. Kéo dữ liệu từ Google Drive về (Pull)
        const cloudData = await pullFromGoogleDrive();
        
        if (cloudData) {
            // 3. Tiến hành trộn (Merge) 3 mảng quan trọng nhất
            state.tasks = mergeArrays(state.tasks, cloudData.tasks);
            state.upcomingTasks = mergeArrays(state.upcomingTasks, cloudData.upcomingTasks);
            state.logs = mergeArrays(state.logs, cloudData.logs);
            
            // Xử lý lastLoggedDate (lấy ngày xa nhất)
            if (cloudData.lastLoggedDate && state.lastLoggedDate) {
                if (new Date(cloudData.lastLoggedDate) > new Date(state.lastLoggedDate)) {
                    state.lastLoggedDate = cloudData.lastLoggedDate;
                }
            } else if (cloudData.lastLoggedDate) {
                state.lastLoggedDate = cloudData.lastLoggedDate;
            }
            
            console.log("Hợp nhất dữ liệu thành công!");
        }

        // 4. Lưu dữ liệu đã hợp nhất vào Ổ cứng máy tính (Local)
        const localDataString = JSON.stringify(state, null, 2);
        await writeTextFile('data.json', localDataString, { baseDir: window.__TAURI__.fs.BaseDirectory.AppData });
        await writeTextFile('data_backup.json', localDataString, { baseDir: window.__TAURI__.fs.BaseDirectory.AppData });

        // 5. Lọc bỏ UI Settings, tạo cục dữ liệu sạch để đẩy lên mây
        const cloudState = {
            tasks: state.tasks,
            upcomingTasks: state.upcomingTasks,
            logs: state.logs,
            lastLoggedDate: state.lastLoggedDate
            // Không mang settings hay giao diện lên đây
        };

        // 6. Đẩy cục dữ liệu hoàn hảo ngược lên Drive (Push)
        await pushToGoogleDrive(JSON.stringify(cloudState));

        // 7. (Tùy chọn) Báo cho giao diện (ui.js) render lại màn hình
        // renderBody(); renderUpcoming();

    } catch (error) {
        console.error("Lỗi trong quá trình Smart Sync:", error);
    }
}
// ==========================================
// 2. HÀM LẤY TOKEN MỚI (CHẠY NGẦM)
// ==========================================
export async function refreshGoogleToken() {
    const refreshToken = localStorage.getItem('google_refresh_token');
    if (!refreshToken) return false; // Chưa từng đăng nhập

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
// ==========================================
// HÀM GIAO TIẾP GOOGLE DRIVE API
// ==========================================
async function pullFromGoogleDrive() {
    if (!GOOGLE_ACCESS_TOKEN || !DRIVE_FILE_ID) return null;
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?alt=media`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error("Lỗi kéo dữ liệu từ Drive:", error);
    }
    return null;
}

async function pushToGoogleDrive(jsonString) {
    if (!GOOGLE_ACCESS_TOKEN) return;

    const metadata = { name: 'MySchedule_Sync_Data.json', mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonString], { type: 'application/json' }));

    try {
        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST'; // Tạo file mới

        if (DRIVE_FILE_ID) { // Nếu đã có file, ghi đè
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
            localStorage.setItem('drive_file_id', result.id); // Lưu lại ID file cho các lần sau
        }
    } catch (error) {
        console.error("Lỗi đẩy dữ liệu lên Drive:", error);
    }
}
// Thêm hàm này để bên script.js kiểm tra trạng thái
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
            alert(`Lỗi: ${codeData.error}`);
            return false;
        }

        const verifyUrl = codeData.verification_url || codeData.verification_uri;
        alert(`MÃ ĐĂNG NHẬP: ${codeData.user_code}\n\n1. Hãy mở: ${verifyUrl}\n2. Nhập mã trên.\n\n(App sẽ đợi bạn trong 2 phút)`);

        let isWaiting = true;
        let attempts = 0;
        const maxAttempts = 24; // 24 lần x 5 giây = 120 giây (2 phút)

        while (isWaiting && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, codeData.interval * 1000));
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
                alert("Đồng bộ thành công!");
                await smartSync();
                return true;
            } else if (tokenData.error && tokenData.error !== 'authorization_pending') {
                isWaiting = false;
                return false;
            }
        }
        
        if (attempts >= maxAttempts) alert("Đã hết thời gian chờ đăng nhập.");
        return false;
    } catch (e) { return false; }
}
async function findSyncFileOnDrive() {
    if (!GOOGLE_ACCESS_TOKEN) return null;
    try {
        // Tìm kiếm file theo tên và đảm bảo file đó không nằm trong thùng rác
        const query = encodeURIComponent("name = 'MySchedule_Sync_Data.json' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
            // Lấy ID của file đầu tiên tìm thấy
            const foundId = data.files[0].id;
            console.log("Đã tìm thấy file đồng bộ cũ trên Drive:", foundId);
            return foundId;
        }
    } catch (error) {
        console.error("Lỗi tìm kiếm file trên Drive:", error);
    }
    return null;
}