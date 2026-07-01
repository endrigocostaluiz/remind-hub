// js/modules/kanban.js
import { state } from '../state.js';
import { saveReminders, renderCard } from './reminders.js';
import { t } from '../i18n.js';
import { showNotification } from '../utils.js';

const el = (id) => document.getElementById(id);

export function initKanban() {
    const board = document.querySelector('.kanban-board');
    if (!board) return;

    // Delegação de eventos para o board
    board.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.kanban-card');
        if (card) {
            e.dataTransfer.setData('text/plain', card.dataset.id);
            card.classList.add('dragging');
        }
    });

    board.addEventListener('dragend', (e) => {
        const card = e.target.closest('.kanban-card');
        if (card) {
            card.classList.remove('dragging');
        }
    });

    board.addEventListener('dragover', (e) => {
        const column = e.target.closest('.kanban-column');
        if (column) {
            e.preventDefault();
            column.classList.add('drag-over');

            // Feedback visual de inserção
            const list = column.querySelector('.kanban-list');
            const afterElement = getDragAfterElement(list, e.clientY);
            const dragging = document.querySelector('.dragging');
            if (dragging) {
                if (afterElement == null) {
                    list.appendChild(dragging);
                } else {
                    list.insertBefore(dragging, afterElement);
                }
            }
        }
    });

    board.addEventListener('dragleave', (e) => {
        const column = e.target.closest('.kanban-column');
        if (column) {
            const rect = column.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
                column.classList.remove('drag-over');
            }
        }
    });

    board.addEventListener('drop', async (e) => {
        const column = e.target.closest('.kanban-column');
        if (column) {
            e.preventDefault();
            column.classList.remove('drag-over');
            
            const reminderId = e.dataTransfer.getData('text/plain');
            const draggingCard = board.querySelector(`.kanban-card[data-id="${reminderId}"]`);
            const newStatus = column.dataset.status;
            
            if (reminderId && newStatus && draggingCard) {
                // Encontra quem está depois do card solto no DOM (que já foi movido pelo dragover)
                const nextCard = draggingCard.nextElementSibling;
                const toId = nextCard ? nextCard.dataset.id : null;
                
                await moveAndReorderReminder(parseInt(reminderId), newStatus, toId);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function moveAndReorderReminder(fromId, newStatus, toId) {
    const fromIndex = state.reminders.findIndex(r => r.id === fromId);
    if (fromIndex === -1) return;

    const movedItem = state.reminders[fromIndex];
    movedItem.status = newStatus;

    // Remove do local original
    state.reminders.splice(fromIndex, 1);

    if (toId) {
        // Encontra a nova posição baseada no ID do cartão que agora está DEPOIS dele
        const toIndex = state.reminders.findIndex(r => r.id === parseInt(toId));
        if (toIndex !== -1) {
            state.reminders.splice(toIndex, 0, movedItem);
        } else {
            state.reminders.push(movedItem);
        }
    } else {
        // Se não houver card depois, ele é o último da coluna.
        // Como o array é global e misturado, vamos colocar ele após o último card visível desta coluna.
        const columnCards = state.reminders.filter(r => (r.status || 'todo') === newStatus);
        if (columnCards.length > 0) {
            const lastVisibleCard = columnCards[columnCards.length - 1];
            const lastIndex = state.reminders.findIndex(r => r.id === lastVisibleCard.id);
            state.reminders.splice(lastIndex + 1, 0, movedItem);
        } else {
            state.reminders.push(movedItem);
        }
    }

    await saveReminders();
    if (window.render) window.render();
    showNotification(t('orderUpdated'));
}

export function renderKanban() {
    const todoList = el('list-kanban-todo');
    const inProgressList = el('list-kanban-in-progress');
    const completedList = el('list-kanban-completed');

    if (!todoList || !inProgressList || !completedList) return;

    renderKanbanTagFilter();

    let filtered = state.reminders;
    const searchQuery = state.searchQuery ? state.searchQuery.toLowerCase() : '';
    const filteredReminders = state.reminders.filter(r => {
        const matchesSearch = !searchQuery || 
                             r.title.toLowerCase().includes(searchQuery) || 
                             (r.description && r.description.toLowerCase().includes(searchQuery));
        
        const matchesTag = !state.kanbanTagFilter || state.kanbanTagFilter === 'all' ||
                          (r.tags && r.tags.includes(state.kanbanTagFilter));

        const isVisibleInKanban = r.showInKanban === true;

        return matchesSearch && matchesTag && isVisibleInKanban;
    });

    const todoItems = filteredReminders.filter(r => !r.status || r.status === 'todo');
    const inProgressItems = filteredReminders.filter(r => r.status === 'in-progress');
    const completedItems = filteredReminders.filter(r => r.status === 'completed');

    todoList.innerHTML = todoItems.map(r => wrapInKanbanCard(r)).join('');
    inProgressList.innerHTML = inProgressItems.map(r => wrapInKanbanCard(r)).join('');
    completedList.innerHTML = completedItems.map(r => wrapInKanbanCard(r)).join('');

    el('count-kanban-todo').innerText = todoItems.length;
    el('count-kanban-in-progress').innerText = inProgressItems.length;
    el('count-kanban-completed').innerText = completedItems.length;
}

function wrapInKanbanCard(reminder) {
    return `<div class="kanban-card" data-id="${reminder.id}" draggable="true">
        ${renderCard(reminder)}
    </div>`;
}

function renderKanbanTagFilter() {
    const container = el('kanban-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.reminders.forEach(r => (r.tags || []).forEach(tag => allTags.add(tag)));
    const sortedTags = Array.from(allTags).sort();

    const renderTag = (tag, label, isActive) => `
        <button data-action="set-kanban-tag-filter" data-tag="${tag}" 
                class="glass-btn ${isActive ? 'primary' : ''}" 
                style="padding: 6px 14px; border-radius: 20px; font-size: 11px; white-space: nowrap; font-weight: 600;">
            ${label}
        </button>
    `;

    container.innerHTML = `
        ${renderTag('all', t('all'), !state.kanbanTagFilter || state.kanbanTagFilter === 'all')}
        ${sortedTags.map(tag => renderTag(tag, tag, state.kanbanTagFilter === tag)).join('')}
    `;
}
