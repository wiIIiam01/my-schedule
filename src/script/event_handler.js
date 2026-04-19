import { dispatch, ACTIONS } from './store/ledger.js';
const { LogicalSize, getCurrentWindow } = window.__TAURI__.window;

import { state, saveData, saveSettings, smartSync } from './store/app_state.js';
import * as drive from './api/drive.js';
import { processAutoDiary } from './core/auto_diary.js';
import { APP_CONFIG, parseResolution } from './core/utils.js';
import * as ui from './ui/index.js';

const appWindow = getCurrentWindow();

let targetActionType = '';

// A. HÀM KHỞI TẠO SETTINGS
function initSettings() {
    if (!state.settings) {
        state.settings = { opacity: 0.4, resolution: "1024 x 720" };
    }

    const slider = document.getElementById('opacitySlider');
    const resInput = document.getElementById('resInput');
    const menu = document.getElementById('settingsMenu');

    document.documentElement.style.setProperty('--bg-opacity', state.settings.opacity);
    slider.value = state.settings.opacity;
    resInput.value = state.settings.resolution;

    const size = parseResolution(state.settings.resolution);
    if (size) {
        appWindow.setSize(new LogicalSize(size.w, size.h)).then(() => {
            appWindow.center(); 
        });
    }

    document.getElementById('btnSettings').onclick = () => menu.classList.toggle('active');

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.left-actions')) {
            menu.classList.remove('active');
        }
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    slider.oninput = (e) => {
        document.documentElement.style.setProperty('--bg-opacity', e.target.value);
    };
    
    slider.onchange = (e) => {
        state.settings.opacity = e.target.value;
        saveSettings(); 
    };

    document.getElementById('btnApplySettings').onclick = () => {
        const resText = resInput.value.trim();
        const size = parseResolution(resText);
        
        if (size) {
            // Chỉ cập nhật state và lưu xuống ổ cứng nếu format chuẩn
            state.settings.resolution = resText;
            saveSettings(); 
            
            appWindow.setSize(new LogicalSize(size.w, size.h)).then(() => {
                appWindow.center();
            });
        } else {
            alert("Wrong format: Width x Height (VD: 1024 x 720)");
        }
        
        menu.classList.remove('active');
    };
}

