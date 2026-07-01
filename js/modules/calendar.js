// js/modules/calendar.js
// Módulo de Calendário — extraído do legacy.js

import { state } from '../state.js';
import { t } from '../i18n.js';
import { getDaysUntilDue } from '../utils.js';
import { openViewModal } from './reminders.js';

// ─── Estado local ─────────────────────────────────────────────────────────────
let calendarDate = new Date();

// ─── Render ───────────────────────────────────────────────────────────────────
export function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const display = document.getElementById('currentMonthDisplay');
    if (!grid || !display) return;

    grid.innerHTML = '';

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
    display.innerText = calendarDate.toLocaleDateString(localeStr, { month: 'long', year: 'numeric' }).toUpperCase();

    // Dias do mês anterior para preencher
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day empty';
        dayDiv.style.cssText = 'opacity:0.3;padding:10px;border-radius:12px;min-height:100px;border:1px solid transparent;';
        dayDiv.innerText = prevMonthLastDay - i;
        grid.appendChild(dayDiv);
    }

    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.style.cssText = 'padding:10px;border-radius:12px;min-height:100px;border:1px solid var(--border-glass);background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:5px;';

        const dateSpan = document.createElement('span');
        dateSpan.innerText = day;
        dateSpan.style.fontWeight = '700';
        dateSpan.style.fontSize = '14px';
        dayDiv.appendChild(dateSpan);

        // Destaque do dia atual
        const today = new Date();
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayDiv.style.borderColor = 'var(--primary)';
            dayDiv.style.background = 'rgba(var(--primary-rgb), 0.05)';
            dateSpan.style.color = 'var(--primary)';
        }

        // Lembretes do dia
        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let dayReminders = state.reminders.filter(r => r.dueDate === dayStr);

        if (state.calendarTagFilter === 'completed') {
            dayReminders = dayReminders.filter(r => r.status === 'completed');
        } else {
            dayReminders = dayReminders.filter(r => r.status !== 'completed');
            if (state.calendarTagFilter) {
                dayReminders = dayReminders.filter(r => r.tags && r.tags.includes(state.calendarTagFilter));
            }
        }

        if (state.searchQuery) {
            dayReminders = dayReminders.filter(r =>
                r.title.toLowerCase().includes(state.searchQuery) ||
                (r.description && r.description.toLowerCase().includes(state.searchQuery)) ||
                (r.tags && r.tags.some(tag => tag.toLowerCase().includes(state.searchQuery)))
            );
        }

        dayReminders.forEach(r => {
            const rDiv = document.createElement('div');
            rDiv.innerText = r.title;
            rDiv.style.fontSize = '10px';
            rDiv.style.padding = '4px 8px';
            rDiv.style.borderRadius = '6px';

            const isCompleted = r.status === 'completed';
            const days = getDaysUntilDue(r.dueDate);

            let bgColor = 'var(--primary)';
            if (isCompleted) {
                bgColor = '#2196F3';
            } else if (days !== null) {
                if (days < 0)       bgColor = 'var(--accent-error)';
                else if (days === 0) bgColor = 'var(--accent-success)';
                else if (days <= 3)  bgColor = 'var(--accent-warning)';
            }

            rDiv.style.background = bgColor;
            rDiv.style.color = 'white';
            rDiv.style.overflow = 'hidden';
            rDiv.style.textOverflow = 'ellipsis';
            rDiv.style.whiteSpace = 'nowrap';
            rDiv.style.cursor = 'pointer';
            rDiv.onclick = (e) => { e.stopPropagation(); openViewModal(r.id); };
            dayDiv.appendChild(rDiv);
        });

        grid.appendChild(dayDiv);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initCalendar() {
    document.getElementById('prevMonth')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });
}
