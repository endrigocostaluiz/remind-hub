// js/modules/reminders.js
// Módulo responsável por todo o ciclo de vida dos Lembretes, Tags e Notificações.

import { state, STORAGE_KEY, TAGS_KEY, NOTIFICATION_TIME_KEY, VAULT_REMINDERS_KEY } from '../state.js';
import { saveVaultReminders, renderVault } from './vault.js';

import { getStorageData, setStorageData } from '../storage.js';
import { showNotification, escapeHtml, getDaysUntilDue, getDueDateText, getDueDateClass, sanitizeHtml, generateCalendarLink } from '../utils.js';
import { t } from '../i18n.js';

// ─── Referências DOM (lazy) ───────────────────────────────────────────────────
const el = (id) => document.getElementById(id);

// ─── Storage ──────────────────────────────────────────────────────────────────
export async function loadReminders() {
    try {
        state.reminders = await getStorageData(STORAGE_KEY, []);
        if (!Array.isArray(state.reminders)) state.reminders = [];
        state.reminders = state.reminders.filter(r => r !== null && typeof r === 'object');
    } catch (e) {
        state.reminders = [];
    }
}

export async function saveReminders() {
    await setStorageData(STORAGE_KEY, state.reminders);
    updateDashboardStats();
}

export async function loadCustomTags() {
    try {
        state.customTags = await getStorageData(TAGS_KEY, []);
        if (!Array.isArray(state.customTags)) state.customTags = [];
    } catch (e) {
        state.customTags = [];
    }
}

export async function saveCustomTags() {
    await setStorageData(TAGS_KEY, state.customTags);
}

// ─── Notificações / Alarmes ───────────────────────────────────────────────────
export async function scheduleReminderNotifications(reminder) {
    if (!reminder.dueDate || typeof chrome === 'undefined' || !chrome.alarms) return;

    await chrome.alarms.clear(`remind-near2-${reminder.id}`);
    await chrome.alarms.clear(`remind-near-${reminder.id}`);
    await chrome.alarms.clear(`remind-due-${reminder.id}`);

    const notifTime = await getStorageData(NOTIFICATION_TIME_KEY, '09:00');
    const [hours, minutes] = notifTime.split(':').map(Number);

    const dueDate = new Date(reminder.dueDate + 'T00:00:00');

    const dueTime = new Date(dueDate);
    dueTime.setHours(hours, minutes, 0, 0);

    const nearTime = new Date(dueDate);
    nearTime.setDate(nearTime.getDate() - 1);
    nearTime.setHours(hours, minutes, 0, 0);

    const near2Time = new Date(dueDate);
    near2Time.setDate(near2Time.getDate() - 2);
    near2Time.setHours(hours, minutes, 0, 0);

    const now = Date.now();
    if (near2Time.getTime() > now) chrome.alarms.create(`remind-near2-${reminder.id}`, { when: near2Time.getTime() });
    if (nearTime.getTime() > now) chrome.alarms.create(`remind-near-${reminder.id}`, { when: nearTime.getTime() });
    if (dueTime.getTime() > now) chrome.alarms.create(`remind-due-${reminder.id}`, { when: dueTime.getTime() });
}

export async function rescheduleAllNotifications() {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;
    for (const reminder of state.reminders) {
        await scheduleReminderNotifications(reminder);
    }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function addReminder() {
    const inputTitle = el('inputTitle');
    const inputDesc = el('inputDesc');
    const dueDateInput = el('dueDateInput');

    const title = inputTitle ? inputTitle.value.trim() : '';
    if (!title) {
        showNotification(t('titleRequiredNotif'), 'error');
        return;
    }

    const reminder = {
        id: Date.now(),
        title,
        description: inputDesc ? inputDesc.innerHTML.trim() : '',
        links: state.currentLinks.filter(l => l.trim() !== ''),
        checklist: state.currentChecklist.filter(item => item.text.trim() !== ''),
        checklistNumbered: el('checklistNumberedInput') ? el('checklistNumberedInput').checked : false,
        tags: [...state.selectedTags],
        images: [...state.currentImages],
        dueDate: dueDateInput ? dueDateInput.value || null : null,
        repeat: el('repeatSelect') ? el('repeatSelect').value || 'none' : 'none',
        showInKanban: el('showInKanbanInput') ? el('showInKanbanInput').checked : false,
        password: el('reminderPassword') ? el('reminderPassword').value.trim() : '',
        status: 'todo',
        createdAt: new Date().toISOString()
    };

    if (state.currentView === 'vault') {
        state.vaultReminders.unshift(reminder);
        await saveVaultReminders();
    } else {
        state.reminders.unshift(reminder);
        await saveReminders();
    }
    
    await scheduleReminderNotifications(reminder);
    clearForm();
    const formModal = el('formModal');
    if (formModal) formModal.classList.remove('active');
    
    if (state.currentView === 'vault') renderVault();
    else window._reminderRender && window._reminderRender();
    
    showNotification(t('reminderAdded'));
}


export function findReminderById(id) {
    return (state.reminders || []).find(r => r.id === id) || (state.vaultReminders || []).find(r => r.id === id);
}

export async function saveEditReminder() {
    try {
        const editTitle = el('editTitle');
        const editDesc = el('editDesc');
        const editDueDateInput = el('editDueDateInput');

        const title = editTitle ? editTitle.value.trim() : '';
        if (!title) return showNotification(t('titleRequiredNotif'), 'error');

        const reminder = findReminderById(state.currentEditId);
        if (!reminder) return showNotification('Erro: Lembrete não encontrado.', 'error');

        reminder.title = title;
        reminder.description = editDesc ? editDesc.innerHTML.trim() : '';
        reminder.tags = [...state.selectedTags];
        reminder.links = state.editingLinks.filter(l => l.trim() !== '');
        reminder.checklist = state.editingChecklist.filter(item => item.text.trim() !== '');
        reminder.images = [...state.editingImages];
        reminder.dueDate = editDueDateInput ? editDueDateInput.value || null : null;
        reminder.repeat = el('editRepeatSelect') ? el('editRepeatSelect').value || 'none' : 'none';
        reminder.showInKanban = el('editShowInKanbanInput') ? el('editShowInKanbanInput').checked : false;
        reminder.password = el('editReminderPassword') ? el('editReminderPassword').value.trim() : '';
        reminder.checklistNumbered = el('editChecklistNumberedInput') ? el('editChecklistNumberedInput').checked : false;

        if (state.currentView === 'vault') {
            await saveVaultReminders();
        } else {
            await saveReminders();
        }
        
        await scheduleReminderNotifications(reminder);
        closeEditModal();
        
        if (state.currentView === 'vault') {
            renderVault();
        } else {
            window._reminderRender && window._reminderRender();
        }
        
        showNotification(t('reminderUpdated'));
    } catch (err) {
        showNotification('Erro ao salvar lembrete: ' + err.message, 'error');
    }
}

export async function markAsCompleted(id) {
    const reminder = findReminderById(id);
    if (!reminder) return;

    reminder.status = 'completed';
    if (state.vaultReminders.some(r => r.id === reminder.id)) {
        await saveVaultReminders();
        renderVault();
    } else {
        await saveReminders();
        window._reminderRender && window._reminderRender();
    }
    openViewModal(reminder.id);
}

export async function deleteReminder(id) {
    if (!confirm(t('confirmDelete'))) return;

    if (state.vaultReminders.some(r => r.id === id)) {
        state.vaultReminders = state.vaultReminders.filter(r => r.id !== id);
        await saveVaultReminders();
        renderVault();
    } else {
        state.reminders = state.reminders.filter(r => r.id !== id);
        await saveReminders();
        window._reminderRender && window._reminderRender();
    }

    if (typeof chrome !== 'undefined' && chrome.alarms) {
        await chrome.alarms.clear(`remind-near-${id}`);
        await chrome.alarms.clear(`remind-due-${id}`);
    }
    showNotification(t('deleted'));
}

// ─── Formulário de Criação ────────────────────────────────────────────────────
export function clearForm() {
    const inputTitle = el('inputTitle');
    const inputDesc = el('inputDesc');
    const dueDateInput = el('dueDateInput');
    const repeatSelect = el('repeatSelect');

    if (inputTitle) inputTitle.value = '';
    if (inputDesc) inputDesc.innerHTML = '';
    if (dueDateInput) dueDateInput.value = '';
    if (repeatSelect) repeatSelect.value = 'none';

    state.selectedTags = [];
    state.currentLinks = [];
    state.currentChecklist = [];
    state.currentImages = [];
    if (el('showInKanbanInput')) el('showInKanbanInput').checked = false;
    if (el('reminderPassword')) el('reminderPassword').value = '';
    if (el('checklistNumberedInput')) el('checklistNumberedInput').checked = false;
    renderImagePreview();
    renderChecklistContainer();
    renderImagePreview();
    renderSelectedTagsDisplay();
}

export function addLinkInput() {
    state.currentLinks.push('');
    renderLinksContainer();
}

export function removeLinkInput(index) {
    state.currentLinks.splice(index, 1);
    renderLinksContainer();
}

function renderGenericContainer(containerId, dataArray, mapFn) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = dataArray.map(mapFn).join('');
}

