// File: src/script/ui/calendar.js
import { state } from '../store/app_state.js';
import { APP_CONFIG, escapeHTML, timeToMinutes } from '../core/utils.js';
import { openModal } from './modal.js';

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
            
            // 🔴 Hàm openModal giờ đã gọi được bình thường
            tile.onclick = () => openModal(task);
            body.appendChild(tile);
        });
    });
    console.log("Sketching schedule...");
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