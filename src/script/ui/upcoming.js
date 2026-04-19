// File: src/script/ui/upcoming.js
import { state } from '../store/app_state.js';
import { escapeHTML } from '../core/utils.js';
import { openTaskModal } from './modal.js';

export function renderUpcoming() {
    const list = document.getElementById('upcomingList');
    if (!list) return;
    list.innerHTML = '';

    const sortedUpcoming = [...state.tasks].sort((a, b) => {
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

        tile.innerHTML = `
            <div class="up-date">${displayDate}</div>
            <div class="up-title">${escapeHTML(up.title)}</div>
        `;
        tile.onclick = () => openTaskModal(up);
        list.appendChild(tile);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'upcoming-add-btn';
    addBtn.innerHTML = '<span class="material-symbols-rounded">add</span>';
    addBtn.onclick = () => openTaskModal(null);
    list.appendChild(addBtn);
}