export function renderLinksContainer() {
    renderGenericContainer('linksContainer', state.currentLinks, (link, index) => `
        <div class="link-item" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input type="url" class="glass-btn" style="flex: 1; text-align: left;" placeholder="https://..." value="${link}" data-action="update-link" data-index="${index}">
            <button type="button" class="glass-btn" style="padding: 10px; display: flex; align-items: center; justify-content: center;" data-action="remove-link" data-index="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `);
}

function getChecklistNumbers(items) {
    const counts = [0, 0, 0];
    return items.map(item => {
        const level = item.level || 0;
        counts[level]++;
        for (let k = level + 1; k < counts.length; k++) {
            counts[k] = 0;
        }
        const numParts = [];
        for (let k = 0; k <= level; k++) {
            numParts.push(counts[k]);
        }
        return numParts.join('.');
    });
}

function sanitizeChecklistLevels(items) {
    if (items.length > 0) {
        items[0].level = 0;
    }
    for (let i = 1; i < items.length; i++) {
        const currentLevel = items[i].level || 0;
        const prevLevel = items[i - 1].level || 0;
        if (currentLevel > prevLevel + 1) {
            items[i].level = prevLevel + 1;
        }
        if (items[i].level > 2) {
            items[i].level = 2;
        }
        if (items[i].level < 0) {
            items[i].level = 0;
        }
    }
}

export function addChecklistItem() {
    state.currentChecklist.push({ text: '', done: false, completedAt: null, level: 0 });
    renderChecklistContainer();
}

export function removeChecklistItem(index) {
    state.currentChecklist.splice(index, 1);
    renderChecklistContainer();
}

export function indentChecklistItem(index) {
    const items = state.currentChecklist;
    const currentLevel = items[index].level || 0;
    const prevLevel = index > 0 ? (items[index - 1].level || 0) : -1;
    if (currentLevel < 2 && prevLevel >= currentLevel) {
        items[index].level = currentLevel + 1;
        renderChecklistContainer();
    }
}

export function outdentChecklistItem(index) {
    const items = state.currentChecklist;
    const currentLevel = items[index].level || 0;
    if (currentLevel > 0) {
        items[index].level = currentLevel - 1;
        sanitizeChecklistLevels(items);
        renderChecklistContainer();
    }
}

export function renderChecklistContainer() {
    const items = state.currentChecklist;
    sanitizeChecklistLevels(items);

    const isNumbered = el('checklistNumberedInput')?.checked || false;
    const numbers = isNumbered ? getChecklistNumbers(items) : [];

    renderGenericContainer('checklistContainer', items, (item, index) => {
        const level = item.level || 0;
        const currentLevel = level;
        const prevLevel = index > 0 ? (items[index - 1].level || 0) : -1;
        const canIndent = currentLevel < 2 && prevLevel >= currentLevel;
        const canOutdent = currentLevel > 0;

        const indentStyle = level > 0 ? `margin-left: ${level * 24}px; padding-left: 8px;` : '';
        const numPrefix = isNumbered ? `<span style="font-size: 13px; font-weight: 700; color: var(--primary); min-width: 32px; display: inline-block;">${numbers[index]}</span>` : '';

        return `
        <div class="checklist-item" style="${indentStyle}">
            ${numPrefix}
            <input type="text" placeholder="${t('itemPlaceholder')}" value="${item.text}" data-action="update-checklist-item" data-index="${index}">
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center;" data-action="outdent-checklist-item" data-index="${index}" ${canOutdent ? '' : 'disabled style="opacity: 0.3; cursor: not-allowed;"'} title="Desindentar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center;" data-action="indent-checklist-item" data-index="${index}" ${canIndent ? '' : 'disabled style="opacity: 0.3; cursor: not-allowed;"'} title="Indentar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center; color: var(--error);" data-action="remove-checklist-item" data-index="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        `;
    });
}

export function renderImagePreview() {
    const container = el('imagePreviewContainer');
    if (!container) return;
    container.innerHTML = state.currentImages.map((img, index) => `
        <div style="position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-glass);">
            <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" data-action="remove-image" data-index="${index}" style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: white; border: none; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `).join('');
}

export function removeImage(index) {
    state.currentImages.splice(index, 1);
    renderImagePreview();
}

