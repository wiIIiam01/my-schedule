const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
import { loadData, saveData, saveSettings, smartSync, state } from './store/app_state.js';
import { processAutoDiary } from './core/auto_diary.js';
import * as drive from './api/drive.js';
import * as ui from './ui/index.js';
import { initSettings, initEvents, updateSyncUI } from './event_handler.js';
const appWindow = getCurrentWindow();

document.getElementById('btnClose').onclick = () => appWindow.close();
document.getElementById('btnMinimize').onclick = () => appWindow.minimize();

window.onload = async () => {
    initEvents(); 
    await loadData();
    const diaryResult = processAutoDiary(state.recurringTasks, state.logs, state.lastLoggedDate);
    if (diaryResult.hasChanges) {
        state.logs = diaryResult.newLogs;
        state.lastLoggedDate = diaryResult.newLastLoggedDate;
        state.lastModified = Date.now();
        await saveData();
        smartSync();
        console.log("Diary updated on load!");
    }
    initSettings();
    ui.applyDynamicCSS();
    ui.initCalendar();
    ui.renderUpcoming();
};