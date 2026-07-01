// js/main.js
import { state, STREAMS_KEY, STORAGE_KEY, SHORTCUTS_KEY, NEWS_CACHE_KEY, LAST_SEEN_NEWS_KEY, READ_NEWS_KEY, STREAMS_INTERVAL_KEY, NEWS_REFRESH_INTERVAL_KEY, NEWS_PER_SITE_KEY, NOTIFICATION_TIME_KEY, SIDEBAR_COLLAPSED_KEY, THEME_KEY, LANG_KEY, SMART_ADD_ENABLED_KEY, YT_PLAYER_MODE_KEY, ACCENT_COLOR_KEY, CHANGELOG_VERSION_KEY, VAULT_REMINDERS_KEY, CONTACTS_KEY } from './state.js';
import { getStorageData, setStorageData, migrateToChromeStorage } from './storage.js';
import { t, updateUIForLanguage, updateSidebarLanguageToggle, updateAppVersion } from './i18n.js';
import { showNotification, escapeHtml, generateCalendarLink } from './utils.js';

import { loadContacts, openContactFormModal, closeContactFormModal, saveContact, renderContacts, openViewContactModal, closeViewContactModal, shareContactViaWhatsApp, removeSelectedContactTag, init as initContacts, openContactTagSelection, toggleContactTagSelection, addNewContactTagToSelection, editContactTag, deleteContactTag, confirmContactTagSelection, setContactsLayout, openContactFolder, goBackContactsFolders } from './modules/contacts.js';

// Modules
import {
    loadReminders, saveReminders, addReminder, saveEditReminder, markAsCompleted, 
    renderReminders, renderCard, updateDashboardStats, toggleChecklistItem,
    openEditModal, closeEditModal, deleteFromModal, openViewModal, closeViewModal,
    openImageModal, closeImageModal, handleCopyImageFromModal,
    shareReminderViaWhatsApp, openTagSelection, toggleTagSelection, editTag, deleteTag,
    confirmTagSelection, addNewTagToSelection, removeSelectedTag, 
    renderDashboardTagFilter, renderRemindersTagFilter, renderCalendarTagFilter,
    loadCustomTags, clearForm, addLinkInput, removeLinkInput, addEditLinkInput, removeEditLinkInput,
    addChecklistItem, removeChecklistItem, addEditChecklistItem, removeEditChecklistItem,
    indentChecklistItem, outdentChecklistItem, indentEditChecklistItem, outdentEditChecklistItem,
    renderChecklistContainer, renderEditChecklistContainer,
    renderImagePreview, renderEditImagePreview, removeImage, removeEditImage,
    rescheduleAllNotifications, closePasswordModal, handlePasswordUnlock, deleteReminderWithoutPassword, init as initReminders,
    findReminderById
} from './modules/reminders.js';
import {
    initVault,
    handleVaultNavigation,
    unlockVault,
    showVaultHint,
    confirmVaultReset,
    saveVaultSetup,
    closeVaultSetup,
    closeVaultAccess,
    renderVault
} from './modules/vault.js';

window.renderVault = renderVault;


import { loadSessions, saveBrowserSession, renderSessions, restoreSession, deleteSession, renameSession } from './modules/sessions.js';
import { loadPipApps, addPipApp, deletePipApp, renderPipApps, openAppInPip, savePipApps, togglePipAppEditMode, openPipAppModal } from './modules/pipApps.js';
import { loadShortcuts, saveShortcuts, loadCategories, saveCategories, addShortcut, deleteShortcut, renderShortcuts, openCategoryModal, closeCategoryModal, addCategory, deleteCategory } from './modules/shortcuts.js';
import { loadStreams, saveStreams, checkAllStreamsStatus, renderStreams, addStream, deleteStream, toggleStreamSelection, updateMultiViewButton, openMultiViewModal, closeMultiViewModal, toggleMultiViewFullScreen, updateStreamsSidebarIndicator, openLivePip, renderStreamsPreview } from './modules/streams.js';
import { loadNewsPreferences, saveNewsPreferences, loadAndRenderNews, addNewsSource, deleteNewsSource, renderNewsPreview, updateNewsSidebarIndicator } from './modules/news.js';
import { initCalendar, renderCalendar } from './modules/calendar.js';
import { initKanban, renderKanban } from './modules/kanban.js';
import { initSync, handleSyncLogin, handleSyncLogout, deleteSyncBackup, toggleSyncPause } from './modules/sync.js';

