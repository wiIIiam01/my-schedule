// File: src/script/ui/modal.js
import { state } from '../store/app_state.js';
import { timeToMinutes, escapeHTML } from '../core/utils.js';

export const hideModal = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
};

export const showModal = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.add('active');
};

export function updateTypeSelects() {
    const options = state.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const taskType = document.getElementById('taskType');
    const upType = document.getElementById('upType');
    const typeEditSelect = document.getElementById('typeEditSelect');
    
    if(taskType) taskType.innerHTML = options;
    if(upType) upType.innerHTML = options;
    if(typeEditSelect) typeEditSelect.innerHTML = options;
}

export function openTypeEditor() {
    if(state.types.length > 0) {
        document.getElementById('typeEditSelect').value = state.types[0].id;
        document.getElementById('typeCssInput').value = state.types[0].customCSS || '';
    }
    showModal('typeModal');
}

export let currentTaskSnapshot = null;
export let currentUpSnapshot = null;

export function checkForm() {
    const taskModal = document.getElementById('taskModal');
    const upModal = document.getElementById('upcomingModal');

    if (taskModal && taskModal.classList.contains('active')) {
        const title = document.getElementById('taskTitle').value.trim();
        const hasDays = document.querySelectorAll('.day-circle.selected').length > 0;
        let isChanged = true;

        if (state.editingTaskId && currentTaskSnapshot) {
            const currentData = {
                id: state.editingTaskId,
                title: title,
                typeId: document.getElementById('taskType').value,
                days: Array.from(document.querySelectorAll('.day-circle.selected')).map(c => parseInt(c.dataset.dayIdx)),
                start: document.getElementById('taskStart').value,
                end: document.getElementById('taskEnd').value,
                location: document.getElementById('taskLocation').value,
                note: document.getElementById('taskNote').value
            };
            isChanged = JSON.stringify(currentData) !== currentTaskSnapshot;
        }

        const btnSave = document.getElementById('btnSaveTask');
        (title !== '' && hasDays && isChanged) ? btnSave.classList.add('active') : btnSave.classList.remove('active');
    }

    if (upModal && upModal.classList.contains('active')) {
        const title = document.getElementById('upTitle').value.trim();
        const date = document.getElementById('upDate').value;
        let isChanged = true;

        if (state.editingUpId && currentUpSnapshot) {
            const currentData = {
                id: state.editingUpId,
                title: title,
                date: date,
                typeId: document.getElementById('upType').value,
                note: document.getElementById('upNote').value
            };
            isChanged = JSON.stringify(currentData) !== currentUpSnapshot;
        }

        const btnSave = document.getElementById('btnSaveUp');
        (title !== '' && date !== '' && isChanged) ? btnSave.classList.add('active') : btnSave.classList.remove('active');
    }
}

export function openModal(task) {
    state.editingTaskId = task ? task.id : null;
    currentTaskSnapshot = task ? JSON.stringify(task) : null;

    document.getElementById('taskTitle').value = task ? task.title : '';
    document.getElementById('taskStart').value = task ? task.start : '08:00';
    document.getElementById('taskEnd').value = task ? task.end : '10:00';
    document.getElementById('taskLocation').value = task ? (task.location || '') : '';
    document.getElementById('taskNote').value = task ? (task.note || '') : '';
    
    if(task && state.types.find(t => t.id === task.typeId)) {
        document.getElementById('taskType').value = task.typeId;
    }

    document.querySelectorAll('.day-circle').forEach(c => {
        c.classList.remove('selected');
        if(task && task.days.includes(parseInt(c.dataset.dayIdx))) c.classList.add('selected');
    });

    document.getElementById('btnEraseTask').style.display = task ? 'block' : 'none';
    document.getElementById('btnFinishTask').style.display = task ? 'block' : 'none';
    
    checkForm();
    showModal('taskModal');
}

export function openUpcomingModal(up) {
    state.editingUpId = up ? up.id : null;
    currentUpSnapshot = up ? JSON.stringify(up) : null;

    document.getElementById('upTitle').value = up ? up.title : '';
    document.getElementById('upDate').value = up ? up.date : '';
    document.getElementById('upNote').value = up ? (up.note || '') : '';
    
    if(up && state.types.find(t => t.id === up.typeId)) {
        document.getElementById('upType').value = up.typeId;
    }

    document.getElementById('btnEraseUp').style.display = up ? 'block' : 'none';
    document.getElementById('btnFinishUp').style.display = up ? 'block' : 'none';
    
    checkForm();
    showModal('upcomingModal');
}

export function openLogModal() {
    const list = document.getElementById('logList');
    list.innerHTML = '';

    if (!state.logs || state.logs.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding: 20px; color: #888; font-style: italic;">Chưa có trang nhật ký nào.</div>';
        showModal('logModal');
        return;
    }

    const groupedLogs = {};
    const recentDates = []; 

    for (let i = state.logs.length - 1; i >= 0; i--) {
        const log = state.logs[i];
        if (!groupedLogs[log.date]) {
            if (recentDates.length >= 7) { break; }
            groupedLogs[log.date] = [];
            recentDates.push(log.date);
        }
        groupedLogs[log.date].push(log);
    }

    recentDates.forEach(dateStr => {
        const d = new Date(dateStr);
        const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        const tasksThatDay = groupedLogs[dateStr].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

        let tasksHtml = tasksThatDay.map(log => `
            <div class="log-task-item type-style-${log.typeId}" style="margin-bottom: 6px; padding: 8px; border-radius: 6px; display: flex; flex-direction: column;">
                <div style="font-size: 0.75rem; font-weight: bold; opacity: 0.8; margin-bottom: 2px;">
                    <span class="material-symbols-rounded" style="font-size: 14px; vertical-align: bottom;">schedule</span> 
                    ${log.start} - ${log.end}
                </div>
                <div style="font-size: 0.9rem; line-height: 1.3;">${escapeHTML(log.title)}</div>
            </div>
        `).join('');

        list.innerHTML += `
            <div class="diary-entry" style="display: block; margin-bottom: 16px; border-bottom: none; padding: 0;">
                <div class="diary-date" style="display: inline-block; margin-bottom: 8px;">${displayDate}</div>
                <div class="diary-content">${tasksHtml}</div>
            </div>
        `;
    });

    showModal('logModal');
}