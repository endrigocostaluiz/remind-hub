// js/modules/vault.js
import { state, VAULT_REMINDERS_KEY, VAULT_PASS_KEY, VAULT_HINT_KEY } from '../state.js';
import { t } from '../i18n.js';
import { getStorageData, setStorageData } from '../storage.js';
import { showNotification, escapeHtml } from '../utils.js';
import { renderCard, openViewModal } from './reminders.js';
import { showView, enableDragAndDrop } from './ui.js';

const el = (id) => document.getElementById(id);

export async function initVault() {
    state.vaultReminders = await getStorageData(VAULT_REMINDERS_KEY, []);
    state.vaultPassword = await getStorageData(VAULT_PASS_KEY, null);
    state.vaultHint = await getStorageData(VAULT_HINT_KEY, null);
    state.activeVaultTagFilter = null;
}

export function handleVaultNavigation() {
    if (!state.vaultPassword) {
        openVaultSetup();
    } else {
        openVaultAccess();
    }
}

function openVaultSetup() {
    const modal = el('vaultSetupModal');
    if (modal) {
        el('vaultSetupPassword').value = '';
        el('vaultSetupHint').value = '';
        modal.classList.add('active');
    }
}

export function closeVaultSetup() {
    const modal = el('vaultSetupModal');
    if (modal) modal.classList.remove('active');
}

export async function saveVaultSetup() {
    const pass = el('vaultSetupPassword').value.trim();
    const hint = el('vaultSetupHint').value.trim();
    
    if (!pass) {
        showNotification(t('passwordRequired'), 'error');
        return;
    }

    if (!hint) {
        showNotification(t('hintRequired'), 'error');
        return;
    }
    
    state.vaultPassword = pass;
    state.vaultHint = hint;
    
    await setStorageData(VAULT_PASS_KEY, pass);
    await setStorageData(VAULT_HINT_KEY, hint);
    
    showNotification(t('settingsSaved'));
    closeVaultSetup();
    openVaultAccess();
}

function openVaultAccess() {
    const modal = el('vaultAccessModal');
    if (modal) {
        el('vaultAccessPassword').value = '';
        el('vaultHintDisplay').style.display = 'none';
        modal.classList.add('active');
    }
}

export function closeVaultAccess() {
    const modal = el('vaultAccessModal');
    if (modal) modal.classList.remove('active');
}

export function unlockVault() {
    const pass = el('vaultAccessPassword').value;
    if (pass === state.vaultPassword) {
        state.isVaultUnlocked = true;
        closeVaultAccess();
        showView('vault');
        renderVault();
    } else {
        showNotification(t('wrongPassword'), 'error');
    }
}

export function showVaultHint() {
    const display = el('vaultHintDisplay');
    if (display) {
        display.innerText = state.vaultHint || t('noTags');
        display.style.display = 'block';
    }
}

export async function confirmVaultReset() {
    if (confirm(t('vaultResetConfirm'))) {
        state.vaultReminders = [];
        state.vaultPassword = null;
        state.vaultHint = null;
        state.isVaultUnlocked = false;
        
        await setStorageData(VAULT_REMINDERS_KEY, []);
        await setStorageData(VAULT_PASS_KEY, null);
        await setStorageData(VAULT_HINT_KEY, null);
        
        showNotification(t('deleted'));
        closeVaultAccess();
        handleVaultNavigation();
    }
}

export function renderVault() {
    const grid = el('vault-reminders-grid');
    if (!grid) return;
    
    renderVaultTagFilter();
    
    let reminders = state.vaultReminders || [];
    
    // Apply search filter
    const query = state.searchQuery ? state.searchQuery.toLowerCase() : '';
    if (query) {
        reminders = reminders.filter(r => 
            r.title.toLowerCase().includes(query) || 
            (r.description && r.description.toLowerCase().includes(query))
        );
    }

    // Apply tag filter
    if (state.activeVaultTagFilter) {
        reminders = reminders.filter(r => r.tags && r.tags.includes(state.activeVaultTagFilter));
    }
    
    const countTotal = el('vault-count-total');
    if (countTotal) countTotal.innerText = reminders.length;
    
    if (reminders.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-dim); width:100%;" data-i18n="noReminders">${t('noReminders')}</div>`;
    } else {
        grid.innerHTML = reminders.map(r => `
            <div class="reminder-card-clickable" data-id="${r.id}" style="cursor:pointer">
                ${renderCard(r)}
            </div>
        `).join('');
        
        // Add click listeners to open view modal
        grid.querySelectorAll('.reminder-card-clickable').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.card-actions')) return;
                const id = parseInt(card.dataset.id);
                openViewModal(id);
            });
        });

        // Initialize Drag and Drop (only if no tags are selected)
        if (!state.activeVaultTagFilter) {
            enableDragAndDrop('#vault-reminders-grid .reminder-card-premium', state.vaultReminders, saveVaultReminders);
        }
    }
}

export function renderVaultTagFilter() {
    const container = el('vault-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.vaultReminders.forEach(r => {
        if (r.tags) r.tags.forEach(tag => allTags.add(tag));
    });

    if (allTags.size === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    let html = `<div class="tag-badge ${!state.activeVaultTagFilter ? 'active' : ''}" data-vault-tag="">${t('all')}</div>`;
    
    Array.from(allTags).sort().forEach(tag => {
        html += `<div class="tag-badge ${state.activeVaultTagFilter === tag ? 'active' : ''}" data-vault-tag="${tag}">${tag}</div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.tag-badge').forEach(badge => {
        badge.addEventListener('click', () => {
            state.activeVaultTagFilter = badge.dataset.vaultTag || null;
            renderVault();
        });
    });
}

export async function saveVaultReminders() {
    await setStorageData(VAULT_REMINDERS_KEY, state.vaultReminders);
}