// UI Helpers
import { applyTheme, toggleTheme, showView, enableDragAndDrop, processImage, renderChangelog, applyAccentColor } from './modules/ui.js';

window.renderKanban = renderKanban;
window.initKanban = initKanban;

// Initialize
async function init() {
    // Apply accent color as early as possible to avoid FOUC
    const savedAccentColor = await getStorageData(ACCENT_COLOR_KEY, '#00C080');
    state.accentColor = savedAccentColor;
    applyAccentColor(savedAccentColor);

    await migrateToChromeStorage();
    await Promise.all([
        loadReminders(),
        loadCustomTags(),
        loadShortcuts(),
        loadCategories(),
        loadStreams(),
        loadSessions(),
        loadPipApps(),
        loadContacts(),
        initVault(),
        loadPreferences()
    ]);

    initContacts();

    state.isSidebarCollapsed = await getStorageData(SIDEBAR_COLLAPSED_KEY, false);
    
    applyTheme();
    updateAppVersion();
    updateSidebarLanguageToggle();
    
    render();

    // Iniciar verificações em segundo plano
    setTimeout(async () => {
        await checkAllStreamsStatus();
        await loadAndRenderNews(true); // Silent mode on initial check
    }, 100);

    attachEventListeners();
    renderChangelog();
    initKanban();
    initSync();

    // Live Sync from Storage
    chrome.storage.onChanged.addListener(async (changes) => {
        if (changes[STREAMS_KEY]) {
            state.streams = changes[STREAMS_KEY].newValue || [];
            if (state.currentView === 'streams') renderStreams();
            updateStreamsSidebarIndicator();
        }
        if (changes[STORAGE_KEY]) {
            state.reminders = changes[STORAGE_KEY].newValue || [];
            if (state.currentView === 'dashboard') {
                renderReminders();
                updateDashboardStats();
            } else if (state.currentView === 'kanban' && window.renderKanban) {
                window.renderKanban();
            } else if (state.currentView === 'calendar' && window.renderCalendar) {
                window.renderCalendar();
            }
        }
        if (changes[VAULT_REMINDERS_KEY]) {
            state.vaultReminders = changes[VAULT_REMINDERS_KEY].newValue || [];
            if (state.currentView === 'vault') renderVault();
        }
        if (changes[SHORTCUTS_KEY]) {
            state.shortcuts = changes[SHORTCUTS_KEY].newValue || [];
            if (state.currentView === 'dashboard') renderShortcuts();
        }
        if (changes[NEWS_CACHE_KEY] || changes[LAST_SEEN_NEWS_KEY] || changes[READ_NEWS_KEY]) {
            if (changes[NEWS_CACHE_KEY]) state.cachedNewsData = changes[NEWS_CACHE_KEY].newValue || [];
            if (changes[LAST_SEEN_NEWS_KEY]) state.lastSeenNewsUrls = changes[LAST_SEEN_NEWS_KEY].newValue || [];
            if (changes[READ_NEWS_KEY]) state.readNewsUrls = changes[READ_NEWS_KEY].newValue || [];
            
            updateNewsSidebarIndicator();
            if (state.currentView === 'news') applyNewsFilter();
            if (state.currentView === 'dashboard') renderNewsPreview();
        }
        if (changes[CONTACTS_KEY]) {
            state.contacts = changes[CONTACTS_KEY].newValue || [];
            if (state.currentView === 'contacts') renderContacts();
        }
    });

    // Live Sync from Background (Fast Path)
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'streams-updated') {
            state.streams = request.streams;
            if (state.currentView === 'streams') renderStreams();
            if (state.currentView === 'dashboard') renderStreamsPreview();
            updateStreamsSidebarIndicator();
        }
    });

    // Check for updates on startup
    setTimeout(() => handleCheckUpdate(true), 2000);

    // Check for new version changelog
    setTimeout(checkChangelog, 500);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    ['dueDate', 'editDueDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('min', todayStr);
    });

    renderDashboardDate();

    initReminders(() => render());
    initCalendar();
}