// ─── Formulário de Edição ─────────────────────────────────────────────────────
export function openEditModal(id) {
    try {
        state.currentEditId = id;
        const reminder = findReminderById(id);
        if (!reminder) return;

        const editTitle = el('editTitle');
        const editDesc = el('editDesc');
        const editModal = el('editModal');
        const isLocked = reminder.password && !state.unlockedReminders.has(reminder.id);

        if (isLocked) {
            openPasswordModal(id, 'edit');
            return;
        }

        if (editTitle) editTitle.value = reminder.title;
        if (editDesc) editDesc.innerHTML = reminder.description || '';
        state.selectedTags = [...(reminder.tags || [])];
        state.editingLinks = [...(reminder.links || [])];
        state.editingChecklist = [...(reminder.checklist || [])].map(item => ({ ...item }));
        state.editingImages = [...(reminder.images || [])];
        if (editDueDateInput) editDueDateInput.value = reminder.dueDate || '';
        const editRepeatSelect = el('editRepeatSelect');
        if (editRepeatSelect) editRepeatSelect.value = reminder.repeat || 'none';

        const editShowInKanbanInput = el('editShowInKanbanInput');
        if (editShowInKanbanInput) editShowInKanbanInput.checked = !!reminder.showInKanban;
        
        if (el('editReminderPassword')) el('editReminderPassword').value = reminder.password || '';
        if (el('editChecklistNumberedInput')) el('editChecklistNumberedInput').checked = !!reminder.checklistNumbered;

        // Hide Kanban and Password options if in Vault
        const kanbanGroup = el('edit-kanban-group');
        const passwordGroup = el('edit-password-group');
        if (state.currentView === 'vault') {
            if (kanbanGroup) kanbanGroup.style.display = 'none';
            if (passwordGroup) passwordGroup.style.display = 'none';
        } else {
            if (kanbanGroup) kanbanGroup.style.display = 'block';
            if (passwordGroup) passwordGroup.style.display = 'block';
        }

        renderEditLinksContainer();
        renderEditChecklistContainer();
        renderEditImagePreview();
        renderSelectedTagsDisplay();
        
        if (editModal) editModal.classList.add('active');
    } catch (err) {
        showNotification('Erro ao abrir edição: ' + err.message, 'error');
    }
}

export function closeEditModal() {
    const editModal = el('editModal');
    if (editModal) editModal.classList.remove('active');
    state.currentEditId = null;
    state.selectedTags = [];
    state.editingImages = [];
    if (el('editReminderPassword')) el('editReminderPassword').value = '';
}

export function addEditLinkInput() {
    state.editingLinks.push('');
    renderEditLinksContainer();
}

export function removeEditLinkInput(index) {
    state.editingLinks.splice(index, 1);
    renderEditLinksContainer();
}

export function renderEditLinksContainer() {
    renderGenericContainer('editLinksContainer', state.editingLinks, (link, index) => `
        <div class="link-item" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input type="url" class="glass-btn" style="flex: 1; text-align: left;" value="${link}" data-action="update-edit-link" data-index="${index}">
            <button type="button" class="glass-btn" style="padding: 10px; display: flex; align-items: center; justify-content: center;" data-action="remove-edit-link" data-index="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `);
}

export function addEditChecklistItem() {
    state.editingChecklist.push({ text: '', done: false, completedAt: null, level: 0 });
    renderEditChecklistContainer();
}

export function removeEditChecklistItem(index) {
    state.editingChecklist.splice(index, 1);
    renderEditChecklistContainer();
}

export function indentEditChecklistItem(index) {
    const items = state.editingChecklist;
    const currentLevel = items[index].level || 0;
    const prevLevel = index > 0 ? (items[index - 1].level || 0) : -1;
    if (currentLevel < 2 && prevLevel >= currentLevel) {
        items[index].level = currentLevel + 1;
        renderEditChecklistContainer();
    }
}

export function outdentEditChecklistItem(index) {
    const items = state.editingChecklist;
    const currentLevel = items[index].level || 0;
    if (currentLevel > 0) {
        items[index].level = currentLevel - 1;
        sanitizeChecklistLevels(items);
        renderEditChecklistContainer();
    }
}

export function renderEditChecklistContainer() {
    const container = el('editChecklistContainer');
    if (!container) return;
    const items = state.editingChecklist;
    sanitizeChecklistLevels(items);

    const isNumbered = el('editChecklistNumberedInput')?.checked || false;
    const numbers = isNumbered ? getChecklistNumbers(items) : [];
    
    container.innerHTML = items.map((item, index) => {
        const level = item.level || 0;
        const currentLevel = level;
        const prevLevel = index > 0 ? (items[index - 1].level || 0) : -1;
        const canIndent = currentLevel < 2 && prevLevel >= currentLevel;
        const canOutdent = currentLevel > 0;

        const indentStyle = level > 0 ? `margin-left: ${level * 24}px; padding-left: 8px;` : '';
        const numPrefix = isNumbered ? `<span style="font-size: 13px; font-weight: 700; color: var(--primary); min-width: 32px; display: inline-block;">${numbers[index]}</span>` : '';

        return `
        <div class="checklist-item" style="${indentStyle}">
            ${numPrefix}
            <input type="text" placeholder="${t('itemPlaceholder')}" value="${item.text}" data-action="update-edit-checklist-item" data-index="${index}">
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center;" data-action="outdent-edit-checklist-item" data-index="${index}" ${canOutdent ? '' : 'disabled style="opacity: 0.3; cursor: not-allowed;"'} title="Desindentar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center;" data-action="indent-edit-checklist-item" data-index="${index}" ${canIndent ? '' : 'disabled style="opacity: 0.3; cursor: not-allowed;"'} title="Indentar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button type="button" class="glass-btn" style="padding: 6px; display: flex; align-items: center; color: var(--error);" data-action="remove-edit-checklist-item" data-index="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        `;
    }).join('');
}

export function renderEditImagePreview() {
    const container = el('editImagePreviewContainer');
    if (!container) return;
    container.innerHTML = state.editingImages.map((img, index) => `
        <div style="position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-glass);">
            <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" data-action="remove-edit-image" data-index="${index}" style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: white; border: none; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `).join('');
}

export function removeEditImage(index) {
    state.editingImages.splice(index, 1);
    renderEditImagePreview();
}

