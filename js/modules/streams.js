// js/modules/streams.js
import { state, STREAMS_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { t } from '../i18n.js';
import { showNotification, escapeHtml } from '../utils.js';

const INVIDIOUS_INSTANCE = 'https://invidious.nerdcity.de'; // Make sure this is declared or imported if needed

function render() {
    if (window.render) window.render();
}

export function normalizeYoutubeUrl(url) {
    if (!url) return url;
    const urlLower = url.toLowerCase();

    // normaliza e garante que termina com /live se for canal
    if ((urlLower.includes('youtube.com/') || urlLower.includes('youtu.be/')) &&
        !urlLower.includes('/watch') && !urlLower.includes('/live')) {

        let normalized = url;
        if (urlLower.includes('youtube.com/') && !urlLower.includes('/@') &&
            !urlLower.includes('/channel/') && !urlLower.includes('/c/') && !urlLower.includes('/user/')) {
            normalized = url.replace(/youtube\.com\//i, 'youtube.com/@');
        }

        // Adiciona /live no final (removendo barra extra se houver)
        return normalized.replace(/\/+$/, '') + '/live';
    }
    return url;
}

export async function loadStreams() {
    try {
        state.streams = await getStorageData(STREAMS_KEY, []);
        if (!Array.isArray(state.streams)) state.streams = [];

        // Normalize YouTube URLs for existing state.streams
        let changed = false;
        state.streams.forEach(s => {
            const oldUrl = s.url;
            s.url = normalizeYoutubeUrl(s.url);
            if (oldUrl !== s.url) {
                changed = true;
            }
            if (!s.id) {
                s.id = Date.now() + Math.random();
                changed = true;
            }
        });
        if (changed) await saveStreams();
    } catch (e) {
        state.streams = [];
    }
}

// ========== MULTI-VIEW LOGIC ==========
export function toggleStreamSelection(id) {
    const idx = state.selectedStreamsForMultiView.indexOf(id);
    if (idx > -1) {
        state.selectedStreamsForMultiView.splice(idx, 1);
    } else {
        if (state.selectedStreamsForMultiView.length >= 4) {
            showNotification(t('multiViewMaxReached'), 'warning');
            return;
        }
        state.selectedStreamsForMultiView.push(id);
    }
    updateMultiViewButton();
    renderStreams();
}

export function updateMultiViewButton() {
    const btn = document.getElementById('btnOpenMultiView');
    if (!btn) return;

    if (state.isMultiViewSelectionMode) {
        const count = state.selectedStreamsForMultiView.length;
        if (count === 0) {
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                <span style="font-size: 11px;">${t('selectChannels')}</span>
            `;
            btn.style.background = 'rgba(var(--primary-rgb), 0.2)';
        } else {
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                <span>${t('activateMultiView')} (${count}/4)</span>
            `;
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
        }
    } else {
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            <span>Multi-View</span>
        `;
        btn.style.background = '';
        btn.style.color = '';
    }
}

export function getChatEmbedUrl(stream) {
    const url = stream.url;
    const urlLower = url.toLowerCase();

    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
        const domain = 'driftweb.com.br'; // Domínio autorizado nas regras do extension
        if (stream.liveVideoId) {
            return `https://www.youtube.com/live_chat?v=${stream.liveVideoId}&embed_domain=${domain}`;
        }
        const videoIdMatch = url.match(/(?:v=|be\/|embed\/|live\/)([\w-]{11})/);
        if (videoIdMatch && videoIdMatch[1]) {
            return `https://www.youtube.com/live_chat?v=${videoIdMatch[1]}&embed_domain=${domain}`;
        }
        return null;
    }

    if (urlLower.includes('twitch.tv')) {
        const channel = url.split('/').pop().split('?')[0];
        return `https://www.twitch.tv/embed/${channel}/chat?parent=twitch.tv&darkpopout`;
    }

    if (urlLower.includes('kick.com')) {
        const channel = url.split('/').pop().split('?')[0];
        return `https://kick.com/popout/${channel}/chat`;
    }

    return null;
}

export function switchMultiViewChat(streamId) {
    const chatPanel = document.getElementById('multiViewChatPanel');
    const chatFrame = document.getElementById('multiViewChatFrame');
    if (!chatPanel || !chatFrame) return;

    if (!streamId) {
        chatPanel.style.display = 'none';
        chatFrame.src = 'about:blank';
        return;
    }

    const stream = state.streams.find(s => s.id === streamId);
    if (!stream) return;

    const chatUrl = getChatEmbedUrl(stream);
    if (!chatUrl) {
        chatPanel.style.display = 'none';
        return;
    }

    // Otimização para troca de chat instantânea
    if (chatFrame.src !== chatUrl) {
        chatFrame.src = chatUrl;
        // Removido sandbox restritivo para permitir carregamento de scripts e armazenamento local de chats (YT/Kick)
        chatFrame.removeAttribute('sandbox'); 
    }
    chatPanel.style.display = 'flex';
}

export function openMultiViewModal() {
    const modal = document.getElementById('multiViewModal');
    const grid = document.getElementById('multiViewGrid');
    if (!modal || !grid) return;

    grid.innerHTML = '';

    // Adjust grid based on count
    const count = state.selectedStreamsForMultiView.length;
    if (count === 1) grid.style.gridTemplateColumns = '1fr';
    else if (count === 2) grid.style.gridTemplateColumns = '1fr 1fr';
    else grid.style.gridTemplateColumns = '1fr 1fr';

    state.selectedStreamsForMultiView.forEach(id => {
        const stream = state.streams.find(s => s.id === id);
        if (stream) {
            const embedUrl = getEmbedUrl(stream);
            const iframe = document.createElement('iframe');
            iframe.src = embedUrl;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.borderRadius = '12px';
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
            iframe.referrerPolicy = "strict-origin-when-cross-origin";
            iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";
            grid.appendChild(iframe);
        }
    });

    // Build chat radio buttons
    const chatSelector = document.getElementById('multiViewChatSelector');
    const chatPanel = document.getElementById('multiViewChatPanel');
    const chatFrame = document.getElementById('multiViewChatFrame');

    if (chatSelector) {
        chatSelector.innerHTML = '';

        // Chat label
        const chatLabelSpan = document.createElement('span');
        chatLabelSpan.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-dim); margin-right: 4px; display: flex; align-items: center; gap: 6px;';
        chatLabelSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> ${t('chatLabel')}:`;
        chatSelector.appendChild(chatLabelSpan);

        // "None" option (default)
        const noneLabel = document.createElement('label');
        noneLabel.className = 'chat-radio-label active';
        noneLabel.innerHTML = `<input type="radio" name="multiViewChat" value="" checked style="display:none;">${t('noChatOption')}`;
        noneLabel.addEventListener('click', () => {
            chatSelector.querySelectorAll('.chat-radio-label').forEach(l => l.classList.remove('active'));
            noneLabel.classList.add('active');
            switchMultiViewChat(null);
        });
        chatSelector.appendChild(noneLabel);

        // One radio per selected stream
        state.selectedStreamsForMultiView.forEach(id => {
            const stream = state.streams.find(s => s.id === id);
            if (stream) {
                const chatUrl = getChatEmbedUrl(stream);
                const label = document.createElement('label');
                label.className = 'chat-radio-label';
                if (!chatUrl) label.style.opacity = '0.4';
                label.title = chatUrl ? stream.name : 'Chat não disponível';
                label.innerHTML = `<input type="radio" name="multiViewChat" value="${id}" style="display:none;">${stream.name}`;
                if (chatUrl) {
                    label.addEventListener('click', () => {
                        chatSelector.querySelectorAll('.chat-radio-label').forEach(l => l.classList.remove('active'));
                        label.classList.add('active');
                        switchMultiViewChat(id);
                    });
                }
                chatSelector.appendChild(label);
            }
        });
    }

    // Reset chat state
    if (chatPanel) chatPanel.style.display = 'none';
    if (chatFrame) chatFrame.src = 'about:blank';

    modal.classList.add('active');
}

export function closeMultiViewModal() {
    const modal = document.getElementById('multiViewModal');
    const grid = document.getElementById('multiViewGrid');
    const chatPanel = document.getElementById('multiViewChatPanel');
    const chatFrame = document.getElementById('multiViewChatFrame');
    if (modal) modal.classList.remove('active');
    if (grid) grid.innerHTML = '';
    if (chatFrame) chatFrame.src = 'about:blank';
    if (chatPanel) chatPanel.style.display = 'none';

    if (document.fullscreenElement) {
        document.exitFullscreen();
    }

    state.isMultiViewSelectionMode = false;
    state.selectedStreamsForMultiView = [];
    updateMultiViewButton();
    render();
}

export function toggleMultiViewFullScreen() {
    const modal = document.getElementById('multiViewModal');
    if (!modal) return;

    if (!document.fullscreenElement) {
        modal.requestFullscreen().catch(err => {
            showNotification(`${t('multiViewErrorFullScreen')}: ${err.message}`, 'error');
        });
    } else {
        document.exitFullscreen();
    }
}

export async function saveStreams() {
    await setStorageData(STREAMS_KEY, state.streams);
}

export async function addStream() {
    const urlInput = document.getElementById('streamUrl');
    let url = urlInput.value.trim();

    if (!url) {
        showNotification(t('urlRequired'), 'error');
        return;
    }

    if (!url.startsWith('http')) url = 'https://' + url;

    // Hardened normalization for YouTube handles
    if (url.includes('youtube.com/') && !url.includes('/@') && !url.includes('/channel/') && !url.includes('/c/') && !url.includes('/user/') && !url.includes('/watch') && !url.includes('/live')) {
        url = url.replace('youtube.com/', 'youtube.com/@');
    }

    url = normalizeYoutubeUrl(url);

    let name = '';

    // Busca o nome automaticamente
    try {
        showNotification(t('fetchingStreamInfo'));
        
        // Melhora: Se for YouTube canal (com /live add pelo normalize), busca na URL base para pegar o nome do canal
        // Isso evita pegar o título da live atual no <title>
        let fetchUrl = url;
        if (url.includes('youtube.com/') && url.endsWith('/live')) {
            fetchUrl = url.replace(/\/live$/, '');
        }

        const response = await fetch(fetchUrl);
        if (response.ok) {
            const html = await response.text();
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                name = titleMatch[1]
                    .replace(/ - YouTube/i, '')
                    .replace(/ - Twitch/i, '')
                    .replace(/ - Watch Live on Kick/i, '')
                    .replace(/ \| Kick/i, '')
                    .replace(/ Stream/i, '') // Limpeza agressiva solicitada v1.7.0
                    .trim();
            }
        }
    } catch (e) {
        console.error('Erro ao buscar nome:', e);
    }

    // Fallback Inteligente (especialmente para Twitch que às vezes retorna apenas "Twitch" no título)
    if (!name || name.toLowerCase() === 'twitch') {
        const parts = url.split('/');
        name = parts[parts.length - 1].replace('@', '') || 'Live Stream';
    }

    // Garantia para Kick ou outros nomes longos residuais
    if (name.length > 50) {
        name = name.split(' - ')[0].trim();
    }

    const finalName = name;

    state.streams.push({
        id: Date.now(),
        name: finalName,
        url: url,
        isLive: false
    });

    saveStreams();
    render();
    urlInput.value = '';
    showNotification(t('streamSaved'));
    checkStreamStatus(state.streams[state.streams.length - 1]);
}

export function deleteStream(id) {
    state.streams = state.streams.filter(s => s.id !== id);
    saveStreams();
    render();
    updateStreamsSidebarIndicator();
    showNotification(t('streamRemoved'));
}

export async function checkAllStreamsStatus() {
    await Promise.all(state.streams.map(stream => checkStreamStatus(stream)));
}

export function prepareStreamUrl(url) {
    const urlLower = url.toLowerCase();
    // Support youtube.com and youtu.be short links
    if ((urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) && !urlLower.includes('/watch')) {
        if (urlLower.includes('/live')) return url;
        let cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const params = url.includes('?') ? '?' + url.split('?')[1] : '';
        return cleanUrl + '/live' + params;
    }
    return url;
}

export async function checkStreamStatus(stream) {
    let isLive = false;
    try {
        // Kick: usar API dedicada (a página é SPA e não retorna dados no HTML)
        if (stream.url.includes('kick.com')) {
            try {
                const channel = stream.url.split('/').pop().split('?')[0];
                const apiUrl = `https://kick.com/api/v2/channels/${channel}/livestream`;
                const apiResponse = await chrome.runtime.sendMessage({ action: 'fetch-url', url: apiUrl });
                if (apiResponse && apiResponse.success && apiResponse.text) {
                    const trimmed = apiResponse.text.trim();
                    if (trimmed && trimmed !== 'null' && trimmed !== '') {
                        try {
                            const json = JSON.parse(trimmed);
                            // A API retorna {"data": {...}} quando ao vivo ou {"data": null} quando offline
                            if (json && json.data && json.data.id) {
                                isLive = true;
                            }
                        } catch (parseErr) { /* JSON inválido */ }
                    }
                }
            } catch (apiErr) { /* Falha na API */ }

            if (stream.isLive !== isLive) {
                stream.isLive = isLive;
                await saveStreams();
                renderStreams();
            }
            return;
        }

        const finalUrl = prepareStreamUrl(stream.url);
        const busterUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(busterUrl, {
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status === 429) {
            // Silently bail for Kick rate limit
            return;
        }

        if (response.ok) {
            const html = await response.text();

            if (stream.url.includes('twitch.tv')) {
                isLive = html.includes('isLiveBroadcasting":true') ||
                    html.includes('"isLive":true') ||
                    html.includes('isLiveBroadcast":true') ||
                    html.includes('LiveIndicator') ||
                    html.includes('animated-dot') ||
                    html.includes('is-live') ||
                    html.includes('"status":"live"') ||
                    html.includes('stream_created_at');
            } else if (stream.url.includes('youtube.com') || stream.url.includes('youtu.be')) {
                // Detecção cirúrgica: isLiveNow e hlsManifestUrl são exclusivos para transmissões ATIVAS.
                // Evita falsos positivos em canais offline ou agendados.
                isLive = html.includes('yt-spec-avatar-shape__live-badge') ||
                    html.includes('"isLiveNow":true') ||
                    html.includes('"hlsManifestUrl"') ||
                    html.includes('"broadcastStatus":"LIVE"') ||
                    html.includes('"status":"live"');

                if (isLive) {
                    const videoIdMatch = html.match(/"videoId"\s*:\s*"([^"]+)"/);
                    if (videoIdMatch) stream.liveVideoId = videoIdMatch[1];

                    const channelIdMatch = html.match(/"channelId"\s*:\s*"(UC[^"]+)"/);
                    if (channelIdMatch) stream.channelId = channelIdMatch[1];
                }
            }
        }
    } catch (e) {
        // Defaults to offline on error/timeout
    }

    if (stream.isLive !== isLive) {
        stream.isLive = isLive;
        await saveStreams();
        
        // Em vez de render() total, fazemos updates pontuais
        renderStreams();
        renderStreamsPreview();
        updateStreamsSidebarIndicator();
    }
}

