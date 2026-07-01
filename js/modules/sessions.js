// js/modules/sessions.js
import { state, SESSIONS_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { t } from '../i18n.js';
import { showNotification, escapeHtml } from '../utils.js';

export async function loadSessions() {
    state.savedSessions = await getStorageData(SESSIONS_KEY, []);
}

export async function saveBrowserSession() {
    try {
        const input = document.getElementById('sessionNameInput');
        let sessionName = input ? input.value.trim() : '';
        if (!sessionName) {
            const date = new Date();
            const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
            const dateStr = date.toLocaleDateString(localeStr);
            const timeStr = date.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' });
            sessionName = `${t('defaultSessionName')} ${dateStr} ${timeStr}`;
        }

        // Get displays mapping
        const displays = await chrome.system.display.getInfo();

        // Obter todas as janelas com as abas
        const windows = await chrome.windows.getAll({ populate: true });

        const sessionWindows = windows.map(win => {
            // Check monitor based on position
            let targetMonitorId = 'primary';
            for (let d of displays) {
                if (win.left >= d.bounds.left && win.left < (d.bounds.left + d.bounds.width) &&
                    win.top >= d.bounds.top && win.top < (d.bounds.top + d.bounds.height)) {
                    targetMonitorId = d.id;
                    break;
                }
            }

            const tabs = win.tabs.map(t => ({
                url: t.url,
                title: t.title,
                favIconUrl: t.favIconUrl,
                active: t.active,
                index: t.index,
                pinned: t.pinned || false
            }));

            return {
                state: win.state,
                left: win.left,
                top: win.top,
                width: win.width,
                height: win.height,
                monitorId: targetMonitorId,
                tabs: tabs
            };
        });

        const tabCount = sessionWindows.reduce((acc, w) => acc + w.tabs.length, 0);

        const newSession = {
            id: Date.now().toString(),
            name: sessionName,
            savedAt: new Date().toISOString(),
            windowCount: sessionWindows.length,
            tabCount: tabCount,
            windows: sessionWindows
        };

        state.savedSessions.push(newSession);
        await setStorageData(SESSIONS_KEY, state.savedSessions);

        if (input) input.value = '';
        showNotification(t('sessionSaved'));
        renderSessions();

    } catch (err) {
        console.error('Error saving session:', err);
        showNotification('Erro ao salvar sessão.', 'error');
    }
}

export function renderSessions() {
    const grid = document.getElementById('sessionsGrid');
    if (!grid) return;

    if (state.savedSessions.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-dim); font-size: 14px; grid-column: 1 / -1;">${t('noSessions')}</div>`;
        return;
    }

    // Sort newest first
    let sorted = [...state.savedSessions].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (state.searchQuery) {
        sorted = sorted.filter(s => s.name.toLowerCase().includes(state.searchQuery));
    }

    grid.innerHTML = sorted.map(session => {
        const d = new Date(session.savedAt);
        const localeStr = state.currentLang === 'pt' ? 'pt-BR' : 'en-US';
        const dateStr = d.toLocaleDateString(localeStr) + ` ${t('at')} ` + d.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' });

        // Show all favicons with correct priority
        const allTabs = session.windows.flatMap(w => w.tabs);
        const faviconHtml = allTabs.map(t => {
            let iconUrl = t.favIconUrl;
            if (!iconUrl && t.url && t.url.startsWith('http')) {
                try {
                    const urlObj = new URL(t.url);
                    iconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
                } catch (e) {
                    iconUrl = 'icons/icon16.png';
                }
            } else if (!iconUrl) {
                iconUrl = 'icons/icon16.png';
            }
            return `<img src="${iconUrl}" title="${escapeHtml(t.title || t.url)}" style="width: 20px; height: 20px; border-radius: 4px; background: rgba(255,255,255,0.05); padding: 2px; border: 1px solid var(--border-glass);" onerror="this.src='icons/icon16.png'">`;
        }).join('');

        return `
            <div class="reminder-card-premium" style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h3 style="font-size: 16px; margin-bottom: 4px; color: var(--text-main);">${escapeHtml(session.name)}</h3>
                        <div style="font-size: 11px; color: var(--text-dim);">${dateStr}</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px; font-size: 11px;">
                    <span style="background: var(--bg-main); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-glass); display: flex; align-items: center; gap: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>
                        ${session.windowCount} ${session.windowCount !== 1 ? t('windows') : t('window')}
                    </span>
                    <span style="background: var(--bg-main); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-glass); display: flex; align-items: center; gap: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><line x1="8" y1="4" x2="8" y2="10"></line></svg>
                        ${session.tabCount} ${session.tabCount !== 1 ? t('tabs') : t('tab')}
                    </span>
                </div>

                ${allTabs.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 6px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px; align-items: center;">
                    ${faviconHtml}
                </div>` : ''}

                <div style="margin-top: auto; padding-top: 12px; display: flex; gap: 8px; border-top: 1px solid var(--border-glass);">
                    <button class="glass-btn primary" data-action="restore-session" data-id="${session.id}" style="flex: 2; padding: 8px;">${t('restoreSession')}</button>
                    <button class="glass-btn" data-action="rename-session" data-id="${session.id}" style="flex: 1; padding: 8px; display: flex; justify-content: center; align-items: center;" title="${t('renameSession')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="glass-btn danger" data-action="delete-session" data-id="${session.id}" style="flex: 1; padding: 8px; display: flex; justify-content: center; align-items: center; color: var(--accent-error); background: rgba(255, 71, 87, 0.1);" title="${t('deleteSession')}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export async function restoreSession(id) {
    const session = state.savedSessions.find(s => s.id === id);
    if (!session) return;

    try {
        const displays = await chrome.system.display.getInfo();
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

        // Ensure we handle URL restrictions
        for (const winData of session.windows) {
            const hasDisplay = displays.find(d => d.id === winData.monitorId);
            let targetLeft = winData.left;
            let targetTop = winData.top;

            // Se o monitor que estava não existe mais, jogar pro principal com um pequeno offset
            if (!hasDisplay && winData.monitorId !== 'primary') {
                targetLeft = primaryDisplay.bounds.left + 50;
                targetTop = primaryDisplay.bounds.top + 50;
            }

            // Filtrar URLs restritas que causam erro no create
            const filteredTabs = winData.tabs.filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('edge://') && !t.url.startsWith('about:'));
            let urls = filteredTabs.map(t => t.url);

            // Se todas as abas eram chrome://..., abrimos uma aba vazia
            if (urls.length === 0) {
                urls = ['chrome://newtab/'];
            }

            // O active index relativo ao array filtrado
            let activeTabIndex = filteredTabs.findIndex(t => t.active);
            if (activeTabIndex < 0) activeTabIndex = 0;

            const createData = {
                url: urls,
                focused: true
            };

            // Restaurar propriedades se estiver em estado normal
            if (winData.state === 'normal') {
                createData.left = targetLeft;
                createData.top = targetTop;
                createData.width = winData.width;
                createData.height = winData.height;
            } else {
                createData.state = winData.state;
            }

            // Create window
            const newWin = await chrome.windows.create(createData);

            // Garantir qual aba fica ativa e aplicar o estado de pin (fixado)
            if (newWin && newWin.tabs) {
                for (let i = 0; i < filteredTabs.length; i++) {
                    const tabData = filteredTabs[i];
                    if (newWin.tabs.length > i) {
                        const tabId = newWin.tabs[i].id;
                        const updateProps = {};
                        if (tabData.active) updateProps.active = true;
                        if (tabData.pinned) updateProps.pinned = true;

                        if (Object.keys(updateProps).length > 0) {
                            await chrome.tabs.update(tabId, updateProps);
                        }
                    }
                }
            }
        }

        showNotification(t('sessionRestored'));
    } catch (err) {
        console.error('Error restoring session:', err);
        showNotification(t('importError'), 'error');
    }
}

export function deleteSession(id) {
    if (confirm(t('confirmDelete'))) {
        state.savedSessions = state.savedSessions.filter(s => s.id !== id);
        setStorageData(SESSIONS_KEY, state.savedSessions).then(() => {
            renderSessions();
            showNotification(t('sessionRemoved'));
        });
    }
}

export function renameSession(id) {
    const session = state.savedSessions.find(s => s.id === id);
    if (!session) return;

    const newName = prompt(t('renameSessionPrompt'), session.name);
    if (newName && newName.trim()) {
        session.name = newName.trim();
        setStorageData(SESSIONS_KEY, state.savedSessions).then(() => {
            renderSessions();
        });
    }
}