// ─── Renderização ─────────────────────────────────────────────────────────────
export function renderReminders() {
    let filtered = state.reminders;

    if (state.remindersTagFilter === 'completed') {
        filtered = filtered.filter(r => r.status === 'completed');
    } else {
        // Esconde concluídos por padrão em qualquer outro filtro
        filtered = filtered.filter(r => r.status !== 'completed');
        if (state.remindersTagFilter && state.remindersTagFilter !== 'all') {
            filtered = filtered.filter(r => r.tags && r.tags.includes(state.remindersTagFilter));
        }
    }

    if (state.searchQuery) {
        filtered = filtered.filter(r =>
            r.title.toLowerCase().includes(state.searchQuery) ||
            r.description.toLowerCase().includes(state.searchQuery) ||
            (r.tags && r.tags.some(tag => tag.toLowerCase().includes(state.searchQuery)))
        );
    }

    const renderToContainer = (container, cards) => {
        if (!container) return;
        
        // Se o container estiver vazio, renderiza tudo de uma vez
        if (container.innerHTML.includes('color: var(--text-dim)')) {
            container.innerHTML = cards.map(renderCard).join('');
            return;
        }

        const newCardsHtml = cards.map(renderCard);
        const existingCards = Array.from(container.querySelectorAll('.reminder-card-premium'));
        
        // Se a quantidade de cards mudou drasticamente ou o filtro mudou, renderiza tudo
        if (existingCards.length !== cards.length) {
            container.innerHTML = newCardsHtml.join('') || `<p style="color: var(--text-dim);">${t('noReminders')}</p>`;
            return;
        }

        // Atualização granular: apenas se o HTML do card mudou
        cards.forEach((reminder, index) => {
            const cardHtml = newCardsHtml[index];
            const existing = existingCards[index];
            if (existing && existing.outerHTML !== cardHtml) {
                // Para evitar perder o hover/foco, atualizamos apenas o conteúdo interno se possível
                // Mas outerHTML é mais seguro para garantir que classes e atributos batam
                existing.outerHTML = cardHtml;
            }
        });
    };

    const fullGrid = el('full-reminders-grid');
    renderToContainer(fullGrid, filtered);

    const dashRecent = el('dash-reminders-recent');
    if (dashRecent) {
        let dashFiltered = state.reminders;
        // ... (filtros do dashboard)
        if (state.dashboardTagFilter === 'completed') {
            dashFiltered = dashFiltered.filter(r => r.status === 'completed');
        } else {
            dashFiltered = dashFiltered.filter(r => r.status !== 'completed');
            if (state.dashboardTagFilter && state.dashboardTagFilter !== 'all') {
                dashFiltered = dashFiltered.filter(r => r.tags && r.tags.includes(state.dashboardTagFilter));
            }
        }
        if (state.searchQuery) {
            dashFiltered = dashFiltered.filter(r =>
                r.title.toLowerCase().includes(state.searchQuery) ||
                r.description.toLowerCase().includes(state.searchQuery) ||
                (r.tags && r.tags.some(tag => tag.toLowerCase().includes(state.searchQuery)))
            );
        }
        renderToContainer(dashRecent, dashFiltered);
    }
}

export function renderCard(reminder) {
    if (!reminder) return '';
    const days = getDaysUntilDue(reminder.dueDate);

    let accentColor = '#b0b0b0';
    let barBg = 'rgba(158, 158, 158, 0.1)';
    let leftBorder = '3px solid transparent';
    let fontWeight = '400';
    let dueText = '';
    let isCompleted = reminder.status === 'completed';

    if (isCompleted) {
        barBg = 'rgba(33, 150, 243, 0.15)';
        accentColor = '#2196F3';
        leftBorder = '3px solid #2196F3';
        fontWeight = '600';
        dueText = t('completed') || 'Concluído';
    } else if (days !== null) {
        dueText = getDueDateText(reminder.dueDate);
        if (days <= 0) {
            barBg = 'rgba(244, 67, 54, 0.15)';
            accentColor = '#d32f2f';
            leftBorder = '3px solid #f44336';
            fontWeight = '600';
        } else if (days === 1) {
            barBg = 'rgba(255, 152, 0, 0.15)';
            accentColor = '#f57c00';
            leftBorder = '3px solid #ff9800';
        } else if (days <= 6) {
            barBg = 'rgba(255, 193, 7, 0.15)';
            accentColor = '#f57c00';
            leftBorder = '3px solid #ffa726';
        }
    }

    const isLocked = reminder.password && !state.unlockedReminders.has(reminder.id);

    return `
    <div class="reminder-card-premium" data-action="view-reminder" data-id="${reminder.id}" style="padding: 16px; min-height: 160px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;cursor: pointer;">
            <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(reminder.title)}</h3>
            <div style="display: flex; gap: 8px; align-items: center;">
                ${reminder.password ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isLocked ? '#ff4444' : 'var(--primary)'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` : ''}
                <button class="reminder-card-edit-btn" style="background:none; border:none; cursor:pointer; color: var(--text-dim); padding: 0;" data-action="open-edit-modal" data-id="${reminder.id}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </div>
        </div>

        <div style="flex-grow: 1; position: relative;">
            ${isLocked ? `
                <div class="locked-card-overlay" style="height: 100%;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2" style="margin-bottom: 8px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <div style="font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: uppercase;" data-i18n="enterPasswordToUnlock">${t('enterPasswordToUnlock')}</div>
                </div>
            ` : `
                ${reminder.description ? `
                    <div class="reminder-desc ${reminder.links && reminder.links.length > 0 ? 'has-links' : 'no-links'}">
                        ${sanitizeHtml(reminder.description)}
                    </div>
                ` : ''}
                ${reminder.checklist && reminder.checklist.length > 0 ? `
                    <div title="${t('hasChecklist')}" style="color: var(--primary);margin-bottom: 12px;margin-top: -5px;display: flex;align-items: center;gap: 6px;font-size: 11px;font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        <span>${t('hasChecklist')}</span>
                    </div>
                ` : ''}
                ${reminder.links && reminder.links.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    ${reminder.links.map(link => {
                        let displayUrl = link.replace(/^https?:\/\//, '').replace(/^www\./, '');
                        if (displayUrl.length > 15) displayUrl = displayUrl.substring(0, 12) + '...';
                        return `
                            <a href="${link}" target="_blank" class="card-link-btn" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--primary-glow); border: 1px solid var(--border-glass); border-radius: 8px; text-decoration: none; color: var(--primary); font-size: 11px;" data-action="stop-prop">
                                <img src="https://www.google.com/s2/favicons?domain=${link}&sz=32" width="14" height="14" style="border-radius: 2px;">
                                <span>${displayUrl}</span>
                            </a>`;
                    }).join('')}
                </div>
                ` : ''}

                ${reminder.images && reminder.images.length > 0 ? `
                     <div style="display: flex;align-items: center;gap: 4px;margin-bottom: 11px;margin-top: 0px;">
                        ${reminder.images.slice(0, 3).map(img => `
                            <div style="width: 24px; height: 24px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-glass);">
                                <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                        `).join('')}
                        ${reminder.images.length > 3 ? `<span style="font-size: 10px; color: var(--text-dim);">+${reminder.images.length - 3}</span>` : ''}
                     </div>
                ` : ''}

                ${reminder.tags && reminder.tags.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 0px;">
                    ${reminder.tags.map(tag => `
                        <span style="background: var(--primary); color: white; padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;">${escapeHtml(tag)}</span>
                    `).join('')}
                </div>
                ` : ''}
            `}
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px; margin-top: auto;">
            ${(reminder.dueDate || isCompleted) ? `
                <div style="flex: 1; margin-top: 12px; max-width: 92%; background: ${barBg}; border-radius: 8px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; border-left: ${leftBorder};">
                    <div style="display: flex; align-items: center; gap: 10px; color: ${accentColor}; font-size: 12px; font-weight: ${fontWeight};">
                        ${isCompleted ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: ${accentColor}"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: ${accentColor}"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`}
                        <span>${dueText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${reminder.repeat && reminder.repeat !== 'none' ? `
                            <div title="${t(reminder.repeat)}" style="display: flex; align-items: center; color: ${accentColor}; opacity: 0.8;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                            </div>
                        ` : ''}
                        <button class="glass-btn" title="${t('shareGoogleCalendar')}" data-action="add-to-calendar" data-id="${reminder.id}" style="padding: 4px; background: none; border: none; color: ${accentColor}; display: flex; align-items: center; justify-content: center;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </button>
                    </div>
                </div>
            ` : '<div style="flex: 1;"></div>'}
            
            <div class="drag-handle" style="opacity: 0.2; transform: none; display: flex; align-items: center; cursor: grab;">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </div>
        </div>
    </div>
`;
}