export function renderDashboardDate() {
    const dashboardDate = document.getElementById('dashboardDate');
    if (dashboardDate) {
        const today = new Date();
        const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
        dashboardDate.innerText = today.toLocaleDateString(localeStr, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
}

async function loadPreferences() {
    state.streamCheckInterval = await getStorageData(STREAMS_INTERVAL_KEY, 5);
    state.isDarkMode = (await getStorageData(THEME_KEY)) !== false;
    state.currentLang = (await getStorageData(LANG_KEY)) || 'pt';
    state.newsRefreshInterval = await getStorageData(NEWS_REFRESH_INTERVAL_KEY, 60);
    state.newsPerSite = await getStorageData(NEWS_PER_SITE_KEY, 10);
    state.youtubePlayerMode = await getStorageData(YT_PLAYER_MODE_KEY, 'standard');

    updateUIForLanguage();
    
    // Sync UI elements
    const elements = {
        'streamCheckInterval': state.streamCheckInterval,
        'notificationTime': await getStorageData(NOTIFICATION_TIME_KEY, '09:00'),
        'enableSmartAdd': await getStorageData(SMART_ADD_ENABLED_KEY, true),
        'youtubePlayerMode': state.youtubePlayerMode,
        'newsRefreshInterval': state.newsRefreshInterval,
        'newsPerSiteLimit': state.newsPerSite
    };

    for (const [id, val] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') el.checked = val;
            else el.value = val;
        }
    }

    const intervalDisplay = document.getElementById('intervalValueDisplay');
    if (intervalDisplay) intervalDisplay.innerText = `${state.streamCheckInterval} min`;
    
    const newsRefDisplay = document.getElementById('newsRefValueDisplay');
    if (newsRefDisplay) newsRefDisplay.innerText = `${state.newsRefreshInterval} min`;

    await loadNewsPreferences();
}

async function savePreferences() {
    await Promise.all([
        setStorageData(THEME_KEY, state.isDarkMode),
        setStorageData(LANG_KEY, state.currentLang),
        setStorageData(STREAMS_INTERVAL_KEY, state.streamCheckInterval),
        setStorageData(NEWS_REFRESH_INTERVAL_KEY, state.newsRefreshInterval),
        setStorageData(NEWS_PER_SITE_KEY, state.newsPerSite),
        setStorageData(YT_PLAYER_MODE_KEY, state.youtubePlayerMode),
        setStorageData(SMART_ADD_ENABLED_KEY, document.getElementById('enableSmartAdd')?.checked),
        setStorageData(NOTIFICATION_TIME_KEY, document.getElementById('notificationTime')?.value)
    ]);
    await saveNewsPreferences();
}

function render() {
    window.render = render; // Backward compatibility with modules calling render()
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', state.isSidebarCollapsed);

    renderDashboardTagFilter();
    renderRemindersTagFilter();
    renderCalendarTagFilter();
    renderReminders();
    renderSessions();
    renderPipApps();
    renderShortcuts();
    renderStreams();
    renderCategorySelect();
    updateDashboardStats();
    updateStreamsSidebarIndicator();
    updateNewsSidebarIndicator();
    updateMultiViewButton();
    renderStreamsPreview();
    renderNewsPreview();
    renderKanban();
    renderContacts();
    if (typeof renderVault === 'function') renderVault();

    if (typeof renderCalendar === 'function') renderCalendar();

    // Re-enable D&D after render
    setTimeout(() => {
        enableDragAndDrop('.reminder-card-premium', state.reminders, saveReminders);
        enableDragAndDrop('.shortcut-item', state.shortcuts, saveShortcuts);
        enableDragAndDrop('.category-container', state.categories, saveCategories);
        enableDragAndDrop('.stream-card', state.streams, saveStreams);
        enableDragAndDrop('.pip-app-card', state.pipApps, savePipApps);
        enableDragAndDrop('.pip-app-shortcut', state.pipApps, savePipApps);
        if (state.currentView === 'vault') {
            enableDragAndDrop('#vault-reminders-grid .reminder-card-premium', state.vaultReminders, () => import('./modules/vault.js').then(m => m.saveVaultReminders()));
        }
    }, 100);
}

function attachEventListeners() {
    // Sidebar Navigation
    document.querySelectorAll('[data-view]:not([data-action="set-dash-view"])').forEach(link => {
        link.addEventListener('click', () => {
            if (link.dataset.view === 'vault') {
                handleVaultNavigation();
            } else {
                showView(link.dataset.view);
            }
        });
    });

    // CRUD & UI
    const bindings = {
        'btnAdd': addReminder,
        'btnClear': clearForm,
        'btnSaveSession': saveBrowserSession,
        'btnAddLink': addLinkInput,
        'btnAddEditLink': addEditLinkInput,
        'btnDeleteFromModal': deleteFromModal,
        'btnSelectTags': () => openTagSelection('create'),
        'btnSelectTagsEdit': () => openTagSelection('edit'),
        'btnAddChecklistItem': addChecklistItem,
        'btnAddEditChecklistItem': addEditChecklistItem,
        'btnSaveShortcut': addShortcut,
        'btnSavePipApp': addPipApp,
        'btnEditPipApps': togglePipAppEditMode,
        'btnNewPipApp': () => openPipAppModal(),
        'themeToggleDashboard': toggleTheme,
        'btnExportData': exportData,
        'btnImportData': () => document.getElementById('importFileInput').click(),
        'btnSaveCategory': addCategory,
        'btnSaveStream': addStream,
        'btnToggleSidebar': async () => {
            state.isSidebarCollapsed = document.querySelector('.sidebar').classList.toggle('collapsed');
            await setStorageData(SIDEBAR_COLLAPSED_KEY, state.isSidebarCollapsed);
        },
        'btnRefreshNews': async () => {
             const btn = document.getElementById('btnRefreshNews');
             const icon = btn.querySelector('svg');
             if (icon) {
                 btn.disabled = true;
                 icon.classList.add('spinning');
             }
             try {
                 const startTime = Date.now();
                 await loadAndRenderNews(false);
                 const elapsed = Date.now() - startTime;
                 if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
                 showNotification(t('newsUpdated'), 'success');
             } catch (e) {
                 console.error('Error refreshing news:', e);
             } finally {
                 if (icon) {
                     btn.disabled = false;
                     icon.classList.remove('spinning');
                 }
             }
        },
        'btnAddNewsSource': addNewsSource,
        'btnRefreshStreams': async () => {
             const btn = document.getElementById('btnRefreshStreams');
             const icon = btn.querySelector('svg');
             if (icon) {
                 btn.disabled = true;
                 icon.classList.add('spinning');
             }
             try {
                 const startTime = Date.now();
                 await checkAllStreamsStatus();
                 const elapsed = Date.now() - startTime;
                 if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
                 showNotification(t('streamsUpdated'), 'success');
             } catch (e) {
                 console.error('Error refreshing streams:', e);
             } finally {
                 if (icon) {
                     btn.disabled = false;
                     icon.classList.remove('spinning');
                 }
             }
        },
        'btnOpenMultiView': () => {
            if (!state.isMultiViewSelectionMode) {
                state.isMultiViewSelectionMode = true;
                showNotification(t('selectChannelsMultiView'));
            } else {
                if (state.selectedStreamsForMultiView.length > 0) {
                    openMultiViewModal();
                } else {
                    state.isMultiViewSelectionMode = false;
                }
            }
            updateMultiViewButton();
            renderStreams();
        },
        'btnToggleStreamEdit': () => {
            state.isStreamEditMode = !state.isStreamEditMode;
            renderStreams();
        },
        'btnToggleShortcutEdit': () => {
            state.isShortcutEditMode = !state.isShortcutEditMode;
            renderShortcuts();
        },
        'btnCheckUpdate': handleCheckUpdate,
        'btnSendSuggestion': handleSendSuggestion,
        'btnShareWhatsApp': handleShareWhatsApp,
        'btnShareEmail': handleShareEmail,
        'btnCopyPix': handleCopyPix,
        'btnCopyPixModal': handleCopyPix,
        'btnNewContact': () => openContactFormModal(),
        'btnSaveContact': saveContact
    };

    for (const [id, fn] of Object.entries(bindings)) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }

    // Inputs
    const query = document.getElementById('globalSearch');
    if (query) query.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        render();
    });

    const picker = document.getElementById('accentColorPicker');
    if (picker) {
        picker.addEventListener('click', (e) => {
            const dot = e.target.closest('.color-dot');
            if (dot) {
                const color = dot.dataset.color;
                applyAccentColor(color);
                setStorageData(ACCENT_COLOR_KEY, color);
            }
        });
    }

    const imageInputs = ['imageInput', 'editImageInput'];
    imageInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            const targetList = id === 'imageInput' ? state.currentImages : state.editingImages;
            for (const file of files) {
                try { targetList.push(await processImage(file)); } catch (err) { showNotification('Erro ao processar imagem', 'error'); }
            }
            id === 'imageInput' ? renderImagePreview() : renderEditImagePreview();
            el.value = '';
        });
    });

    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', importData);

    document.getElementById('btnUnlockModal')?.addEventListener('click', handlePasswordUnlock);
    document.getElementById('btnDeleteLocked')?.addEventListener('click', deleteReminderWithoutPassword);
    document.getElementById('modalPasswordInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePasswordUnlock();
    });

    // Language Toggle logic
    const langToggles = ['customLanguageSelect', 'languageToggleSidebar'];
    langToggles.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', async () => {
            if (id === 'languageToggleSidebar') {
                state.currentLang = state.currentLang === 'pt' ? 'en' : 'pt';
                await savePreferences();
                updateUIForLanguage();
                renderDashboardDate();
                renderStreamsPreview();
                render();
            } else if (id === 'customLanguageSelect') {
                el.classList.toggle('active');
            }
        });
    });

    // Global Handlers
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('input', handleGlobalInput);
    
    // Alarms Sync
    ['streamCheckInterval', 'newsRefreshInterval', 'notificationTime', 'enableSmartAdd', 'youtubePlayerMode', 'newsPerSiteLimit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', async () => {
            if (id === 'notificationTime') {
                await rescheduleAllNotifications();
            } else {
                const val = parseInt(el.value);
                if (id === 'streamCheckInterval') state.streamCheckInterval = val;
                else state.newsRefreshInterval = val;
            }
            await savePreferences();
            showNotification(t('settingsSaved'));
        });
    });
}

function handleGlobalClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id ? parseInt(target.dataset.id) : null;
    const idx = target.dataset.index ? parseInt(target.dataset.index) : null;

    const actions = {
        'toggle-form': () => {
            const modal = document.getElementById('formModal');
            if (modal) {
                const isOpening = !modal.classList.contains('active');
                if (isOpening) {
                    clearForm();
                    // Hide/Show Kanban and Password options if in Vault
                    const kanbanGroup = document.getElementById('form-kanban-group');
                    const passwordGroup = document.getElementById('form-password-group');
                    if (state.currentView === 'vault') {
                        if (kanbanGroup) kanbanGroup.style.display = 'none';
                        if (passwordGroup) passwordGroup.style.display = 'none';
                    } else {
                        if (kanbanGroup) kanbanGroup.style.display = 'block';
                        if (passwordGroup) passwordGroup.style.display = 'block';
                    }
                }
                modal.classList.toggle('active');
            }
        },
        'remove-link': () => removeLinkInput(idx),
        'remove-edit-link': () => removeEditLinkInput(idx),
        'open-edit-modal': () => { e.stopPropagation(); openEditModal(id); },
        'view-image': () => {
            const reminder = state.reminders.find(r => r.id === parseInt(target.dataset.reminderId));
            if (reminder?.images?.[idx]) openImageModal(reminder.images[idx]);
        },
        'close-edit-modal': closeEditModal,
        'close-image-modal': closeImageModal,
        'copy-image-modal': handleCopyImageFromModal,
        'save-edit-reminder': saveEditReminder,
        'toggle-tag': () => toggleTagSelection(target.dataset.tag),
        'edit-tag': () => { e.stopPropagation(); editTag(target.dataset.tag); },
        'delete-tag': () => { e.stopPropagation(); deleteTag(target.dataset.tag); },
        'remove-tag': () => removeSelectedTag(target.dataset.tag),
        'add-new-tag': addNewTagToSelection,
        'remove-image': () => removeImage(idx),
        'remove-edit-image': () => removeEditImage(idx),
        'format': () => {
            const cmd = target.dataset.cmd;
            document.execCommand(cmd, false, null);
        },
        'unlock-vault': unlockVault,
        'show-vault-hint': showVaultHint,
        'confirm-vault-reset': confirmVaultReset,
        'save-vault-setup': saveVaultSetup,
        'close-vault-setup': closeVaultSetup,
        'close-vault-access': closeVaultAccess,
        'remove-checklist-item': () => removeChecklistItem(idx),
        'remove-edit-checklist-item': () => removeEditChecklistItem(idx),
        'indent-checklist-item': () => indentChecklistItem(idx),
        'outdent-checklist-item': () => outdentChecklistItem(idx),
        'indent-edit-checklist-item': () => indentEditChecklistItem(idx),
        'outdent-edit-checklist-item': () => outdentEditChecklistItem(idx),
        'toggle-checklist-state': () => toggleChecklistItem(parseInt(target.dataset.reminderId), idx),
        'toggle-checklist-numbered': () => renderChecklistContainer(),
        'toggle-edit-checklist-numbered': () => renderEditChecklistContainer(),
        'confirm-tag-selection': confirmTagSelection,
        'open-shortcut-modal': () => { renderCategorySelect(); document.getElementById('shortcutModal')?.classList.add('active'); },
        'close-shortcut-modal': () => document.getElementById('shortcutModal')?.classList.remove('active'),
        'delete-shortcut': () => { e.stopPropagation(); deleteShortcut(id); },
        'open-url': () => { e.stopPropagation(); window.open(target.dataset.url, '_blank'); },
        'stop-prop': () => { e.stopPropagation(); },
        'close-password-modal': closePasswordModal,
        'close-contact-form-modal': closeContactFormModal,
        'close-view-contact-modal': closeViewContactModal,
        'view-contact': () => openViewContactModal(id),
        'edit-contact-btn': () => { e.stopPropagation(); openContactFormModal(id); },
        'share-contact-btn': () => { e.stopPropagation(); shareContactViaWhatsApp(id); },
        'select-contact-tags': openContactTagSelection,
        'toggle-contact-tag': () => toggleContactTagSelection(target.dataset.tag),
        'edit-contact-tag': () => { e.stopPropagation(); editContactTag(target.dataset.tag); },
        'delete-contact-tag': () => { e.stopPropagation(); deleteContactTag(target.dataset.tag); },
        'add-new-contact-tag': addNewContactTagToSelection,
        'confirm-contact-tag-selection': confirmContactTagSelection,
        'remove-contact-tag': () => removeSelectedContactTag(target.dataset.tag),
        'set-contacts-tag-filter': () => { state.contactsTagFilter = target.dataset.tag === 'all' ? null : target.dataset.tag; renderContacts(); },
        'set-contacts-layout': () => setContactsLayout(target.dataset.layout),
        'open-contact-folder': () => openContactFolder(target.dataset.folder),
        'go-back-contacts-folders': goBackContactsFolders,
        'view-reminder': () => { openViewModal(id); },
        'close-view-modal': closeViewModal,
        'edit-from-view': () => { closeViewModal(); openEditModal(id); },
        'share-from-view': () => { if (id) shareReminderViaWhatsApp(id); },
        'set-dash-view': () => {
            const view = target.dataset.view;
            const container = document.getElementById('dash-reminders-recent');
            if (container) {
                container.classList.toggle('grid-view', view === 'columns');
                document.querySelectorAll('[data-action="set-dash-view"]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
            }
        },
        'set-dash-tag-filter': () => { state.dashboardTagFilter = target.dataset.tag === 'all' ? null : target.dataset.tag; render(); },
        'set-reminders-tag-filter': () => { state.remindersTagFilter = target.dataset.tag === 'all' ? null : target.dataset.tag; render(); },
        'set-calendar-tag-filter': () => { state.calendarTagFilter = target.dataset.tag === 'all' ? null : target.dataset.tag; render(); },
        'set-kanban-tag-filter': () => { state.kanbanTagFilter = target.dataset.tag === 'all' ? null : target.dataset.tag; render(); },
        'add-to-calendar': () => {
            const rId = id || (document.getElementById('viewReminderModal').dataset.id ? parseInt(document.getElementById('viewReminderModal').dataset.id) : null);
            const reminder = state.reminders.find(r => r.id === rId);
            if (reminder) window.open(generateCalendarLink(reminder), '_blank');
        },
        'delete-session': () => deleteSession(target.dataset.id),
        'restore-session': () => restoreSession(target.dataset.id),
        'open-pip': () => {
            e.stopPropagation();
            const stream = state.streams.find(s => s.id === id);
            if (stream) openLivePip(stream);
        },
        'mark-as-completed': () => markAsCompleted(id),
        'delete-stream': () => deleteStream(id),
        'toggle-stream-selection': () => toggleStreamSelection(id),
        'switch-settings-tab': () => {
            const tabId = target.dataset.tab;
            document.querySelectorAll('.settings-nav-btn').forEach(btn => btn.classList.toggle('active', btn === target));
            document.querySelectorAll('.settings-tab-content').forEach(content => content.style.display = content.id === tabId ? 'grid' : 'none');
        },
        'open-news': () => {
            e.stopPropagation();
            const url = target.dataset.url;
            if (url) {
                if (!state.readNewsUrls.includes(url)) {
                    state.readNewsUrls.push(url);
                    setStorageData(READ_NEWS_KEY, state.readNewsUrls);
                }
                window.open(url, '_blank');
                render();
            }
        },
        'open-app-pip': () => {
            e.stopPropagation();
            const app = state.pipApps.find(a => a.id === id);
            if (app) openAppInPip(app);
        },
        'open-pipapp-modal': () => openPipAppModal(),
        'close-pipapp-modal': () => document.getElementById('pipAppModal')?.classList.remove('active'),
        'delete-pipapp': () => deletePipApp(id),
        'edit-pipapp': () => openPipAppModal(id),
        'navigate-to-settings-news': () => {
            showView('settings');
            const btn = document.querySelector('.settings-nav-btn[data-tab="settings-tab-news"]');
            if (btn) btn.click();
        },
        'close-multi-view': closeMultiViewModal,
        'toggle-multi-view-fullscreen': toggleMultiViewFullScreen,
        'close-category-modal': closeCategoryModal,
        'close-whats-new': () => {
            const modal = document.getElementById('whatsNewModal');
            if (modal) modal.classList.remove('active');
            setStorageData(CHANGELOG_VERSION_KEY, chrome.runtime.getManifest().version);
        },
        'close-donation-modal': () => {
            const modal = document.getElementById('donationModal');
            if (modal) modal.classList.remove('active');
            setStorageData(CHANGELOG_VERSION_KEY, chrome.runtime.getManifest().version);
        },
        'select-language': async () => {
            state.currentLang = target.dataset.value;
            await savePreferences();
            updateUIForLanguage();
            renderDashboardDate();
            renderStreamsPreview();
            render();
            document.getElementById('customLanguageSelect').classList.remove('active');
        },
        'sync-login': handleSyncLogin,
        'sync-logout': handleSyncLogout,
        'sync-delete-cloud': deleteSyncBackup,
        'sync-toggle-pause': toggleSyncPause
    };

    if (actions[action]) actions[action]();
}

