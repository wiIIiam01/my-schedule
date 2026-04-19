import * as drive from '../api/drive.js';
import * as localDB from './local_db.js';

const DATA_FILE = 'data.json';
const SETTINGS_FILE = 'settings.json';

export const state = {
    types: [], tasks: [], upcomingTasks: [], logs:[],
    editingTaskId: null, editingUpId: null, displayDaysIdx: [], lastLoggedDate: null,
    settings: null
};

let isDataCorrupted = false;

export async function loadData() {
    const isLoggedIn = await drive.refreshGoogleToken();
    if (!isLoggedIn) {
        console.warn("Running offline.");
    }
    
    let parsed = await localDB.readLocalFile(DATA_FILE);
    if (!parsed) {
        console.warn("File is corrupted, loading Backup...");
        parsed = await localDB.readLocalFile('data_backup.json');
    }

    if (parsed) {
        state.types = parsed.types || [];
        state.tasks = parsed.tasks || [];
        state.upcomingTasks = parsed.upcomingTasks || [];
        state.logs = parsed.logs || [];
        state.lastLoggedDate = parsed.lastLoggedDate || null;
    } else {
        // Lần đầu tải app
        state.types = [
            { id: "t1", name: "Học tập", customCSS: "background: #e8f0fe; color: #1a73e8; border-left: 3px solid #1a73e8;" },
            { id: "t2", name: "Dạy TOEIC", customCSS: "background: #e6f4ea; color: #137333; border-left: 3px solid #137333;" }
        ];
        await saveData();
    }

    // Nạp settings
    const settingsData = await localDB.readLocalFile(SETTINGS_FILE);
    if (settingsData) {
        state.settings = settingsData;
    } else {
        state.settings = { opacity: 0.4, resolution: "1024 x 720" };
        await saveSettings();
    }
    
    await smartSync();
    setInterval(smartSync, 60000);
}

export async function saveData() {
    if (isDataCorrupted) return;
    
    const dataToSave = { 
        types: state.types, tasks: state.tasks, upcomingTasks: state.upcomingTasks, 
        logs: state.logs, lastLoggedDate: state.lastLoggedDate 
    };
    
    await localDB.writeLocalFile('data_backup.json', dataToSave);
    await localDB.writeLocalFile(DATA_FILE, dataToSave);
}

export async function saveSettings() {
    await localDB.writeLocalFile(SETTINGS_FILE, state.settings);
}

function mergeArrays(localArr = [], cloudArr = []) {
    const map = new Map();
    cloudArr.forEach(item => map.set(item.id || item.logId, item));
    localArr.forEach(item => {
        const id = item.id || item.logId;
        const existing = map.get(id);
        if (existing) {
            const localTime = item.updatedAt || 0;
            const cloudTime = existing.updatedAt || 0;
            if (localTime >= cloudTime) map.set(id, item);
        } else {
            map.set(id, item);
        }
    });
    return Array.from(map.values());
}

export async function smartSync() {
    if (!navigator.onLine || !drive.isGoogleLoggedIn()) return;

    try {
        await drive.ensureDriveFileId();
        const cloudData = await drive.pullFromGoogleDrive();
        
        if (localStorage.getItem('drive_file_id') && !cloudData) {
            console.error("Error: Cannot pull data from Cloud. Sync canceled.");
            return; 
        }

        if (cloudData) {
            state.tasks = mergeArrays(state.tasks, cloudData.tasks);
            state.upcomingTasks = mergeArrays(state.upcomingTasks, cloudData.upcomingTasks);
            state.logs = mergeArrays(state.logs, cloudData.logs);
            if (cloudData.lastLoggedDate) {
                if (!state.lastLoggedDate || new Date(cloudData.lastLoggedDate) > new Date(state.lastLoggedDate)) {
                    state.lastLoggedDate = cloudData.lastLoggedDate;
                }
            }
        }

        await saveData(); // Gọi thẳng hàm saveData cho gọn

        const cloudState = { tasks: state.tasks, upcomingTasks: state.upcomingTasks, logs: state.logs, lastLoggedDate: state.lastLoggedDate };
        await drive.pushToGoogleDrive(JSON.stringify(cloudState));

    } catch (error) {
        console.error("Smart Sync Error:", error);
    }
}