// B. HÀM KHỞI TẠO SỰ KIỆN CLICK (EVENTS)
function initEvents() {
    window.addEventListener('sync_completed', () => {
        ui.updateTypeSelects();
        ui.applyDynamicCSS();
        ui.initCalendar();
        ui.renderUpcoming();
    });
    window.addEventListener('sync_status', (e) => {
        updateSyncUI(e.detail);
    });
    // Cập nhật danh sách loại Task vào thẻ select
    ui.updateTypeSelects();

    // --- 1. GOOGLE DRIVE SYNC BTN ---
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    
    if (btnGoogleLogin) {
        btnGoogleLogin.onclick = async () => {
            if (!drive.isGoogleLoggedIn()) {
                updateSyncUI('syncing');
                const isSuccess = await drive.loginGoogle();
                if (isSuccess) {
                    smartSync(); 
                } else {
                    updateSyncUI('offline'); 
                }
            }
        };
    }

    // --- 2. SELECTOR CHỌN NGÀY TRONG TUẦN ---
    const daySelector = document.getElementById('daySelector');
    // Đã thay thế bằng biến từ utils.js
    APP_CONFIG.DAYS_MAP.forEach((day, idx) => {
        const circle = document.createElement('div');
        circle.className = 'day-circle'; 
        circle.innerText = day[0]; // Lấy chữ cái đầu (S, M, T...)
        circle.dataset.dayIdx = idx;
        circle.onclick = () => { 
            circle.classList.toggle('selected'); 
            ui.checkForm(); 
        };
        daySelector.appendChild(circle);
    });

    // --- 3. MODAL LOGS (NHẬT KÝ) ---
    document.getElementById('btnLog').onclick = async () => {
        const diaryResult = processAutoDiary(state.recurringTasks, state.logs, state.lastLoggedDate);
        
        if (diaryResult.hasChanges) {
            state.logs = diaryResult.newLogs;
            state.lastLoggedDate = diaryResult.newLastLoggedDate;
            state.lastModified = Date.now();
            await saveData();
            smartSync(); // Gọi sync luôn
            console.log("Diary updated!");
        }

        ui.openLogModal();
    };
    document.getElementById('btnCancelLog').onclick = () => ui.hideModal('logModal');

    // --- 4. MODAL WEEKLY TASK ---
    document.getElementById('btnAdd').onclick = () => ui.openRecurringModal(null);
    document.getElementById('btnCancelTask').onclick = () => ui.hideModal('taskModal');
    document.getElementById('btnSaveTask').onclick = saveRecurringTask;
    
    document.getElementById('btnEraseTask').onclick = () => {
        targetActionType = 'recurring';
        document.getElementById('chkDeleteInDiary').checked = false;
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishTask').onclick = () => {
        targetActionType = 'recurring';
        ui.showModal('confirmFinishModal');
    };

    // --- 5. MODAL UPCOMING TASK ---
    document.getElementById('btnCancelUp').onclick = () => ui.hideModal('upcomingModal');
    document.getElementById('btnSaveUp').onclick = saveTask;
    
    document.getElementById('btnEraseUp').onclick = () => {
        targetActionType = 'task';
        document.getElementById('chkDeleteInDiary').checked = false;
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishUp').onclick = () => {
        targetActionType = 'task';
        ui.showModal('confirmFinishModal');
    };

    // --- 6. POPUP CONFIRM ERASE ---
    document.getElementById('btnCancelEraseConfirm').onclick = () => ui.hideModal('confirmEraseModal');
    document.getElementById('btnDoErase').onclick = async () => {
        const wipeDiary = document.getElementById('chkDeleteInDiary').checked;
        
        if (targetActionType === 'recurring') { 
            await dispatch(ACTIONS.DELETE_RECURRING, { id: state.editingRecurringId, wipeDiary });
            ui.hideModal('taskModal');
            ui.initCalendar(); 
        } else {
            await dispatch(ACTIONS.DELETE_TASK, { id: state.editingTaskId, wipeDiary });
            ui.hideModal('upcomingModal');
            ui.renderUpcoming(); 
        }
        ui.hideModal('confirmEraseModal');
    };

    // --- 7. POPUP CONFIRM FINISH ---
    document.getElementById('btnCancelFinishConfirm').onclick = () => ui.hideModal('confirmFinishModal');
    document.getElementById('btnDoFinish').onclick = async () => {
        if (targetActionType === 'recurring') {
            // Lịch thì hoàn thành tương đương xóa (ko wipe)
            await dispatch(ACTIONS.DELETE_RECURRING, { id: state.editingRecurringId, wipeDiary: false });
            ui.hideModal('taskModal');
            ui.initCalendar();
        } else {
            const theTask = state.tasks.find(t => t.id === state.editingTaskId);
            if (theTask) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                
                const logEntry = {
                    logId: crypto.randomUUID(), 
                    date: now.toISOString().split('T')[0],
                    taskId: theTask.id,
                    title: theTask.title,
                    start: timeStr, end: timeStr,
                    typeId: theTask.typeId
                };
                
                await dispatch(ACTIONS.FINISH_TASK, { taskId: theTask.id, newLog: logEntry });
            }
            ui.hideModal('upcomingModal');
            ui.renderUpcoming();
        }
        ui.hideModal('confirmFinishModal');
    };

    // --- 8. TYPE MANAGER ---
    document.getElementById('btnEditType').onclick = ui.openTypeEditor;
    document.getElementById('btnCancelType').onclick = () => ui.hideModal('typeModal');

    // SỬA TYPE
    document.getElementById('btnSaveType').onclick = async () => {
        const typeId = document.getElementById('typeEditSelect').value;
        const customCSS = document.getElementById('typeCssInput').value;
        
        await dispatch(ACTIONS.UPDATE_TYPE, { id: typeId, customCSS: customCSS });
        
        ui.applyDynamicCSS(); 
        ui.renderBody(); 
        ui.renderUpcoming();
        ui.hideModal('typeModal');
    };

    // THÊM TYPE
    document.getElementById('btnAddType').onclick = async () => {
        const name = document.getElementById('newTypeName').value.trim();
        if(!name) return;
        
        const newType = { 
            id: 't_' + crypto.randomUUID(), 
            name: name, 
            customCSS: "background: #eee; color: #333;" 
        };
        
        await dispatch(ACTIONS.ADD_TYPE, newType);
        
        ui.updateTypeSelects(); 
        ui.applyDynamicCSS();
        
        // Reset form nhanh
        document.getElementById('newTypeName').value = '';
        document.getElementById('typeEditSelect').value = newType.id;
        document.getElementById('typeCssInput').value = newType.customCSS;
    };

    // XÓA TYPE
    document.getElementById('btnDeleteType').onclick = async () => {
        if(!state.types || state.types.length <= 1) { 
            alert("Phải có ít nhất 1 Type!"); 
            return; 
        } 
        
        const idToDelete = document.getElementById('typeEditSelect').value;
        
        // Tìm ID thay thế (Type đầu tiên còn lại khác với Type sắp bị xóa)
        const fallbackType = state.types.find(t => t.id !== idToDelete);
        const fallbackId = fallbackType ? fallbackType.id : state.types[0].id;

        await dispatch(ACTIONS.DELETE_TYPE, { 
            typeId: idToDelete, 
            fallbackId: fallbackId 
        });

        ui.updateTypeSelects(); 
        ui.applyDynamicCSS(); 
        ui.renderBody(); 
        ui.renderUpcoming();
        
        // Kích hoạt event đổi select để textarea tự cập nhật CSS của type thay thế
        document.getElementById('typeEditSelect').dispatchEvent(new Event('change'));
    };

    document.getElementById('typeEditSelect').onchange = (e) => {
        const t = state.types.find(x => x.id === e.target.value);
        document.getElementById('typeCssInput').value = t ? (t.customCSS || '') : '';
    };

    // --- SCROLL & VALIDATION ---
    document.getElementById('btnScrollRight').onclick = () => document.getElementById('upcomingList').scrollBy({ left: 200, behavior: 'smooth' });
    
    document.querySelectorAll('.form-control').forEach(el => el.addEventListener('input', ui.checkForm));
}