export function updateStreamsSidebarIndicator() {
    const hasLive = state.streams.some(s => s.isLive);
    const navLink = document.querySelector('.nav-link[data-view="streams"]');
    if (navLink) {
        // Only show indicator if there are live state.streams AND we are not currently on the state.streams view
        const isStreamsViewActive = navLink.classList.contains('active');
        navLink.classList.toggle('has-live', hasLive && !isStreamsViewActive);
    }
}



export function renderStreams() {
    const grid = document.getElementById('streamsGrid');
    if (!grid) return;

    let filtered = state.streams;
    if (state.searchQuery) {
        filtered = filtered.filter(s =>
            s.name.toLowerCase().includes(state.searchQuery) ||
            s.url.toLowerCase().includes(state.searchQuery)
        );
    }

    const newCardsHtml = filtered.map(s => {
        const urlLower = s.url.toLowerCase();
        const isYouTube = urlLower.includes('youtube.com') || urlLower.includes('youtu.be');
        const isSelected = state.selectedStreamsForMultiView.includes(s.id);

        let icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>';

        if (isYouTube) {
            icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>';
        } else if (urlLower.includes('twitch.tv')) {
            icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9h-2V6h2v5zm4 0h-2V6h2v5z"></path></svg>';
        } else if (urlLower.includes('kick.com')) {
            icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M8 12l8-8M8 12l8 8"></path></svg>';
        }

        return `
            <div class="stream-card ${isSelected ? 'selected' : ''}" data-id="${s.id}" 
                 ${state.isMultiViewSelectionMode ? 'data-action="toggle-stream-selection"' : ''}
                 style="${state.isMultiViewSelectionMode ? 'cursor: pointer;' : ''} ${isSelected ? 'border-color: var(--primary); background: rgba(var(--primary-rgb), 0.1);' : ''}">
                <div class="stream-info">
                    <div class="stream-platform-icon" style="color: ${s.isLive ? 'var(--primary)' : 'var(--text-dim)'}">
                        ${icon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="font-size: 14px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                            ${!state.isMultiViewSelectionMode ? `data-action="open-url" data-url="${normalizeYoutubeUrl(s.url)}"` : ''}>
                            ${s.name}
                        </h4>
                        <div style="display: flex; align-items: center; margin-top: 4px;">
                            ${s.isLive ? '<span class="live-indicator pulse"></span>' : ''}
                            <span class="stream-status ${s.isLive ? 'live' : 'offline'}">
                                ${s.isLive ? t('live') : t('offline')}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="stream-actions" style="${state.isMultiViewSelectionMode ? 'pointer-events: none; opacity: 0.3;' : ''}">
                    ${!state.isStreamEditMode ? `
                        ${s.isLive ? `
                            <button class="glass-btn action-pip" data-action="open-pip" data-id="${s.id}" title="Picture-in-Picture" style="padding: 8px; color: var(--primary);">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="13" y="13" width="8" height="8" rx="2" ry="2" fill="currentColor"></rect></svg>
                            </button>
                        ` : ''}
                        <button class="glass-btn" data-action="open-url" data-url="${normalizeYoutubeUrl(s.url)}" title="${t('open-url')}" style="padding: 8px; color: var(--text-dim);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                    ` : `
                        <button class="glass-btn" data-action="delete-stream" data-id="${s.id}" style="padding: 8px; color: var(--accent-error); background: rgba(255, 71, 87, 0.1);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    `}
                </div>
                
                <div class="drag-handle" style="opacity: 0.2; display: flex; align-items: center; cursor: grab; ${state.isMultiViewSelectionMode ? 'pointer-events: none;' : ''}">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                </div>
            </div>
        `;
    });

    const existingCardsMap = new Map();
    grid.querySelectorAll('.stream-card').forEach(card => {
        existingCardsMap.set(card.dataset.id, card);
    });

    // Se o número de itens mudou ou a ordem mudou drasticamente, renderizamos tudo
    // Mas para evitar flicker em hover, vamos tentar atualizar os existentes primeiro
    const filteredIds = filtered.map(s => String(s.id));
    const currentIds = Array.from(grid.querySelectorAll('.stream-card')).map(c => c.dataset.id);

    if (JSON.stringify(filteredIds) !== JSON.stringify(currentIds)) {
        grid.innerHTML = newCardsHtml.join('');
    } else {
        // Mesma ordem e quantidade, atualizamos apenas o conteúdo interno se necessário
        filtered.forEach((s, index) => {
            const card = grid.children[index];
            if (!card) return;

            const isSelected = state.selectedStreamsForMultiView.includes(s.id);
            
            // Atualiza atributos de ação e cursor (necessário para Multi-View)
            const titleEl = card.querySelector('h4');
            if (state.isMultiViewSelectionMode) {
                card.dataset.action = 'toggle-stream-selection';
                card.style.cursor = 'pointer';
                if (titleEl) delete titleEl.dataset.action;
            } else {
                delete card.dataset.action;
                card.style.cursor = '';
                if (titleEl) {
                    titleEl.dataset.action = 'open-url';
                    titleEl.dataset.url = normalizeYoutubeUrl(s.url);
                }
            }

            // Atualiza classes de estado sem destruir o elemento
            card.classList.toggle('selected', isSelected);
            
            if (isSelected) {
                card.style.borderColor = 'var(--primary)';
                card.style.background = 'rgba(var(--primary-rgb), 0.1)';
            } else {
                card.style.borderColor = '';
                card.style.background = '';
            }

            // Atualiza status e indicadores internos
            const statusEl = card.querySelector('.stream-status');
            if (statusEl) {
                const newStatus = s.isLive ? t('live') : t('offline');
                if (statusEl.innerText !== newStatus) {
                    statusEl.innerText = newStatus;
                    statusEl.className = `stream-status ${s.isLive ? 'live' : 'offline'}`;
                }
            }

            const infoIconEl = card.querySelector('.stream-platform-icon');
            if (infoIconEl) {
                infoIconEl.style.color = s.isLive ? 'var(--primary)' : 'var(--text-dim)';
            }

            const liveIndicator = card.querySelector('.live-indicator');
            if (s.isLive && !liveIndicator) {
                const titleArea = card.querySelector('.stream-info > div:nth-child(2) > div');
                if (titleArea) titleArea.insertAdjacentHTML('afterbegin', '<span class="live-indicator pulse"></span>');
            } else if (!s.isLive && liveIndicator) {
                liveIndicator.remove();
            }

            // Área de Ações e Botão de Deletar (Modo Edição)
            const actionsArea = card.querySelector('.stream-actions');
            if (actionsArea) {
                // Opacidade e pointer-events baseados no modo Multi-View
                actionsArea.style.pointerEvents = state.isMultiViewSelectionMode ? 'none' : '';
                actionsArea.style.opacity = state.isMultiViewSelectionMode ? '0.3' : '';

                if (state.isStreamEditMode) {
                    actionsArea.innerHTML = `
                        <button class="glass-btn" data-action="delete-stream" data-id="${s.id}" style="padding: 8px; color: var(--accent-error); background: rgba(255, 71, 87, 0.1);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    `;
                } else {
                    actionsArea.innerHTML = `
                        ${s.isLive ? `
                            <button class="glass-btn action-pip" data-action="open-pip" data-id="${s.id}" title="Picture-in-Picture" style="padding: 8px; color: var(--primary);">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="13" y="13" width="8" height="8" rx="2" ry="2" fill="currentColor"></rect></svg>
                            </button>
                        ` : ''}
                        <button class="glass-btn" data-action="open-url" data-url="${normalizeYoutubeUrl(s.url)}" title="${t('open-url')}" style="padding: 8px; color: var(--text-dim);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                    `;
                }
            }

            // Drag Handle
            const dragHandle = card.querySelector('.drag-handle');
            if (dragHandle) {
                dragHandle.style.pointerEvents = state.isMultiViewSelectionMode ? 'none' : '';
            }
        });
    }
}