function handleGlobalInput(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const idx = parseInt(target.dataset.index);
    const action = target.dataset.action;

    if (action === 'update-link') state.currentLinks[idx] = target.value;
    else if (action === 'update-edit-link') state.editingLinks[idx] = target.value;
    else if (action === 'update-checklist-item') state.currentChecklist[idx].text = target.value;
    else if (action === 'update-edit-checklist-item') state.editingChecklist[idx].text = target.value;
}

function renderCategorySelect() {
    const optionsContainer = document.getElementById('shortcutCategoryOptions');
    const display = document.getElementById('currentShortcutCategoryDisplay');
    const hiddenInput = document.getElementById('shortcutCategory');
    if (!optionsContainer || !display || !hiddenInput) return;

    optionsContainer.innerHTML = state.categories.map(cat => `
        <div class="custom-option ${hiddenInput.value === cat.id ? 'selected' : ''}" data-value="${cat.id}">
            ${escapeHtml(cat.name)}
        </div>
    `).join('');

    const activeCat = state.categories.find(c => c.id === hiddenInput.value) || state.categories[0];
    if (activeCat) {
        display.innerText = activeCat.name;
        hiddenInput.value = activeCat.id;
    }
}

async function exportData() {
    try {
        const localData = await chrome.storage.local.get(null);
        
        // Remover chaves sensíveis de autenticação
        delete localData.driftweb_sync_oauth_token;
        delete localData.driftweb_sync_oauth_expires;

        const payload = {
            app: "Remind.hub",
            version: chrome.runtime.getManifest().version,
            exportDate: new Date().toISOString(),
            storage: localData
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remindhub-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showNotification(t('dataExported') || "Dados exportados com sucesso!");
    } catch (e) {
        console.error("Erro ao exportar dados:", e);
        showNotification("Erro ao exportar os dados.", "error");
    }
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const payload = JSON.parse(event.target.result);
            let storageToRestore = null;

            // Formato de backup novo
            if (payload.app === "Remind.hub" && payload.storage) {
                storageToRestore = payload.storage;
            } else {
                // Formato de backup antigo (legado)
                storageToRestore = {};
                if (payload.reminders) storageToRestore['driftweb_reminders'] = payload.reminders;
                if (payload.shortcuts) storageToRestore['driftweb_shortcuts'] = payload.shortcuts;
                if (payload.streams) storageToRestore['driftweb_streams'] = payload.streams;
                if (payload.categories) storageToRestore['driftweb_categories'] = payload.categories;
                if (payload.preferences) {
                    if (payload.preferences.theme !== undefined) storageToRestore['driftweb_theme'] = payload.preferences.theme;
                    if (payload.preferences.language !== undefined) storageToRestore['driftweb_language'] = payload.preferences.language;
                }
            }

            if (storageToRestore && Object.keys(storageToRestore).length > 0) {
                // Salvar no storage local
                await chrome.storage.local.set(storageToRestore);
                
                showNotification("Dados importados com sucesso! Recarregando...", "success");
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error("Arquivo de backup inválido ou vazio.");
            }
        } catch (err) {
            console.error("Erro na importação:", err);
            showNotification(t('importError') || "Erro ao importar dados.", 'error');
        }
    };
    reader.readAsText(file);
}

