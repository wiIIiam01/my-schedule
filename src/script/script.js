const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
import { loadData, saveData, saveSettings, loginGoogle, isGoogleLoggedIn, smartSync, state } from './storage.js';
import * as ui from './ui.js';

const appWindow = getCurrentWindow();

document.getElementById('btnClose').onclick = () => appWindow.close();
document.getElementById('btnMinimize').onclick = () => appWindow.minimize();

function initSettings() {
    // 1. Nạp dữ liệu cấu hình ban đầu
    if (!state.settings) {
        state.settings = { opacity: 0.7, resolution: "1024 x 720" };
    }

    const slider = document.getElementById('opacitySlider');
    const resInput = document.getElementById('resInput');
    const menu = document.getElementById('settingsMenu');

    // Cài đặt thông số lúc mở app
    document.documentElement.style.setProperty('--bg-opacity', state.settings.opacity);
    slider.value = state.settings.opacity;
    resInput.value = state.settings.resolution;

    // ==========================================
    // TỰ ĐỘNG RESIZE KÍCH THƯỚC LÚC MỞ APP
    // ==========================================
    if (state.settings.resolution) {
        const dimensions = state.settings.resolution.toLowerCase().split('x').map(s => parseInt(s.trim()));
        if (dimensions.length === 2 && !isNaN(dimensions[0]) && !isNaN(dimensions[1])) {
            const [w, h] = dimensions;
            // Dùng .then() để đảm bảo đổi size xong mới canh giữa, tránh bị lệch
            appWindow.setSize(new LogicalSize(w, h)).then(() => {
                appWindow.center(); 
            });
        }
    }
    // ==========================================

    // 2. Bật / Tắt Menu Settings
    document.getElementById('btnSettings').onclick = () => {
        menu.classList.toggle('active');
    };

    // Đóng menu khi click ra ngoài vùng Settings
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.left-actions')) {
            menu.classList.remove('active');
        }
    });

    // Ngăn click vào menu làm đóng menu
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 3. Xử lý kéo thanh Opacity
    slider.oninput = (e) => {
        document.documentElement.style.setProperty('--bg-opacity', e.target.value);
    };
    
    slider.onchange = (e) => {
        state.settings.opacity = e.target.value;
        saveSettings(); 
    };

    // 4. Xử lý lưu Resolution
    document.getElementById('btnApplySettings').onclick = () => {
        const resText = resInput.value.trim();
        state.settings.resolution = resText;
        saveSettings(); 

        const dimensions = resText.toLowerCase().split('x').map(s => parseInt(s.trim()));
        
        if (dimensions.length === 2 && !isNaN(dimensions[0]) && !isNaN(dimensions[1])) {
            const [w, h] = dimensions;
            // Nâng cấp nhẹ: Thêm .then() ở đây luôn cho mượt
            appWindow.setSize(new LogicalSize(w, h)).then(() => {
                appWindow.center();
            });
        } else {
            alert("Wrong format: Width x Height (VD: 1050 x 800)");
        }
        
        menu.classList.remove('active');
    };
}
function autoDiary() {
    // Hàm phụ để format ngày YYYY-MM-DD theo giờ địa phương (tránh lỗi múi giờ UTC)
    const getLocalDateString = (d) => {
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Khởi tạo mốc nếu lần đầu mở app
    if (!state.lastLoggedDate) {
        state.lastLoggedDate = todayStr;
        saveData();
        return;
    }

    // 2. Bắt đầu quét từ ngày cuối cùng mở app đến ngày hôm nay
    let checkDate = new Date(state.lastLoggedDate);
    checkDate.setHours(0, 0, 0, 0); 
    
    const todayReset = new Date(now);
    todayReset.setHours(0, 0, 0, 0);

    let dataChanged = false;

    // Vòng lặp quét từng ngày (bao gồm cả ngày hôm nay)
    while (checkDate <= todayReset) {
        let dayOfWeek = checkDate.getDay();
        let dateString = getLocalDateString(checkDate);
        
        // Lấy tất cả Weekly Task có lịch diễn ra vào thứ này
        let tasksForDay = state.tasks.filter(t => t.days.includes(dayOfWeek));

        tasksForDay.forEach(t => {
            // Quan trọng: Kiểm tra task này đã được log vào ngày này chưa?
            const isLogged = state.logs.some(log => log.date === dateString && log.taskId === t.id);
            
            if (!isLogged) {
                let shouldLog = false;

                if (checkDate < todayReset) {
                    // Nếu là ngày quá khứ (hôm qua, tuần trước) -> Chắc chắn đã qua, Log ngay
                    shouldLog = true;
                } else if (checkDate.getTime() === todayReset.getTime()) {
                    // Nếu là ngày hôm nay -> Check xem giờ hiện tại đã qua giờ Start chưa
                    if (t.start) {
                        const [h, m] = t.start.split(':').map(Number);
                        const taskStartMinutes = h * 60 + m;
                        // Nếu giờ hiện tại >= giờ diễn ra task -> Log
                        if (currentMinutes >= taskStartMinutes) {
                            shouldLog = true;
                        }
                    }
                }

                if (shouldLog) {
                    state.logs.push({
                        logId: crypto.randomUUID(),
                        date: dateString,
                        taskId: t.id,
                        title: t.title,
                        start: t.start,
                        end: t.end,
                        typeId: t.typeId,
                        updatedAt: Date.now()
                    });
                    dataChanged = true;
                }
            }
        });

        // Tiến tới ngày tiếp theo để quét
        checkDate.setDate(checkDate.getDate() + 1);
    }

    // 3. Cập nhật mốc lastLoggedDate
    if (state.lastLoggedDate !== todayStr) {
        state.lastLoggedDate = todayStr;
        dataChanged = true;
    }
    if (dataChanged) {
        saveData();
    }
}
let targetActionType = ''; // Biến để lưu trạng thái đang xử lý (task hay upcoming)

function initEvents() {
    ui.updateTypeSelects();
    // --- GOOGLE DRIVE SYNC BTN ---
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const syncIcon = document.getElementById('syncIcon');
    
    if (btnGoogleLogin && syncIcon) {
        btnGoogleLogin.onclick = async () => {
            // TRƯỜNG HỢP 1: ĐÃ ĐĂNG NHẬP -> TRỞ THÀNH NÚT ĐỒNG BỘ THỦ CÔNG
            if (isGoogleLoggedIn()) {
                btnGoogleLogin.classList.add('is-loading');
                syncIcon.textContent = 'sync';
                btnGoogleLogin.title = "Đang đồng bộ dữ liệu...";

                // Gọi hàm đồng bộ thông minh (nhớ import smartSync từ storage.js ở đầu file nhé)
                await smartSync(); 

                btnGoogleLogin.classList.remove('is-loading');
                syncIcon.textContent = 'cloud_done';
                btnGoogleLogin.title = "Đã đồng bộ Drive mới nhất";
            } 
            // TRƯỜNG HỢP 2: CHƯA ĐĂNG NHẬP -> CHẠY LUỒNG ĐĂNG NHẬP
            else {
                btnGoogleLogin.classList.add('is-loading');
                syncIcon.textContent = 'sync';
                btnGoogleLogin.title = "Đang xin cấp mã...";

                const isSuccess = await loginGoogle();

                btnGoogleLogin.classList.remove('is-loading');
                updateSyncUI(); // Dùng hàm tự động update màu lúc nãy
            }
        };
    }
    const daySelector = document.getElementById('daySelector');
    ui.APP_CONFIG.DAYS_MAP.forEach((day, idx) => {
        const circle = document.createElement('div');
        circle.className = 'day-circle'; circle.innerText = day[0]; circle.dataset.dayIdx = idx;
        circle.onclick = () => { circle.classList.toggle('selected'); ui.checkForm(); };
        daySelector.appendChild(circle);
    });

    // --- LOGS MODAL ---
    document.getElementById('btnLog').onclick = ui.openLogModal;
    document.getElementById('btnCancelLog').onclick = () => ui.hideModal('logModal');

    // --- WEEKLY TASK MODAL ---
    document.getElementById('btnAdd').onclick = () => ui.openModal(null);
    document.getElementById('btnCancelTask').onclick = () => ui.hideModal('taskModal');
    document.getElementById('btnSaveTask').onclick = saveTask;
    
    document.getElementById('btnEraseTask').onclick = () => {
        targetActionType = 'task';
        document.getElementById('chkDeleteInDiary').checked = false; // Reset checkbox
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishTask').onclick = () => {
        targetActionType = 'task';
        ui.showModal('confirmFinishModal');
    };

    // --- UPCOMING TASK MODAL ---
    document.getElementById('btnCancelUp').onclick = () => ui.hideModal('upcomingModal');
    document.getElementById('btnSaveUp').onclick = saveUpcoming;
    
    document.getElementById('btnEraseUp').onclick = () => {
        targetActionType = 'upcoming';
        document.getElementById('chkDeleteInDiary').checked = false; // Reset checkbox
        ui.showModal('confirmEraseModal');
    };
    document.getElementById('btnFinishUp').onclick = () => {
        targetActionType = 'upcoming';
        ui.showModal('confirmFinishModal');
    };

    // ==========================================
    // LOGIC CHO POPUP CONFIRM ERASE (Xóa vĩnh viễn)
    // ==========================================
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

        // Nếu tick chọn Xóa luôn trong Diary
        if (wipeDiary) {
            state.logs = state.logs.filter(log => log.taskId !== idToErase);
        }

        saveData();
        ui.hideModal('confirmEraseModal');
    };

    // ==========================================
    // LOGIC CHO POPUP CONFIRM FINISH (Hoàn thành)
    // ==========================================
    document.getElementById('btnCancelFinishConfirm').onclick = () => ui.hideModal('confirmFinishModal');
    document.getElementById('btnDoFinish').onclick = () => {
        if (targetActionType === 'task') {
            // Weekly Task: Xóa khỏi giao diện lịch (để dừng lặp lại), lịch sử trong Diary vẫn tự động giữ nguyên.
            state.tasks = state.tasks.filter(t => t.id !== state.editingTaskId);
            ui.hideModal('taskModal');
            ui.initCalendar();
        } else {
            // Upcoming Task: Đưa vào Diary với ngày/giờ hiện tại rồi xóa khỏi danh sách Upcoming
            const upTask = state.upcomingTasks.find(t => t.id === state.editingUpId);
            if (upTask) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                
                state.logs.push({
                    logId: crypto.randomUUID(),
                    date: now.toISOString().split('T')[0], // Ngày hôm nay
                    taskId: upTask.id,
                    title: upTask.title,
                    start: timeStr,
                    end: timeStr, // Hoàn thành ngay thời điểm bấm
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

    // --- TYPE MANAGER ---
    // (Phần code dưới này là của TypeEdit giữ nguyên không đổi)
    document.getElementById('btnEditType').onclick = ui.openTypeEditor;
    document.getElementById('btnCancelType').onclick = () => ui.hideModal('typeModal');

    document.getElementById('btnSaveType').onclick = () => {
        const t = state.types.find(x => x.id === document.getElementById('typeEditSelect').value);
        if(t) {
            t.customCSS = document.getElementById('typeCssInput').value;
            saveData(); ui.applyDynamicCSS(); ui.renderBody(); ui.renderUpcoming();
        }
        ui.hideModal('typeModal');
    };

    document.getElementById('btnAddType').onclick = () => {
        const name = document.getElementById('newTypeName').value.trim();
        if(!name) return;
        const newType = { id: 't_' + crypto.randomUUID(), name: name, customCSS: "background: #eee; color: #333;" };
        state.types.push(newType);
        saveData(); ui.updateTypeSelects(); ui.applyDynamicCSS();
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

        saveData(); ui.updateTypeSelects(); ui.applyDynamicCSS(); ui.renderBody(); ui.renderUpcoming();
        document.getElementById('typeEditSelect').dispatchEvent(new Event('change'));
    };

    document.getElementById('typeEditSelect').onchange = (e) => {
        const t = state.types.find(x => x.id === e.target.value);
        document.getElementById('typeCssInput').value = t ? (t.customCSS || '') : '';
    };

    document.getElementById('btnScrollRight').onclick = () => document.getElementById('upcomingList').scrollBy({ left: 200, behavior: 'smooth' });
    document.querySelectorAll('.form-control').forEach(el => el.addEventListener('input', ui.checkForm));
}

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
    saveData(); ui.initCalendar(); ui.hideModal('taskModal');
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
    saveData(); ui.renderUpcoming(); ui.hideModal('upcomingModal');
}
function updateSyncUI() {
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const syncIcon = document.getElementById('syncIcon');
    if (!btnGoogleLogin || !syncIcon) return;

    if (isGoogleLoggedIn()) {
        btnGoogleLogin.classList.add('is-connected');
        syncIcon.textContent = 'cloud_done';
        btnGoogleLogin.title = "Đã kết nối Drive";
    } else {
        btnGoogleLogin.classList.remove('is-connected');
        syncIcon.textContent = 'cloud_off';
        btnGoogleLogin.title = "Kết nối Google Drive";
    }
}
window.onload = async () => {
    await loadData();
    updateSyncUI();
    initSettings();
    ui.applyDynamicCSS();
    ui.updateTypeSelects();
    autoDiary();
    initEvents();
    ui.initCalendar();
};