export function generateCalendarLink(reminder, type = 'google') {
    const title = encodeURIComponent(reminder.title);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = reminder.description || '';
    const plainDesc = tempDiv.textContent || tempDiv.innerText || "";
    const desc = encodeURIComponent(plainDesc);

    let dateStr = "";
    if (reminder.dueDate) {
        dateStr = reminder.dueDate.replace(/-/g, '');
    } else {
        dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    if (type === 'google') {
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${dateStr}/${dateStr}`;
    } else {
        return `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&body=${desc}&startdt=${reminder.dueDate || ''}&enddt=${reminder.dueDate || ''}`;
    }
}

// Autor: Endrigo / Driftweb | Versão: 1.4.0 (YouTube Pop-up Spec & PiP Others)
export function getEmbedUrl(stream) {
    const url = stream.url;
    const urlLower = url.toLowerCase();

    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
        let baseUrl, suffix;

        if (state.youtubePlayerMode === 'proxy') {
            baseUrl = `${INVIDIOUS_INSTANCE}/embed/`;
            suffix = '?autoplay=1&mute=0'; // Invidious geralmente não exige mute para autoplay em alguns contextos
        } else {
            // Solução DriftWeb (Chave Mestra) - v4.3.9 STABLE
            baseUrl = 'https://www.youtube-nocookie.com/embed/';
            suffix = `?autoplay=1&mute=1&enablejsapi=1&origin=${encodeURIComponent(location.origin || 'https://driftweb.com.br')}`;
        }

        // 1. Prioridade para Video ID detectado
        if (stream.liveVideoId) {
            return baseUrl + stream.liveVideoId + suffix;
        }

        // 2. Extração de ID direto da URL
        const videoIdMatch = url.match(/(?:v=|be\/|embed\/|live\/)([\w-]{11})/);
        if (videoIdMatch && videoIdMatch[1]) {
            return `${baseUrl}${videoIdMatch[1]}${suffix}`;
        }

        // 3. Channel ID (UC...) detectado
        if (stream.channelId) {
            return `${baseUrl}live_stream?channel=${stream.channelId}${suffix}`;
        }

        // 4. Fallback para Channel Handle (@...)
        if (urlLower.includes('/@')) {
            const handle = url.split('/@')[1].split('/')[0];
            return `${baseUrl}live_stream?channel=${handle}${suffix}`;
        }
    }

    if (urlLower.includes('twitch.tv')) {
        const channel = url.split('/').pop().split('?')[0];
        // Restaurando a lógica que funcionava: o player aceita o próprio domínio como parent se o Referer bater
        return `https://player.twitch.tv/?channel=${channel}&parent=twitch.tv&autoplay=true&muted=false`;
    }

    if (urlLower.includes('kick.com')) {
        const channel = url.split('/').pop().split('?')[0];
        return `https://player.kick.com/${channel}`;
    }

    return url;
}

export async function openLivePip(stream) {
    const embedUrl = getEmbedUrl(stream);
    const isYouTube = stream.url.toLowerCase().includes('youtube.com') || stream.url.toLowerCase().includes('youtu.be');

    // 1. YouTube & Outros: Tentativa de Picture-in-Picture de documento (Sempre no topo)
    // v4.3.9: Agora usamos o Sandbox também no PiP para estabilidade total.
    if (!('documentPictureInPicture' in window)) {
        window.open(isYouTube ? normalizeYoutubeUrl(stream.url) : embedUrl, 'LiveStream', 'width=560,height=315');
        return;
    }

    try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 480,
            height: 270,
        });

        const meta = pipWindow.document.createElement('meta');
        meta.name = 'referrer';
        meta.content = 'strict-origin-when-cross-origin';
        pipWindow.document.head.appendChild(meta);

        const style = pipWindow.document.createElement('style');
        style.textContent = `
            body { margin: 0; padding: 0; background: #000; overflow: hidden; }
            .pip-container { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
            iframe { width: 100%; height: 100%; border: none; }
        `;
        pipWindow.document.head.appendChild(style);

        pipWindow.document.body.innerHTML = `
            <div class="pip-container">
                <iframe src="${embedUrl}" 
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        referrerpolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                        allowfullscreen 
                        style="width: 100%; height: 100%;"></iframe>
            </div>
        `;
    } catch (e) {
        console.error("PiP error:", e);
        window.open(embedUrl, 'LiveStream', 'width=480,height=270');
    }
}