// C. HÀM LƯU DỮ LIỆU TỪ FORM
async function saveRecurringTask() {
    if(!document.getElementById('btnSaveTask').classList.contains('active')) return;
    const newTask = {
        id: state.editingRecurringId || crypto.randomUUID(),
        title: document.getElementById('taskTitle').value,
        typeId: document.getElementById('taskType').value,
        days: Array.from(document.querySelectorAll('.day-circle.selected')).map(c => parseInt(c.dataset.dayIdx)),
        start: document.getElementById('taskStart').value,
        end: document.getElementById('taskEnd').value,
        location: document.getElementById('taskLocation').value,
        note: document.getElementById('taskNote').value,
        updatedAt: Date.now()
    };

    if (state.editingRecurringId) {
        await dispatch(ACTIONS.UPDATE_RECURRING, newTask);
    } else {
        await dispatch(ACTIONS.ADD_RECURRING, newTask);
    }
    ui.initCalendar(); 
    ui.hideModal('taskModal');
}

async function saveTask() {
    const newTask = {
        id: state.editingTaskId || crypto.randomUUID(),
        title: document.getElementById('upTitle').value,
        date: document.getElementById('upDate').value,
        typeId: document.getElementById('upType').value,
        note: document.getElementById('upNote').value,
        updatedAt: Date.now()
    };

    if (state.editingTaskId) {
        await dispatch(ACTIONS.UPDATE_TASK, newTask);
    } else {
        await dispatch(ACTIONS.ADD_TASK, newTask);
    }
    
    ui.renderUpcoming(); 
    ui.hideModal('upcomingModal');
}

// D. CẬP NHẬT GIAO DIỆN NÚT ĐỒNG BỘ
// D. CẬP NHẬT GIAO DIỆN NÚT ĐỒNG BỘ
function updateSyncUI(status) {
    const btn = document.getElementById('btnGoogleLogin');
    const icon = document.getElementById('syncIcon');
    if (!btn || !icon) return;

    btn.classList.remove('is-loading', 'is-connected');

    // 2. Nếu CHƯA đăng nhập -> Nút trở về bình thường (bấm được)
    if (!drive.isGoogleLoggedIn()) {
        icon.textContent = 'login';
        return; 
    }

    // 3. Nếu ĐÃ đăng nhập -> Dùng class CSS để điều khiển
    if (status === 'offline') {
        btn.classList.add('is-connected'); // Vẫn khóa nút
        icon.textContent = 'cloud_off';
    } 
    else if (status === 'syncing') {
        btn.classList.add('is-loading');   // Khóa nút + Kích hoạt animation xoay
        icon.textContent = 'sync';
    } 
    else if (status === 'synced') {
        btn.classList.add('is-connected'); // Khóa nút + Nằm im
        icon.textContent = 'cloud_done';
    }
}

export { initSettings, initEvents, updateSyncUI };