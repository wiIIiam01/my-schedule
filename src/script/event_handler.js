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
    // Cập nhật danh sách loại Task vào thẻ select
    ui.updateTypeSelects();

    // --- 1. GOOGLE DRIVE SYNC BTN ---
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const syncIcon = document.getElementById('syncIcon');
    
    if (btnGoogleLogin && syncIcon) {
        btnGoogleLogin.onclick = async () => {
            if (drive.isGoogleLoggedIn()) {
                btnGoogleLogin.classList.add('is-loading');
                syncIcon.textContent = 'sync';
                btnGoogleLogin.title = "Synchronizing...";

                await smartSync(); 

                btnGoogleLogin.classList.remove('is-loading');
                syncIcon.textContent = 'cloud_done';
                btnGoogleLogin.title = "Updated";
            } else {
                btnGoogleLogin.classList.add('is-loading');
                syncIcon.textContent = 'sync';
                btnGoogleLogin.title = "Getting API...";

                const isSuccess = await drive.loginGoogle();
                if (isSuccess) {
                    await smartSync();
                    ui.renderBody();
                    ui.renderUpcoming();
                }
                btnGoogleLogin.classList.remove('is-loading');
                updateSyncUI();
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
        const diaryResult = processAutoDiary(state.tasks, state.logs, state.lastLoggedDate);
        
        if (diaryResult.hasChanges) {
            state.logs = diaryResult.newLogs;
            state.lastLoggedDate = diaryResult.newLastLoggedDate;
            await saveData();
            console.log("Diary updated!");
        }

        ui.openLogModal();
    };
    document.getElementById('btnCancelLog').onclick = () => ui.hideModal('logModal');

    // --- 4. MODAL WEEKLY TASK ---
    document.getElementById('btnAdd').onclick = () => ui.openModal(null);
    document.getElementById('btnCancelTask').onclick = () => ui.hideModal('taskModal');
    document.getElementById('btnSaveTask').onclick = saveTask;
    
    document.getElementById('btnEraseTask').onclick = () => {
        targetActionType = 'task';
        document.getElementById('chkDeleteInDiary').checked = false;
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishTask').onclick = () => {
        targetActionType = 'task';
        ui.showModal('confirmFinishModal');
    };

    // --- 5. MODAL UPCOMING TASK ---
    document.getElementById('btnCancelUp').onclick = () => ui.hideModal('upcomingModal');
    document.getElementById('btnSaveUp').onclick = saveUpcoming;
    
    document.getElementById('btnEraseUp').onclick = () => {
        targetActionType = 'upcoming';
        document.getElementById('chkDeleteInDiary').checked = false;
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishUp').onclick = () => {
        targetActionType = 'upcoming';
        ui.showModal('confirmFinishModal');
    };

    // --- 6. POPUP CONFIRM ERASE ---
    document.getElementById('btnCancelEraseConfirm').onclick = () => ui.hideModal('confirmEraseModal');
    document.getElementById('btnDoErase').onclick = () => {
        const wipeDiary = document.getElementById('chkDeleteInDiary').checked;
        const idToErase = targetActionType === 'task' ? state.editingTaskId : state.editingUpId;

        if (targetActionType === 'task') {
            state.tasks = state.tasks.filter(t => t.id !== idToErase);
            ui.hideModal('taskModal');
            ui.initCalendar(); 
        } else {
            state.upcomingTasks = state.upcomingTasks.filter(t => t.id !== idToErase);
            ui.hideModal('upcomingModal');
            ui.renderUpcoming(); 
        }

        if (wipeDiary) {
            state.logs = state.logs.filter(log => log.taskId !== idToErase);
        }

        saveData();
        ui.hideModal('confirmEraseModal');
    };

    // --- 7. POPUP CONFIRM FINISH ---
    document.getElementById('btnCancelFinishConfirm').onclick = () => ui.hideModal('confirmFinishModal');
    document.getElementById('btnDoFinish').onclick = () => {
        if (targetActionType === 'task') {
            state.tasks = state.tasks.filter(t => t.id !== state.editingTaskId);
            ui.hideModal('taskModal');
            ui.initCalendar();
        } else {
            const upTask = state.upcomingTasks.find(t => t.id === state.editingUpId);
            if (upTask) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                
                state.logs.push({
                    logId: crypto.randomUUID(),
                    date: now.toISOString().split('T')[0],
                    taskId: upTask.id,
                    title: upTask.title,
                    start: timeStr,
                    end: timeStr,
                    typeId: upTask.typeId
                });
                
                state.upcomingTasks = state.upcomingTasks.filter(t => t.id !== state.editingUpId);
            }
            ui.hideModal('upcomingModal');
            ui.renderUpcoming();
        }

        saveData();
        ui.hideModal('confirmFinishModal');
    };

    // --- 8. TYPE MANAGER ---
    document.getElementById('btnEditType').onclick = ui.openTypeEditor;
    document.getElementById('btnCancelType').onclick = () => ui.hideModal('typeModal');

    document.getElementById('btnSaveType').onclick = () => {
        const t = state.types.find(x => x.id === document.getElementById('typeEditSelect').value);
        if(t) {
            t.customCSS = document.getElementById('typeCssInput').value;
            saveData(); 
            ui.applyDynamicCSS(); 
            ui.renderBody(); 
            ui.renderUpcoming();
        }
        ui.hideModal('typeModal');
    };

    document.getElementById('btnAddType').onclick = () => {
        const name = document.getElementById('newTypeName').value.trim();
        if(!name) return;
        const newType = { id: 't_' + crypto.randomUUID(), name: name, customCSS: "background: #eee; color: #333;" };
        state.types.push(newType);
        saveData(); 
        ui.updateTypeSelects(); 
        ui.applyDynamicCSS();
        
        document.getElementById('newTypeName').value = '';
        document.getElementById('typeEditSelect').value = newType.id;
        document.getElementById('typeCssInput').value = newType.customCSS;
    };

    document.getElementById('btnDeleteType').onclick = () => {
        if(!state.types || state.types.length <= 1) { alert("Phải có ít nhất 1 Type!"); return; } 
        const idToDelete = document.getElementById('typeEditSelect').value;
        state.types = state.types.filter(t => t.id !== idToDelete);

        const fallbackId = state.types[0].id;
        state.tasks.forEach(t => { if(t.typeId === idToDelete) t.typeId = fallbackId; });
        state.upcomingTasks.forEach(t => { if(t.typeId === idToDelete) t.typeId = fallbackId; });

        saveData(); 
        ui.updateTypeSelects(); 
        ui.applyDynamicCSS(); 
        ui.renderBody(); 
        ui.renderUpcoming();
        
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
function saveTask() {
    if(!document.getElementById('btnSaveTask').classList.contains('active')) return;
    const newTask = {
        id: state.editingTaskId || crypto.randomUUID(),
        title: document.getElementById('taskTitle').value,
        typeId: document.getElementById('taskType').value,
        days: Array.from(document.querySelectorAll('.day-circle.selected')).map(c => parseInt(c.dataset.dayIdx)),
        start: document.getElementById('taskStart').value,
        end: document.getElementById('taskEnd').value,
        location: document.getElementById('taskLocation').value,
        note: document.getElementById('taskNote').value,
        updatedAt: Date.now()
    };

    if (state.editingTaskId) {
        state.tasks[state.tasks.findIndex(t => t.id === state.editingTaskId)] = newTask;
    } else {
        state.tasks.push(newTask);
    }
    saveData(); 
    ui.initCalendar(); 
    ui.hideModal('taskModal');
}

function saveUpcoming() {
    const newUp = {
        id: state.editingUpId || crypto.randomUUID(),
        title: document.getElementById('upTitle').value,
        date: document.getElementById('upDate').value,
        typeId: document.getElementById('upType').value,
        note: document.getElementById('upNote').value,
        updatedAt: Date.now()
    };

    if (state.editingUpId) {
        state.upcomingTasks[state.upcomingTasks.findIndex(t => t.id === state.editingUpId)] = newUp;
    } else {
        state.upcomingTasks.push(newUp);
    }
    saveData(); 
    ui.renderUpcoming(); 
    ui.hideModal('upcomingModal');
}

// D. CẬP NHẬT GIAO DIỆN NÚT ĐỒNG BỘ
function updateSyncUI() {
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const syncIcon = document.getElementById('syncIcon');
    if (!btnGoogleLogin || !syncIcon) return;

    if (drive.isGoogleLoggedIn()) {
        btnGoogleLogin.classList.add('is-connected');
        syncIcon.textContent = 'cloud_done';
        btnGoogleLogin.title = "Connected";
    } else {
        btnGoogleLogin.classList.remove('is-connected');
        syncIcon.textContent = 'cloud_off';
        btnGoogleLogin.title = "Connect";
    }
}

export { initSettings, initEvents, updateSyncUI };