export function renderStreamsPreview() {
    const container = document.getElementById('dash-streams-preview');
    if (!container) return;

    const liveStreams = (state.streams || []).filter(s => s.isLive);
    const liveCount = liveStreams.length;
    
    let subtitleText = '';
    if (liveCount > 0) {
        const countTxt = liveCount === 1 ? t('canal') : t('canais');
        subtitleText = `${liveCount} ${countTxt} ${t('aoVivo')}`;
        // Adiciona nomes dos primeiros canais para o preview
        const names = liveStreams.slice(0, 2).map(s => s.name).join(', ');
        subtitleText += ` • ${names}${liveCount > 2 ? '...' : ''}`;
    } else {
        subtitleText = t('noLiveStreams') || 'Nenhuma live ativa';
    }

    container.innerHTML = `
        <div class="card-icon-area" style="color: var(--primary); background: rgba(var(--primary-rgb), 0.1);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
        </div>
        <div class="card-info">
            <span class="card-title-main">${t('streams') || 'Streams'}</span>
            <span class="card-subtitle-small">
                ${subtitleText}
            </span>
        </div>
        <div class="card-avatars-corner">
            ${liveStreams.slice(0, 3).map(() => `<div class="avatar-dot active"></div>`).join('')}
        </div>
    `;
}