// ─── Filtros de Tag ───────────────────────────────────────────────────────────
export function renderDashboardTagFilter() {
    const container = el('dash-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.reminders.forEach(r => (r.tags || []).forEach(tag => allTags.add(tag)));
    const sortedTags = Array.from(allTags).sort();

    const renderTag = (tag, label, isActive) => `
        <button data-action="set-dash-tag-filter" data-tag="${tag}" 
                class="glass-btn ${isActive ? 'primary' : ''}" 
                style="padding: 6px 14px; border-radius: 20px; font-size: 11px; white-space: nowrap; font-weight: 600;">
            ${label}
        </button>
    `;

    container.innerHTML = `
        ${renderTag('all', t('all'), state.dashboardTagFilter === null)}
        ${renderTag('completed', t('completed'), state.dashboardTagFilter === 'completed')}
        ${sortedTags.map(tag => renderTag(tag, tag, state.dashboardTagFilter === tag)).join('')}
    `;
}

export function renderRemindersTagFilter() {
    const container = el('reminders-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.reminders.forEach(r => (r.tags || []).forEach(tag => allTags.add(tag)));
    const sortedTags = Array.from(allTags).sort();

    const renderTag = (tag, label, isActive) => `
        <button data-action="set-reminders-tag-filter" data-tag="${tag}" 
                class="glass-btn ${isActive ? 'primary' : ''}" 
                style="padding: 6px 14px; border-radius: 20px; font-size: 11px; white-space: nowrap; font-weight: 600;">
            ${label}
        </button>
    `;

    container.innerHTML = `
        ${renderTag('all', t('all'), state.remindersTagFilter === null)}
        ${renderTag('completed', t('completed'), state.remindersTagFilter === 'completed')}
        ${sortedTags.map(tag => renderTag(tag, tag, state.remindersTagFilter === tag)).join('')}
    `;
}

export function renderCalendarTagFilter() {
    const container = el('calendar-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.reminders.forEach(r => (r.tags || []).forEach(tag => allTags.add(tag)));
    const sortedTags = Array.from(allTags).sort();

    const renderTag = (tag, label, isActive) => `
        <button data-action="set-calendar-tag-filter" data-tag="${tag}" 
                class="glass-btn ${isActive ? 'primary' : ''}" 
                style="padding: 6px 14px; border-radius: 20px; font-size: 11px; white-space: nowrap; font-weight: 600;">
            ${label}
        </button>
    `;

    container.innerHTML = `
        ${renderTag('all', t('all'), state.calendarTagFilter === null)}
        ${renderTag('completed', t('completed'), state.calendarTagFilter === 'completed')}
        ${sortedTags.map(tag => renderTag(tag, tag, state.calendarTagFilter === tag)).join('')}
    `;
}

// ─── Modal de Visualização ────────────────────────────────────────────────────
export function openViewModal(id) {
    const reminder = findReminderById(id);
    if (!reminder) return;

    const isLocked = reminder.password && !state.unlockedReminders.has(reminder.id);
    if (isLocked) {
        openPasswordModal(id, 'view');
        return;
    }

    const modal = el('viewReminderModal');
    if (modal) modal.dataset.id = id;

    const title = el('viewTitle');
    const desc = el('viewDesc');
    const dueDateDisp = el('viewDueDateDisplay');
    const tagsDisp = el('viewTagsDisplay');
    const linksDisp = el('viewLinksDisplay');
    const btnEdit = el('btnEditFromView');
    const checklistDisp = el('viewChecklistDisplay');

    if (title) title.innerText = reminder.title;
    if (desc) desc.innerHTML = reminder.description ? sanitizeHtml(reminder.description) : t('noDescription');

    if (checklistDisp) {
        const hasChecklist = reminder.checklist && reminder.checklist.length > 0;
        const checklistGroup = checklistDisp.closest('.form-group');
        
        if (hasChecklist) {
            if (checklistGroup) checklistGroup.style.display = 'block';
            
            const isNumbered = !!reminder.checklistNumbered;
            const numbers = isNumbered ? getChecklistNumbers(reminder.checklist) : [];

            checklistDisp.innerHTML = reminder.checklist.map((item, index) => {
                const level = item.level || 0;
                const timestamp = item.done && item.completedAt ? ` <span style="font-size: 10px; color: var(--text-dim); opacity: 0.8; margin-left: auto;">(${item.completedAt})</span>` : '';
                const indentStyle = level > 0 ? `margin-left: ${level * 24}px; padding-left: 8px;` : '';
                const numPrefix = isNumbered ? `<span style="font-size: 12px; font-weight: 700; color: var(--primary); margin-right: 6px; display: inline-block;">${numbers[index]}</span>` : '';
                
                return `
                <div class="view-checklist-item ${item.done ? 'done' : ''}" data-action="toggle-checklist-state" data-reminder-id="${reminder.id}" data-index="${index}" style="display: flex; align-items: center; width: calc(100% - ${level * 24}px); ${indentStyle}">
                    <input type="checkbox" ${item.done ? 'checked' : ''} onclick="event.stopPropagation(); toggleChecklistItem(${reminder.id}, ${index})">
                    ${numPrefix}
                    <span style="flex: 1; ${item.done ? 'text-decoration: line-through; color: var(--text-dim);' : ''}">${escapeHtml(item.text)}</span>
                    ${timestamp}
                </div>
            `;
            }).join('');
        } else {
            if (checklistGroup) checklistGroup.style.display = 'none';
        }
    }

    if (dueDateDisp) {
        if (reminder.status === 'completed') {
            dueDateDisp.innerHTML = `
                <div class="due-date completed" style="padding: 8px 16px; border-radius: 12px; background: rgba(33, 150, 243, 0.15); color: #2196F3; font-size: 14px; display: flex; align-items: center; gap: 8px; border-left: 3px solid #2196F3; font-weight: 600;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>${t('completed') || 'Concluído'}</span>
                </div>
            `;
        } else if (reminder.dueDate) {
            dueDateDisp.innerHTML = `
                <div class="due-date ${getDueDateClass(reminder.dueDate)}" style="padding: 8px 16px; border-radius: 12px; background: var(--border-glass); font-size: 14px; display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>${getDueDateText(reminder.dueDate)} (${new Date(reminder.dueDate + 'T00:00:00').toLocaleDateString(state.currentLang === 'pt' ? 'pt-BR' : 'en-US')})</span>
                </div>
            `;
        } else {
            dueDateDisp.innerHTML = '';
        }
    }

    if (tagsDisp) {
        const hasTags = reminder.tags && reminder.tags.length > 0;
        const tagsGroup = tagsDisp.closest('.form-group');
        if (hasTags) {
            if (tagsGroup) tagsGroup.style.display = 'block';
            tagsDisp.innerHTML = reminder.tags.map(tag => `
                <span class="glass-btn" style="font-size: 12px; padding: 6px 14px; border-color: var(--primary); pointer-events: none;">${escapeHtml(tag)}</span>
            `).join('');
        } else {
            if (tagsGroup) tagsGroup.style.display = 'none';
        }
    }

    if (linksDisp) {
        const hasLinks = reminder.links && reminder.links.length > 0;
        const linksGroup = linksDisp.closest('.form-group');
        if (hasLinks) {
            if (linksGroup) linksGroup.style.display = 'block';
            linksDisp.innerHTML = reminder.links.map(link => `
                <a href="${link}" target="_blank" class="glass-btn" style="display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--primary); border-color: var(--primary-glow);">
                    <img src="https://www.google.com/s2/favicons?domain=${link}&sz=32" width="20" height="20">
                    <span style="font-size: 13px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${link}</span>
                </a>
            `).join('');
        } else {
            if (linksGroup) linksGroup.style.display = 'none';
        }
    }

    const imagesDisp = el('viewImagesDisplay');
    const galleryGroup = imagesDisp ? imagesDisp.closest('.form-group') : null;
    if (imagesDisp) {
        const hasImages = reminder.images && reminder.images.length > 0;
        if (galleryGroup) galleryGroup.style.display = hasImages ? 'block' : 'none';
        if (hasImages) {
            imagesDisp.innerHTML = (reminder.images || []).map((img, index) => `
                <div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-glass); cursor: pointer;" 
                     data-action="view-image" data-reminder-id="${reminder.id}" data-index="${index}">
                    <img src="${img}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
                </div>
            `).join('');
        }
    }

    const viewCompleteAction = el('viewCompleteAction');
    if (viewCompleteAction) {
        let shouldShowCompleteButton = false;
        if (reminder.status !== 'completed') {
            const isDueOrOverdue = reminder.dueDate && getDaysUntilDue(reminder.dueDate) <= 0;
            const hasChecklist = reminder.checklist && reminder.checklist.length > 0;
            const allChecklistDone = hasChecklist && reminder.checklist.every(item => item.done);
            if (isDueOrOverdue || allChecklistDone) shouldShowCompleteButton = true;
        }
        viewCompleteAction.innerHTML = shouldShowCompleteButton ? `
            <button class="glass-btn primary" data-action="mark-as-completed" data-id="${reminder.id}" style="display: flex; align-items: center; gap: 8px; background: rgba(33, 150, 243, 0.2); border-color: #2196F3; color: #2196F3; font-weight: 600;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${t('markAsCompleted') || 'Concluir Lembrete'}</span>
            </button>
        ` : '';
    }

    if (btnEdit) btnEdit.dataset.id = reminder.id;
    const btnShare = el('btnShareFromView');
    if (btnShare) btnShare.dataset.id = reminder.id;
    const btnCalendar = el('btnCalendarFromView');
    if (btnCalendar) btnCalendar.dataset.id = reminder.id;

    if (modal) modal.classList.add('active');
}

export function closeViewModal() {
    const modal = el('viewReminderModal');
    if (modal) modal.classList.remove('active');
}

export function deleteFromModal() {
    if (confirm(t('confirmDelete'))) {
        state.reminders = state.reminders.filter(r => r.id !== state.currentEditId);
        saveReminders();
        closeEditModal();
        window._reminderRender && window._reminderRender();
        showNotification(t('deleted'));
    }
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export function updateDashboardStats() {
    // Regular Dash/Reminders
    const countTotal = el('count-total');
    const countOverdue = el('count-overdue');
    const countCompleted = el('count-completed');
    const countShortcuts = el('count-shortcuts');

    const overdueCount = state.reminders.filter(r => r.dueDate && getDaysUntilDue(r.dueDate) < 0 && r.status !== 'completed').length;
    const completedCount = state.reminders.filter(r => r.status === 'completed').length;

    if (countTotal) countTotal.innerText = state.reminders.length;
    if (countOverdue) countOverdue.innerText = overdueCount;
    if (countCompleted) countCompleted.innerText = completedCount;
    if (countShortcuts) countShortcuts.innerText = (state.shortcuts || []).length;

    // Kanban Stats (Only reminders where kanban === true)
    const kTotal = el('kanban-count-total');
    const kOverdue = el('kanban-count-overdue');
    const kTodo = el('kanban-count-todo');
    const kInProgress = el('kanban-count-inprogress');
    const kCompleted = el('kanban-count-completed');

    if (kTotal || kOverdue || kTodo || kInProgress || kCompleted) {
        const kanbanReminders = state.reminders.filter(r => r.showInKanban === true);
        const kOverdueCount = kanbanReminders.filter(r => r.dueDate && getDaysUntilDue(r.dueDate) < 0 && r.status !== 'completed').length;
        const kCompletedCount = kanbanReminders.filter(r => r.status === 'completed').length;

        if (kTotal) kTotal.innerText = kanbanReminders.length;
        if (kOverdue) kOverdue.innerText = kOverdueCount;
        if (kTodo) kTodo.innerText = kanbanReminders.filter(r => r.status === 'todo').length;
        if (kInProgress) kInProgress.innerText = kanbanReminders.filter(r => r.status === 'in-progress').length;
        if (kCompleted) kCompleted.innerText = kCompletedCount;
    }

    // Dispara a renderização dos previews do dashboard (streams, news)
    if (typeof window.renderDashboardPreviews === 'function') {
        window.renderDashboardPreviews();
    }
}

// ─── Checklist Toggle e Propagação de Sublistas ───────────────────────────────
function getDescendantIndices(items, parentIndex) {
    const descendants = [];
    const parentLevel = items[parentIndex].level || 0;
    for (let j = parentIndex + 1; j < items.length; j++) {
        if ((items[j].level || 0) > parentLevel) {
            descendants.push(j);
        } else {
            break;
        }
    }
    return descendants;
}

function getParentIndex(items, childIndex) {
    const childLevel = items[childIndex].level || 0;
    if (childLevel === 0) return -1;
    for (let i = childIndex - 1; i >= 0; i--) {
        const currentLevel = items[i].level || 0;
        if (currentLevel < childLevel) {
            return i;
        }
    }
    return -1;
}

function propagateChecklistStatus(items, idx) {
    const isDone = items[idx].done;
    
    // 1. Cima para baixo: se clicamos em um pai, marcamos todos os seus descendentes com o mesmo estado
    const descendantIndices = getDescendantIndices(items, idx);
    descendantIndices.forEach(childIdx => {
        items[childIdx].done = isDone;
        if (isDone) {
            const now = new Date();
            const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
            items[childIdx].completedAt = `${now.toLocaleDateString(localeStr)} ${t('at')} ${now.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            items[childIdx].completedAt = null;
        }
    });

    // 2. Baixo para cima: atualizamos os ancestrais de forma recursiva
    let currentParentIdx = getParentIndex(items, idx);
    while (currentParentIdx !== -1) {
        const descendants = getDescendantIndices(items, currentParentIdx);
        // Os filhos imediatos são os descendentes com level === parentLevel + 1
        const parentLevel = items[currentParentIdx].level || 0;
        const immediateChildren = descendants.filter(childIdx => (items[childIdx].level || 0) === parentLevel + 1);

        const allChildrenDone = immediateChildren.length > 0 && immediateChildren.every(childIdx => items[childIdx].done);
        
        const parent = items[currentParentIdx];
        const oldDone = parent.done;
        parent.done = allChildrenDone;

        if (parent.done && !oldDone) {
            const now = new Date();
            const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
            parent.completedAt = `${now.toLocaleDateString(localeStr)} ${t('at')} ${now.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;
        } else if (!parent.done) {
            parent.completedAt = null;
        }

        currentParentIdx = getParentIndex(items, currentParentIdx);
    }
}

export function toggleChecklistItem(reminderId, index) {
    const reminder = state.reminders.find(r => r.id === reminderId);
    if (reminder && reminder.checklist && reminder.checklist[index]) {
        const items = reminder.checklist;
        items[index].done = !items[index].done;

        if (items[index].done) {
            const now = new Date();
            const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
            const date = now.toLocaleDateString(localeStr);
            const time = now.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' });
            items[index].completedAt = `${date} ${t('at')} ${time}`;
        } else {
            items[index].completedAt = null;
        }

        // Propaga o status na hierarquia
        propagateChecklistStatus(items, index);

        saveReminders();

        const modal = el('viewReminderModal');
        if (modal && modal.classList.contains('active')) {
            openViewModal(reminderId);
        }
    }
}

// ─── Modais de Imagem ─────────────────────────────────────────────────────────
export function openImageModal(src) {
    const modal = el('imageModal');
    const content = el('imageModalContent');
    if (!modal || !content) return;
    content.src = src;
    modal.classList.add('active');
    modal.style.display = 'flex';
}

export function closeImageModal() {
    const modal = el('imageModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = '';
    }
}

export function handleCopyImageFromModal() {
    const content = el('imageModalContent');
    if (content && content.src) {
        copyImageToClipboard(content.src, true, t('imageCopiedNotification'));
    }
}

async function copyImageToClipboard(base64Src, showNotify = true, customMsg = null) {
    try {
        const response = await fetch(base64Src);
        const originalBlob = await response.blob();

        let blobToCopy = originalBlob;
        if (originalBlob.type !== 'image/png') {
            const img = new Image();
            const canvas = document.createElement('canvas');
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => { blobToCopy = blob; resolve(); }, 'image/png');
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(originalBlob);
            });
        }

        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobToCopy })]);
        if (showNotify) showNotification(customMsg || t('imageCopied'), 'success');
    } catch (e) {
        showNotification(t('imageCopyError') || 'Erro ao copiar imagem.', 'error');
    }
}

