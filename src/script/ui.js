import { state } from './storage.js';

export const APP_CONFIG = { DAYS_MAP: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
};
export const hideModal = (id) => document.getElementById(id).classList.remove('active');
export const showModal = (id) => document.getElementById(id).classList.add('active');

export function applyDynamicCSS() {
    let styleTag = document.getElementById('dynamic-type-styles') || document.createElement('style');
    styleTag.id = 'dynamic-type-styles';
    document.head.appendChild(styleTag);
    styleTag.innerHTML = state.types.map(t => t.customCSS ? `.type-style-${t.id} { ${t.customCSS} }\n` : '').join('');
}

export function updateTypeSelects() {
    const options = state.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    document.getElementById('taskType').innerHTML = options;
    document.getElementById('upType').innerHTML = options;
    document.getElementById('typeEditSelect').innerHTML = options;
}

function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function groupContinuousDays(taskDaysIndices) {
    let sortedDays = [...taskDaysIndices].sort((a, b) => state.displayDaysIdx.indexOf(a) - state.displayDaysIdx.indexOf(b));
    if(sortedDays.length === 0) return [];
    let groups = [];
    let currentGroup = [sortedDays[0]];

    for(let i = 1; i < sortedDays.length; i++) {
        let prevVisualIdx = state.displayDaysIdx.indexOf(sortedDays[i-1]);
        let currVisualIdx = state.displayDaysIdx.indexOf(sortedDays[i]);
        if(currVisualIdx === prevVisualIdx + 1) { currentGroup.push(sortedDays[i]); }
        else { groups.push(currentGroup); currentGroup = [sortedDays[i]]; }
    }
    groups.push(currentGroup);
    return groups;
}

export function initCalendar() {
    const today = new Date().getDay();
    const header = document.getElementById('calHeader');
    state.displayDaysIdx = [];
    document.querySelectorAll('.day-head').forEach(e => e.remove());

    for (let i = 0; i < 7; i++) {
        const currentDayIdx = (today + i) % 7;
        state.displayDaysIdx.push(currentDayIdx);
        const dayDiv = document.createElement('div');
        dayDiv.className = `day-head ${i === 0 ? 'today' : ''}`;
        dayDiv.innerText = APP_CONFIG.DAYS_MAP[currentDayIdx];
        header.appendChild(dayDiv);
    }
    renderBody();
    renderUpcoming();
}

export function renderBody() {
    const body = document.getElementById('calBody');
    body.innerHTML = '';
    if (state.tasks.length === 0) return;

    let minMin = 24 * 60, maxMin = 0;
    const timeFreq = {}; 
    const allTimes = new Set(); 

    state.tasks.forEach(t => {
        const s = timeToMinutes(t.start), e = timeToMinutes(t.end);
        if (s < minMin) minMin = s; if (e > maxMin) maxMin = e;
        
        const daysCount = t.days ? t.days.length : 1;
        timeFreq[t.start] = (timeFreq[t.start] || 0) + daysCount;

        allTimes.add(t.start);
        allTimes.add(t.end);
    });

    minMin = Math.max(0, minMin - 30); maxMin = Math.min(24 * 60, maxMin + 30);
    const totalDuration = maxMin - minMin;

    allTimes.forEach(timeStr => {
        const topPercent = ((timeToMinutes(timeStr) - minMin) / totalDuration) * 100;
        const isFrequent = (timeFreq[timeStr] || 0) > 1;

        body.innerHTML += `<div class="time-label ${isFrequent ? 'high-freq' : ''}" style="top: ${topPercent}%">${timeStr}</div>`;
        body.innerHTML += `<div class="horizontal-line" style="top: ${topPercent}%"></div>`;
    });
    
    state.tasks.forEach(task => {
        const topPercent = ((timeToMinutes(task.start) - minMin) / totalDuration) * 100;
        const heightPercent = ((timeToMinutes(task.end) - timeToMinutes(task.start)) / totalDuration) * 100;

        const groups = groupContinuousDays(task.days);
        groups.forEach(group => {
            const startVisualIdx = state.displayDaysIdx.indexOf(group[0]);
            if(startVisualIdx === -1) return;

            const tile = document.createElement('div');
            tile.className = `task-tile type-style-${task.typeId}`;
            tile.style.left = `calc(60px + ((100% - 60px) / 7 * ${startVisualIdx}))`;
            tile.style.width = `calc(((100% - 60px) / 7 * ${group.length}) - 4px)`;
            tile.style.top = `${topPercent}%`;
            tile.style.height = `${heightPercent}%`;
            tile.title = task.note || '';

            const locHtml = task.location ? `<div class="fixed-location">${escapeHTML(task.location)}</div>` : '';
            tile.innerHTML = `<div class="task-title">${escapeHTML(task.title)}</div>${locHtml}`;
            tile.onclick = () => openModal(task);
            body.appendChild(tile);
        });
    });
}

export function renderUpcoming() {
    const list = document.getElementById('upcomingList');
    list.innerHTML = '';

    const sortedUpcoming = [...state.upcomingTasks].sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateA - dateB;
    });

    sortedUpcoming.forEach(up => {
        const tile = document.createElement('div');
        tile.className = `up-tile type-style-${up.typeId}`;
        tile.title = up.note || '';

        let displayDate = up.date;
        if(up.date) {
            const d = new Date(up.date);
            if(!isNaN(d)) {
                const hh = d.getHours().toString().padStart(2, '0');
                const mm = d.getMinutes().toString().padStart(2, '0');
                const day = d.getDate().toString().padStart(2, '0');
                const month = d.toLocaleString('en-US', { month: 'short' });
                displayDate = `${hh}:${mm} ${month} ${day}`;
            }
        }

        tile.innerHTML = `<div class="up-date">${displayDate}</div><div class="up-title">${escapeHTML(up.title)}</div>`;
        tile.onclick = () => openUpcomingModal(up);
        list.appendChild(tile);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'upcoming-add-btn';
    addBtn.innerHTML = '<span class="material-symbols-rounded">add</span>';
    addBtn.onclick = () => openUpcomingModal(null);
    list.appendChild(addBtn);
}

let currentTaskSnapshot = null;
let currentUpSnapshot = null;

export function checkForm() {
    if (document.getElementById('taskModal').classList.contains('active')) {
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

    if (document.getElementById('upcomingModal').classList.contains('active')) {
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

export function openTypeEditor() {
    if(state.types.length > 0) {
        document.getElementById('typeEditSelect').value = state.types[0].id;
        document.getElementById('typeCssInput').value = state.types[0].customCSS || '';
    }
    showModal('typeModal');
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