// File: src/script/store/app_state.js
import * as drive from '../api/drive.js';
import * as localDB from './local_db.js';

const DATA_FILE = 'data.json';
const SETTINGS_FILE = 'settings.json';

export const state = {  
    types: [], 
    recurringTasks: [],       
    tasks: [],                
    logs: [],
    editingRecurringId: null, 
    editingTaskId: null,      
    displayDaysIdx: [], 
    lastLoggedDate: null,
    settings: null,
    lastModified: 0 
};

let isDataCorrupted = false;

export async function loadData() {
    const isLoggedIn = await drive.refreshGoogleToken();
    if (!isLoggedIn) console.warn("Running offline.");
    
    let parsed = await localDB.readLocalFile(DATA_FILE);
    if (!parsed) {
        console.warn("File is corrupted, loading Backup...");
        parsed = await localDB.readLocalFile('data_backup.json');
    }

    if (parsed) {
        state.types = parsed.types || [];
        state.recurringTasks = parsed.recurringTasks || [];
        state.tasks = parsed.tasks || [];
        state.logs = parsed.logs || [];
        state.lastLoggedDate = parsed.lastLoggedDate || null;
        state.lastModified = parsed.lastModified || 0; // Đọc thời gian
    } else {
        state.types = [
            { id: "t1", name: "Học tập", customCSS: "background: #e8f0fe; color: #1a73e8; border-left: 3px solid #1a73e8;" },
            { id: "t2", name: "Dạy TOEIC", customCSS: "background: #e6f4ea; color: #137333; border-left: 3px solid #137333;" }
        ];
        state.lastModified = Date.now();
        await saveData();
    }

    const settingsData = await localDB.readLocalFile(SETTINGS_FILE);
    if (settingsData) state.settings = settingsData;
    else {
        state.settings = { opacity: 0.4, resolution: "1024 x 720" };
        await saveSettings();
    }
    
    await smartSync();
    setInterval(smartSync, 60000); // Tự động sync nền mỗi 60s
}

export async function saveData() {
    if (isDataCorrupted) return;
    
    const dataToSave = { 
        types: state.types, 
        recurringTasks: state.recurringTasks, 
        tasks: state.tasks, 
        logs: state.logs, 
        lastLoggedDate: state.lastLoggedDate,
        lastModified: state.lastModified // Lưu lại dấu thời gian
    };
    
    await localDB.writeLocalFile('data_backup.json', dataToSave);
    await localDB.writeLocalFile(DATA_FILE, dataToSave);
}

export async function saveSettings() {
    await localDB.writeLocalFile(SETTINGS_FILE, state.settings);
}

// 🔴 LUỒNG ĐỒNG BỘ MỚI: Bằng chứng của sự thanh lịch
export async function smartSync() {
    if (!navigator.onLine || !drive.isGoogleLoggedIn()) {
        window.dispatchEvent(new CustomEvent('sync_status', { detail: 'offline' }));
        return;
    }

    try {
        window.dispatchEvent(new CustomEvent('sync_status', { detail: 'syncing' }));
        await drive.ensureDriveFiles();
        
        const cloudManifest = await drive.pullManifest();
        const cloudTime = cloudManifest ? cloudManifest.lastModified : 0;

        // 2. SO SÁNH THỜI GIAN
        if (cloudTime > state.lastModified) {
            // Trường hợp A: Mây mới hơn (Bắt kịp quá khứ)
            const cloudData = await drive.pullData();
            if (cloudData) {
                state.types = cloudData.types || [];
                state.recurringTasks = cloudData.recurringTasks || [];
                state.tasks = cloudData.tasks || [];
                state.logs = cloudData.logs || [];
                state.lastLoggedDate = cloudData.lastLoggedDate || null;
                state.lastModified = cloudTime; 
                
                await saveData(); 
                
                // Phát loa thông báo cho UI vẽ lại toàn bộ
                window.dispatchEvent(new CustomEvent('sync_completed'));
                console.log("☁️ Kéo dữ liệu mới từ Cloud về máy thành công!");
            }
        } 
        else if (state.lastModified > cloudTime) {
            // Trường hợp B: Máy tính có Action mới hơn -> Đẩy lên
            const localData = { 
                types: state.types, recurringTasks: state.recurringTasks, 
                tasks: state.tasks, logs: state.logs, 
                lastLoggedDate: state.lastLoggedDate, lastModified: state.lastModified 
            };
            
            await drive.pushData(JSON.stringify(localData));
            await drive.pushManifest(JSON.stringify({ lastModified: state.lastModified }));
            
            console.log("Đã đẩy dữ liệu mới từ Máy lên Cloud!");
        } 
        window.dispatchEvent(new CustomEvent('sync_status', { detail: 'synced' }));
    } catch (error) {
        console.error("Smart Sync Error:", error);
        window.dispatchEvent(new CustomEvent('sync_status', { detail: 'offline' }));
    }
}