// ─── Share via WhatsApp ───────────────────────────────────────────────────────
export async function shareReminderViaWhatsApp(id) {
    const reminder = state.reminders.find(r => r.id === id);
    if (!reminder) return;

    let text = `*${reminder.title.toUpperCase()}*\n`;
    text += `---------------------------------\n\n`;

    if (reminder.description) {
        let desc = reminder.description
            .replace(/<b>(.*?)<\/b>/gi, '*$1*')
            .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
            .replace(/<i>(.*?)<\/i>/gi, '_$1_')
            .replace(/<em>(.*?)<\/em>/gi, '_$1_')
            .replace(/<ul>/gi, '')
            .replace(/<\/ul>/gi, '\n')
            .replace(/<li>(.*?)<\/li>/gi, '\u2022 $1\n')
            .replace(/<div>/gi, '')
            .replace(/<\/div>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/&nbsp;/g, ' ')
            .replace(/<[^>]+>/g, '');
        text += desc.trim() + '\n\n';
    }

    if (reminder.checklist && reminder.checklist.length > 0) {
        text += `*${t('sharedReminderChecklist')}*\n`;
        const isNumbered = !!reminder.checklistNumbered;
        const numbers = isNumbered ? getChecklistNumbers(reminder.checklist) : [];
        reminder.checklist.forEach((item, index) => {
            const level = item.level || 0;
            const indent = '    '.repeat(level);
            const numPrefix = isNumbered ? `${numbers[index]} ` : '';
            text += `${indent}${item.done ? '[V]' : '[ ]'} ${numPrefix}${item.text}\n`;
        });
        text += '\n';
    }

    if (reminder.dueDate) {
        text += `*${t('sharedReminderDueDate')}:* ${getDueDateText(reminder.dueDate)} (${new Date(reminder.dueDate + 'T00:00:00').toLocaleDateString(state.currentLang === 'pt' ? 'pt-BR' : 'en-US')})\n\n`;
    }

    if (reminder.links && reminder.links.length > 0) {
        text += `*${t('sharedReminderLinks')}*\n`;
        reminder.links.forEach(link => { text += `${link}\n`; });
        text += '\n';
    }

    if (reminder.images && reminder.images.length > 0) {
        text += `*${t('sharedReminderImagesNote')}*\n`;
        text += `_[Imagens anexadas ao lembrete original]_\n\n`;
        await copyImageToClipboard(reminder.images[0], true, t('imageCopiedNotification'));
    }

    text += `---------------------------------\n`;
    text += `_${t('sentVia')}_`;

    const textWithoutEmojis = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
    window.open(`https://wa.me/?text=${encodeURIComponent(textWithoutEmojis)}`, '_blank');
}

