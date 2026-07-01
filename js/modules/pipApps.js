// js/modules/pipApps.js
import { state, PIP_APPS_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { t } from '../i18n.js';
import { showNotification, escapeHtml } from '../utils.js';

// Precisamos do render() global por enquanto
function render() {
    if (window.render) window.render();
}

export async function loadPipApps() {
    try {
        state.pipApps = await getStorageData(PIP_APPS_KEY, []);
        if (!Array.isArray(state.pipApps)) state.pipApps = [];
    } catch (e) {
        state.pipApps = [];
    }
}

export async function savePipApps() {
    await setStorageData(PIP_APPS_KEY, state.pipApps);
}

export async function togglePipAppEditMode() {
    state.isPipAppEditMode = !state.isPipAppEditMode;
    render();
}

export function openPipAppModal(id = null) {
    const modal = document.getElementById('pipAppModal');
    const title = document.getElementById('pipAppModalTitle');
    const nameInput = document.getElementById('pipAppName');
    const urlInput = document.getElementById('pipAppUrl');

    state.pipAppEditId = id;

    if (id) {
        const app = state.pipApps.find(a => a.id === id);
        if (app) {
            if (title) title.innerText = t('editPipApp') || 'Editar PiP App';
            nameInput.value = app.name;
            urlInput.value = app.url;
        }
    } else {
        if (title) title.innerText = t('newPipApp') || 'Novo PiP App';
        nameInput.value = '';
        urlInput.value = '';
    }

    modal.classList.add('active');
}

export async function addPipApp() {
    const nameInput = document.getElementById('pipAppName');
    const urlInput = document.getElementById('pipAppUrl');

    let name = nameInput.value.trim();
    let url = urlInput.value.trim();

    if (!url) {
        showNotification(t('urlRequired'), 'error');
        return;
    }

    if (!url.startsWith('http')) url = 'https://' + url;
    if (!name) {
        try {
            const domain = new URL(url).hostname;
            name = domain.replace('www.', '').split('.')[0];
            name = name.charAt(0).toUpperCase() + name.slice(1);
        } catch (e) {
            name = 'App';
        }
    }

    if (state.pipAppEditId) {
        const index = state.pipApps.findIndex(a => a.id === state.pipAppEditId);
        if (index !== -1) {
            state.pipApps[index].name = name;
            state.pipApps[index].url = url;
            showNotification(t('pipAppSaved') || 'App atualizado');
        }
    } else {
        state.pipApps.push({
            id: Date.now(),
            name: name,
            url: url
        });
        showNotification(t('pipAppSaved'));
    }

    await savePipApps();
    render();

    state.pipAppEditId = null;
    nameInput.value = '';
    urlInput.value = '';
    document.getElementById('pipAppModal').classList.remove('active');
}

export async function deletePipApp(id) {
    state.pipApps = state.pipApps.filter(a => a.id != id);
    await savePipApps();
    render();
    showNotification(t('pipAppRemoved'));
}

export function renderPipApps() {
    const grid = document.getElementById('pipAppsGrid');
    if (!grid) return;

    let filtered = state.pipApps;
    if (state.searchQuery) {
        filtered = filtered.filter(a =>
            a.name.toLowerCase().includes(state.searchQuery) ||
            a.url.toLowerCase().includes(state.searchQuery)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-dim); font-size: 14px; grid-column: 1 / -1;">${state.searchQuery ? t('noResults') : t('noPipApps')}</div>`;
        return;
    }

    grid.innerHTML = filtered.map(a => {
        let iconUrl = '';
        try {
            const urlObj = new URL(a.url);
            iconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
        } catch (e) {
            iconUrl = 'icons/icon128.png';
        }

        return `
            <div class="stream-card pip-app-card" data-id="${a.id}">
                <div class="stream-info">
                    <div class="stream-platform-icon">
                        <img src="${iconUrl}" width="20" height="20" onerror="this.src='icons/icon128.png'" style="border-radius: 4px;">
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="font-size: 14px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                            data-action="open-url" data-url="${a.url}">
                            ${a.name}
                        </h4>
                        <div style="font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${new URL(a.url).hostname}
                        </div>
                    </div>
                </div>
                <div class="stream-actions">
                    ${!state.isPipAppEditMode ? `
                        <button class="glass-btn action-pip" data-action="open-app-pip" data-id="${a.id}" title="Document Picture-in-Picture" style="padding: 8px; color: var(--primary);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="13" y="13" width="8" height="8" rx="2" ry="2" fill="currentColor"></rect></svg>
                        </button>
                        <button class="glass-btn" data-action="open-url" data-url="${a.url}" title="${t('open-url')}" style="padding: 8px; color: var(--text-dim);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                    ` : `
                        <button class="glass-btn" data-action="edit-pipapp" data-id="${a.id}" title="${t('edit') || 'Editar'}" style="padding: 8px; color: var(--primary); background: rgba(var(--primary-rgb), 0.1);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <div style="width: 8px;"></div>
                        <button class="glass-btn" data-action="delete-pipapp" data-id="${a.id}" title="${t('delete') || 'Excluir'}" style="padding: 8px; color: var(--accent-error); background: rgba(255, 71, 87, 0.1);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    `}
                </div>
                
                <div class="drag-handle" style="opacity: 0.2; display: flex; align-items: center; cursor: grab;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                </div>
            </div>
        `;
    }).join('');

    const dashGrid = document.getElementById('dash-pipapp-grid');
    if (dashGrid) {
        if (state.pipApps.length === 0) {
            dashGrid.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-dim); font-size: 12px; grid-column: 1 / -1; background: rgba(255,255,255,0.02); border-radius: 12px;">Nenhum PiP App</div>';
        } else {
            dashGrid.innerHTML = state.pipApps.map(a => {
                let iconUrl = '';
                try {
                    iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(a.url).hostname}&sz=64`;
                } catch(e) { iconUrl = 'icons/icon128.png'; }
                return `
                <div class="shortcut-item pip-app-shortcut" data-action="open-app-pip" data-id="${a.id}" title="${escapeHtml(a.name)}" style="position: relative;">
                    <div class="shortcut-icon-wrapper">
                        <img src="${iconUrl}" alt="" class="shortcut-icon" draggable="false" onerror="this.src='icons/icon16.png'; this.style.filter='grayscale(1)'">
                    </div>
                    <span class="shortcut-name" style="pointer-events: none;">${escapeHtml(a.name)}</span>
                    
                    <div class="drag-handle" style="position: absolute; bottom: 37%; right: -5px; opacity: 0; transition: var(--transition); pointer-events: none;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5;"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

export async function openAppInPip(app) {
    const urlLower = app.url.toLowerCase();
    const isGoogleDomain = urlLower.includes('google.com') || urlLower.includes('mail.google.com');

    // Google services: abre em popup normal (framebusting via JS, impossível contornar)
    if (isGoogleDomain || !('documentPictureInPicture' in window)) {
        if (isGoogleDomain) console.warn("Google domains must be opened in standard windows due to framebusting.");
        if (!('documentPictureInPicture' in window) && !isGoogleDomain) showNotification(t('pipNotSupported'), 'warning');
        
        let targetUrl = app.url;
        if (urlLower.includes('mail.google.com') && !urlLower.includes('/mu/')) {
            targetUrl = 'https://mail.google.com/mail/mu/mp/';
        }
        
        window.open(targetUrl, 'PipApp', 'width=500,height=600');
        return;
    }

    // Domínios com CSP restritivo: usa wrapper da extensão (pip-frame.html)
    // O wrapper é uma página da extensão que carrega o site em iframe interno.
    // Como a requisição parte de chrome-extension://, as regras declarativeNetRequest
    // conseguem interceptar e remover os headers de segurança.
    const strictCspDomains = ['perplexity.ai', 'chat.openai.com', 'chatgpt.com', 'claude.ai'];
    const isStrictCsp = strictCspDomains.some(d => urlLower.includes(d));

    try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 500,
            height: 600,
        });

        const container = pipWindow.document.createElement('div');
        container.style.cssText = 'width:100vw;height:100vh;overflow:hidden;background:#000;margin:0;';

        const iframe = pipWindow.document.createElement('iframe');
        
        if (isStrictCsp) {
            // Para sites com CSP restritivo, carrega via página wrapper da extensão
            iframe.src = chrome.runtime.getURL('pip-frame.html?url=' + encodeURIComponent(app.url));
        } else {
            // Para sites normais, carrega diretamente
            iframe.src = app.url;
        }
        
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";

        container.appendChild(iframe);
        pipWindow.document.body.appendChild(container);
        pipWindow.document.body.style.margin = '0';

    } catch (e) {
        console.error("PiP error:", e);
        // Fallback: abre em popup via background script
        try {
            await chrome.runtime.sendMessage({
                action: 'open-pip-popup',
                url: isStrictCsp 
                    ? chrome.runtime.getURL('pip-frame.html?url=' + encodeURIComponent(app.url))
                    : app.url
            });
        } catch(e2) {
            window.open(app.url, 'PipApp', 'width=500,height=600');
        }
    }
}