// Entry Point
document.addEventListener('DOMContentLoaded', init);
window._t = t; // Global export for compatibility
async function handleCheckUpdate(silentParam = false) {
    const silent = silentParam === true;
    const btn = document.getElementById('btnCheckUpdate');
    const originalText = btn ? btn.innerText : '';
    
    if (btn && !silent) {
        btn.disabled = true;
        btn.innerText = t('checkingUpdates');
    }

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.requestUpdateCheck) {
            chrome.runtime.requestUpdateCheck((status) => {
                if (btn && !silent) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }

                if (status === 'update_available') {
                    showNotification(t('updateAvailable'), 'success');
                    setTimeout(() => {
                        chrome.runtime.reload();
                    }, 2000);
                } else if (status === 'throttled') {
                    if (!silent) showNotification(t('updateThrottled'), 'warning');
                } else {
                    if (!silent) showNotification(t('upToDate'));
                }
            });
        } else {
            if (btn && !silent) {
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerText = originalText;
                    showNotification(t('upToDate'));
                }, 1000);
            }
        }
    } catch (e) {
        if (btn && !silent) {
            btn.disabled = false;
            btn.innerText = originalText;
            showNotification(t('upToDate'));
        }
    }
}

async function handleSendSuggestion() {
    const nameEl = document.getElementById('suggestionName');
    const emailEl = document.getElementById('suggestionEmail');
    const messageEl = document.getElementById('suggestionMessage');
    const btn = document.getElementById('btnSendSuggestion');

    if (!messageEl || !messageEl.value.trim()) {
        showNotification(t('pleaseFillMessage'), 'error');
        return;
    }

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = t('sending');

    try {
        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                access_key: '20925b34-f514-4428-8d95-de300515fc78',
                name: nameEl?.value || 'Usuário Remind.hub',
                email: emailEl?.value || 'no-reply@remindhub.app',
                message: messageEl.value,
                subject: `Feedback Remind.hub - ${nameEl?.value || 'Usuário'}`
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(t('suggestionSent'), 'success');
            if (nameEl) nameEl.value = '';
            if (emailEl) emailEl.value = '';
            if (messageEl) messageEl.value = '';
        } else {
            showNotification('Erro ao enviar feedback. Tente novamente mais tarde.', 'error');
        }
    } catch (error) {
        console.error('Error sending feedback:', error);
        showNotification('Erro de conexão ao enviar feedback.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function handleShareWhatsApp() {
    const text = encodeURIComponent(t('shareExtText'));
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function handleShareEmail() {
    const subject = encodeURIComponent(t('shareExtSubject'));
    const body = encodeURIComponent(t('shareExtBody'));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function handleCopyPix() {
    const pixKey = "endrigocosta@hotmail.com";
    navigator.clipboard.writeText(pixKey).then(() => {
        showNotification(t('pixCopied'), 'success');
    }).catch(err => {
        console.error('Error copying PIX:', err);
    });
}

async function checkChangelog() {
    const currentVersion = chrome.runtime.getManifest().version;
    const lastSeenVersion = await getStorageData(CHANGELOG_VERSION_KEY, null);

    if (lastSeenVersion !== currentVersion) {
        if (currentVersion === '5.1.3') {
            const modal = document.getElementById('donationModal');
            if (modal) modal.classList.add('active');
        } else {
            const modal = document.getElementById('whatsNewModal');
            if (modal) modal.classList.add('active');
        }
    }
}