// ─── Gestão de Tags ───────────────────────────────────────────────────────────
export function openTagSelection(context = 'create') {
    state.tagSelectionContext = context;
    const modal = el('tagSelectionModal');
    if (modal) {
        renderTagSelectionList();
        modal.classList.add('active');
    }
}

export function renderTagSelectionList() {
    const list = el('tagSelectionList');
    if (!list) return;

    const allUsedTags = new Set(state.customTags);
    state.reminders.forEach(r => (r.tags || []).forEach(tag => allUsedTags.add(tag)));
    const sortedTags = Array.from(allUsedTags).sort();

    list.innerHTML = sortedTags.map(tag => `
        <div class="tag-selection-item ${state.selectedTags.includes(tag) ? 'selected' : ''}" 
             data-action="toggle-tag" data-tag="${escapeHtml(tag)}"
             style="padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-glass); cursor: pointer; background: ${state.selectedTags.includes(tag) ? 'var(--primary)' : 'var(--bg-glass)'}; font-size: 13px; display: flex; align-items: center; gap: 8px;">
            <span style="flex: 1;">${escapeHtml(tag)}</span>
            <div style="display: flex; gap: 4px;">
                <button class="tag-action-btn" data-action="edit-tag" data-tag="${escapeHtml(tag)}" 
                        style="background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 2px;" title="${t('editTag')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="tag-action-btn" data-action="delete-tag" data-tag="${escapeHtml(tag)}" 
                        style="background: none; border: none; color: var(--accent-error); cursor: pointer; padding: 2px;" title="${t('deleteTag')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('') || `<p style="font-size: 12px; color: var(--text-dim);">${t('noTagsAuto')}</p>`;
}

export function toggleTagSelection(tag) {
    const idx = state.selectedTags.indexOf(tag);
    if (idx > -1) state.selectedTags.splice(idx, 1);
    else state.selectedTags.push(tag);
    renderSelectedTagsDisplay();
    renderTagSelectionList();
}

export function closeTagSelection() {
    const modal = el('tagSelectionModal');
    if (modal) modal.classList.remove('active');
}

export function confirmTagSelection() {
    closeTagSelection();
}

export async function addNewTagToSelection() {
    const input = el('newTagInput');
    const tag = input ? input.value.trim() : '';
    if (tag && !state.selectedTags.includes(tag)) {
        state.selectedTags.push(tag);
        if (!state.customTags.includes(tag)) {
            state.customTags.push(tag);
            await saveCustomTags();
        }
        renderSelectedTagsDisplay();
        renderTagSelectionList();
        if (input) input.value = '';
    }
}

export async function editTag(oldTag) {
    const newTag = prompt(t('newTagName'), oldTag);
    if (newTag && newTag.trim() && newTag !== oldTag) {
        const trimmedNewTag = newTag.trim();

        const idx = state.customTags.indexOf(oldTag);
        if (idx !== -1) state.customTags[idx] = trimmedNewTag;
        else state.customTags.push(trimmedNewTag);

        state.reminders.forEach(r => {
            if (r.tags && r.tags.includes(oldTag)) {
                r.tags = r.tags.map(tag => tag === oldTag ? trimmedNewTag : tag);
            }
        });

        state.selectedTags = state.selectedTags.map(tag => tag === oldTag ? trimmedNewTag : tag);

        await saveCustomTags();
        await saveReminders();
        window._reminderRender && window._reminderRender();
        renderTagSelectionList();
        renderSelectedTagsDisplay();
        showNotification(t('tagEdited'), 'success');
    }
}

export async function deleteTag(tag) {
    if (confirm(t('confirmDeleteTag'))) {
        state.customTags = state.customTags.filter(t => t !== tag);
        state.reminders.forEach(r => {
            if (r.tags) r.tags = r.tags.filter(rt => rt !== tag);
        });
        state.selectedTags = state.selectedTags.filter(t => t !== tag);

        await saveCustomTags();
        await saveReminders();
        window._reminderRender && window._reminderRender();
        renderTagSelectionList();
        renderSelectedTagsDisplay();
        showNotification(t('tagDeleted'), 'success');
    }
}

export function renderSelectedTagsDisplay() {
    const display = el('selectedTagsDisplay');
    const displayEdit = el('selectedTagsDisplayEdit');

    const html = state.selectedTags.map(tag => `
        <span class="glass-btn" style="font-size: 11px; padding: 4px 10px; border-color: var(--primary); display: flex; align-items: center; gap: 6px;" data-action="remove-tag" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)} 
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
    `).join('');

    if (display) display.innerHTML = html;
    if (displayEdit) displayEdit.innerHTML = html;
}

export function removeSelectedTag(tag) {
    state.selectedTags = state.selectedTags.filter(t => t !== tag);
    renderSelectedTagsDisplay();
    renderTagSelectionList();
}

export function openPasswordModal(id, action) {
    state.passwordModalPendingId = id;
    state.passwordModalPendingAction = action;
    const modal = el('passwordModal');
    const input = el('modalPasswordInput');
    const error = el('passwordError');
    if (input) input.value = '';
    if (error) error.style.display = 'none';
    if (modal) modal.classList.add('active');
    if (input) setTimeout(() => input.focus(), 100);
}

export function closePasswordModal() {
    const modal = el('passwordModal');
    if (modal) modal.classList.remove('active');
    state.passwordModalPendingId = null;
    state.passwordModalPendingAction = null;
}

export function handlePasswordUnlock() {
    const id = state.passwordModalPendingId;
    const action = state.passwordModalPendingAction;
    const reminder = state.reminders.find(r => r.id === id);
    if (!reminder) return;

    const input = el('modalPasswordInput');
    const error = el('passwordError');

    if (input && input.value === reminder.password) {
        state.unlockedReminders.add(reminder.id);
        closePasswordModal();
        if (action === 'edit') openEditModal(id);
        else openViewModal(id);
        window._reminderRender && window._reminderRender();
    } else {
        if (error) error.style.display = 'block';
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

export async function deleteReminderWithoutPassword() {
    const id = state.passwordModalPendingId;
    if (!id) return;
    
    if (confirm(t('confirmDelete'))) {
        state.reminders = state.reminders.filter(r => r.id !== id);
        await saveReminders();
        closePasswordModal();
        window._reminderRender && window._reminderRender();
        showNotification(t('deleted'));
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init(renderCallback) {
    // Expõe o callback de render para que as funções do módulo possam acionar re-render
    window._reminderRender = renderCallback;
    console.log('Remind.hub: reminders.js inicializado.');
}
