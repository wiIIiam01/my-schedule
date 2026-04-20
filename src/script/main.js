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
    initSettings();
    ui.applyDynamicCSS();
    ui.updateTypeSelects();
    ui.initCalendar();
    ui.renderUpcoming();
};