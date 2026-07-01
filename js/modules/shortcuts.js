// js/modules/shortcuts.js
import { state, SHORTCUTS_KEY, CATEGORIES_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { t } from '../i18n.js';
import { showNotification, escapeHtml } from '../utils.js';

function render() {
    if (window.render) window.render();
}
function updateDashboardStats() {
    if (window.updateDashboardStats) window.updateDashboardStats();
}

export async function loadShortcuts() {
    try {
        state.shortcuts = await getStorageData(SHORTCUTS_KEY, []);
        if (!Array.isArray(state.shortcuts)) state.shortcuts = [];
        state.shortcuts = state.shortcuts.filter(s => s !== null && typeof s === 'object');

        // Migration: Ensure all state.shortcuts have a categoryId
        await loadCategories();
        if (state.categories.length === 0) {
            // Create default category
            state.categories.push({ id: 'default', name: t('defaultCategory') || 'Geral' });
            await saveCategories();
        }

        state.shortcuts.forEach(s => {
            if (!s.categoryId) {
                s.categoryId = 'default';
            }
        });
    } catch (e) {
        state.shortcuts = [];
    }
}

export async function saveShortcuts() {
    await setStorageData(SHORTCUTS_KEY, state.shortcuts);
    updateDashboardStats();
    renderShortcuts();
}

export async function loadCategories() {
    try {
        state.categories = await getStorageData(CATEGORIES_KEY, []);
        if (!Array.isArray(state.categories)) state.categories = [];

        // Ensure default category exists if not empty
        if (state.categories.length === 0) {
            const hasShortcuts = state.shortcuts.length > 0;
            if (hasShortcuts) {
                state.categories.push({ id: 'default', name: t('defaultCategory') || 'Geral' });
                await saveCategories();
            }
        }
    } catch (e) {
        state.categories = [];
    }
}

export async function saveCategories() {
    await setStorageData(CATEGORIES_KEY, state.categories);
    renderShortcuts();
}
export function addShortcut() {
    const titleInput = document.getElementById('shortcutTitle');
    const urlInput = document.getElementById('shortcutUrl');
    const categorySelect = document.getElementById('shortcutCategory');

    let title = titleInput.value.trim();
    let url = urlInput.value.trim();
    let categoryId = categorySelect.value || 'default';

    if (!url) {
        showNotification(t('urlRequired'), 'error');
        return;
    }

    if (!url.startsWith('http')) url = 'https://' + url;
    if (!title) {
        try { title = new URL(url).hostname.replace('www.', ''); } catch (e) { title = url; }
    }

    state.shortcuts.push({ id: Date.now(), title, url, categoryId });
    saveShortcuts();

    titleInput.value = '';
    urlInput.value = '';
    const modal = document.getElementById('shortcutModal');
    if (modal) modal.classList.remove('active');
    showNotification(t('shortcutSaved'));
}

export function deleteShortcut(id) {
    state.shortcuts = state.shortcuts.filter(s => s.id !== id);
    saveShortcuts();
    showNotification(t('shortcutRemoved'));
}

export function renderShortcuts() {
    const dashGrid = document.getElementById('dash-shortcut-grid');
    const fullGrid = document.getElementById('full-shortcut-grid');

    let filtered = state.shortcuts;
    if (state.searchQuery) {
        filtered = filtered.filter(s =>
            s.title.toLowerCase().includes(state.searchQuery) ||
            s.url.toLowerCase().includes(state.searchQuery)
        );
    }

    const renderItem = (s, showDelete = true) => {
        if (!s) return '';
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${s.url}&sz=64`;

        return `
        <div class="shortcut-item" data-action="open-url" data-id="${s.id}" data-url="${s.url}" title="${escapeHtml(s.title)}" style="position: relative;">
            <div class="shortcut-icon-wrapper">
                <img src="${faviconUrl}" alt="" class="shortcut-icon" draggable="false" onerror="this.src='icons/icon16.png'; this.style.filter='grayscale(1)'">
            </div>
            <span class="shortcut-name" style="pointer-events: none;">${escapeHtml(s.title)}</span>
            
            <div class="drag-handle" style="position: absolute; bottom: 37%; right: -5px; opacity: 0; transition: var(--transition); pointer-events: none;">
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5;"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </div>

            ${showDelete ? `
                <button data-action="delete-shortcut" data-id="${s.id}" 
                        style="position: absolute; top: -5px; right: 5px; background: var(--accent-error); color: white; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 1; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            ` : ''}
        </div>
    `;
    };

    const renderGrouped = (container, showDelete = true) => {
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<p style="color: var(--text-dim); font-size: 14px;">${t('noShortcuts')}</p>`;
            return;
        }

        let html = '';
        state.categories.forEach(cat => {
            const catShortcuts = filtered.filter(s => s.categoryId === cat.id);
            // Renderiza se tiver conteúdo OU se não houver busca (para permitir drop em categorias vazias)
            if (catShortcuts.length > 0 || !state.searchQuery) {
                html += `
                    <div class="category-container" data-id="${cat.id}" style="margin-bottom: 5px; position: relative;">
                        <div class="category-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-glass);">
                            <div class="drag-handle category-drag" style="position: relative; top: auto; right: auto; bottom: -1px; cursor: grab; opacity: 0.5;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                            </div>
                            <h4 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--primary);">${escapeHtml(cat.name)}</h4>
                        </div>
                        <div class="shortcut-list-grouped" data-category-id="${cat.id}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 12px;">
                            ${catShortcuts.map(s => renderItem(s, showDelete)).join('')}
                        </div>
                    </div>
                `;
            }
        });
        if (container.innerHTML !== html) {
            container.innerHTML = html;
        }
    };

    renderGrouped(dashGrid, false);
    renderGrouped(fullGrid, state.isShortcutEditMode);
}

// Category Management
export function openCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        renderCategoryList();
        modal.classList.add('active');
    }
}

export function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) modal.classList.remove('active');
    render(); // Update everything
}

export function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    if (name) {
        state.categories.push({ id: 'cat_' + Date.now(), name });
        saveCategories();
        input.value = '';
        renderCategoryList();
    }
}

export function deleteCategory(id) {
    if (id === 'default') {
        showNotification('Não é possível excluir a categoria padrão.', 'error');
        return;
    }

    // Move state.shortcuts to default category
    state.shortcuts.forEach(s => {
        if (s.categoryId === id) s.categoryId = 'default';
    });

    state.categories = state.categories.filter(c => c.id !== id);
    saveCategories();
    saveShortcuts();
    renderCategoryList();
}

export function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (!list) return;

    list.innerHTML = state.categories.map(cat => `
        <div class="category-list-item" style="display: flex; align-items: center; justify-content: space-between; background: var(--border-glass); padding: 8px 12px; border-radius: 10px;">
            <span style="font-size: 14px;">${escapeHtml(cat.name)} ${cat.id === 'default' ? '(Padrão)' : ''}</span>
            ${cat.id !== 'default' ? `
                <button class="glass-btn danger" style="padding: 6px;" data-action="delete-category" data-id="${cat.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            ` : ''}
        </div>
    `).join('');
}
