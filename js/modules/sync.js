// js/modules/sync.js
import { state, STORAGE_KEY, SHORTCUTS_KEY, STREAMS_KEY, CATEGORIES_KEY, THEME_KEY, LANG_KEY, STREAMS_INTERVAL_KEY, NOTIFICATION_TIME_KEY, SMART_ADD_ENABLED_KEY, YT_PLAYER_MODE_KEY, NEWS_SOURCES_KEY, NEWS_REFRESH_INTERVAL_KEY, NEWS_PER_SITE_KEY, SESSIONS_KEY, PIP_APPS_KEY, TAGS_KEY, ACCENT_COLOR_KEY, VAULT_REMINDERS_KEY, VAULT_PASS_KEY, VAULT_HINT_KEY, CONTACTS_KEY, CONTACT_TAGS_KEY, CONTACTS_LAYOUT_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { showNotification } from '../utils.js';
import { t } from '../i18n.js';

// Chaves que desejamos sincronizar
const SYNC_KEYS = [
    STORAGE_KEY,
    SHORTCUTS_KEY,
    STREAMS_KEY,
    CATEGORIES_KEY,
    THEME_KEY,
    LANG_KEY,
    STREAMS_INTERVAL_KEY,
    NOTIFICATION_TIME_KEY,
    SMART_ADD_ENABLED_KEY,
    YT_PLAYER_MODE_KEY,
    NEWS_SOURCES_KEY,
    NEWS_REFRESH_INTERVAL_KEY,
    NEWS_PER_SITE_KEY,
    SESSIONS_KEY,
    PIP_APPS_KEY,
    TAGS_KEY,
    ACCENT_COLOR_KEY,
    VAULT_REMINDERS_KEY,
    VAULT_PASS_KEY,
    VAULT_HINT_KEY,
    CONTACTS_KEY,
    CONTACT_TAGS_KEY,
    CONTACTS_LAYOUT_KEY
];

export const syncState = {
    isSyncingIncoming: false,
    isPaused: false,
    user: null, // { email, name, picture, id }
    token: null
};

// Debounce timer para uploads
let uploadTimeout = null;

// Derivar uma chave AES-GCM a partir do ID do usuário (como senha de texto)
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Utilitários seguros para Base64/Uint8Array que evitam estouro de pilha de argumentos (Maximum call stack size exceeded)
function uint8ArrayToBase64(uint8Array) {
    let binary = "";
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Criptografar JSON string
async function encryptData(text, password) {
    const salt = "remind-hub-salt-premium-app";
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(text)
    );
    
    const resultBuffer = new Uint8Array(iv.length + encrypted.byteLength);
    resultBuffer.set(iv, 0);
    resultBuffer.set(new Uint8Array(encrypted), iv.length);
    
    return uint8ArrayToBase64(resultBuffer);
}

// Descriptografar base64
async function decryptData(base64Data, password) {
    try {
        const salt = "remind-hub-salt-premium-app";
        const rawData = base64ToUint8Array(base64Data);
        const iv = rawData.slice(0, 12);
        const encrypted = rawData.slice(12);
        
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encrypted
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        console.error("Erro na descriptografia:", e);
        throw new Error("Falha ao descriptografar dados. Chave incorreta.");
    }
}

// Inicializar sincronização
export async function initSync() {
    // Carregar se está pausado
    try {
        const isPaused = await getStorageData("driftweb_sync_paused", false);
        syncState.isPaused = isPaused;
    } catch (e) {
        console.warn("Erro ao carregar driftweb_sync_paused:", e);
    }

    // Event listener global consolidado para abrir/fechar o dropdown e fechar ao clicar fora
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById("profileDropdown");
        const toggleBtn = document.getElementById("btnProfileDropdownToggle");
        if (!dropdown || !toggleBtn) return;

        if (toggleBtn.contains(e.target)) {
            dropdown.classList.toggle("active");
        } else if (!dropdown.contains(e.target)) {
            dropdown.classList.remove("active");
        }
    });

    // Escutar mudanças locais no storage do Chrome
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (syncState.isSyncingIncoming) return;
        if (syncState.isPaused) return; // Se pausado, não faz upload!
        if (!syncState.user || !syncState.token) return;

        const hasSyncableChange = Object.keys(changes).some(key => SYNC_KEYS.includes(key));
        if (hasSyncableChange) {
            debounceUpload();
        }
    });

    // Tentar login automático via getAuthToken (Chrome)
    try {
        const token = await getAuthTokenSilent();
        if (token) {
            await handleLoginSuccess(token);
            return;
        }
    } catch (e) {
        console.warn("Silent getAuthToken failed:", e);
    }

    // Se falhar ou estiver no Edge, tentar carregar o token salvo no Storage
    try {
        const savedToken = await getStorageData("driftweb_sync_oauth_token");
        const expiresAt = await getStorageData("driftweb_sync_oauth_expires", 0);
        if (savedToken && Date.now() < expiresAt) {
            await handleLoginSuccess(savedToken);
            return;
        }
    } catch (e) {
        console.warn("Silent storage token failed:", e);
    }

    renderUserProfileArea();
}

// Obter token sem interagir
function getAuthTokenSilent() {
    return new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
            resolve(null);
            return;
        }
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError) {
                resolve(null);
            } else {
                resolve(token);
            }
        });
    });
}

// Sucesso no login
async function handleLoginSuccess(token) {
    syncState.token = token;
    
    // Salvar token e expiração (1 hora) no storage local para evitar deslogamentos frequentes
    try {
        const expiresAt = Date.now() + 3500 * 1000;
        await chrome.storage.local.set({
            "driftweb_sync_oauth_token": token,
            "driftweb_sync_oauth_expires": expiresAt
        });
    } catch (e) {
        console.warn("Erro ao salvar token no storage:", e);
    }
    
    // Obter informações do perfil do usuário
    try {
        const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            syncState.user = await res.json();
            renderUserProfileArea();
            // Disparar sincronização de entrada inicial
            await triggerSyncDownload(true);
        } else {
            throw new Error("Falha ao obter info do perfil");
        }
    } catch (e) {
        console.error("Erro no login success:", e);
        // Fallback: tentar obter pelo profile do chrome
        if (chrome.identity && chrome.identity.getProfileUserInfo) {
            chrome.identity.getProfileUserInfo((userInfo) => {
                if (userInfo && userInfo.email) {
                    syncState.user = {
                        email: userInfo.email,
                        id: userInfo.id || userInfo.email,
                        name: userInfo.email.split('@')[0],
                        picture: ''
                    };
                    renderUserProfileArea();
                    triggerSyncDownload(true);
                } else {
                    handleSyncLogout();
                }
            });
        } else {
            // Edge fallback para obter info se não tiver a API profile
            syncState.user = {
                email: "user@gmail.com",
                id: "google-user-edge",
                name: "Usuário Edge",
                picture: ""
            };
            renderUserProfileArea();
            await triggerSyncDownload(true);
        }
    }
}

// Fluxo Web Auth Flow (Edge / Fallback)
function startWebAuthFlow() {
    return new Promise((resolve, reject) => {
        try {
            const manifest = chrome.runtime.getManifest();
            const clientId = manifest.oauth2 ? manifest.oauth2.client_id : '';
            if (!clientId || clientId.includes("placeholder")) {
                reject(new Error("Configure seu Client ID do Google Cloud no manifest.json para ativar a sincronização no Microsoft Edge."));
                return;
            }

            const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
            const scopes = encodeURIComponent("https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}`;

            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, async (redirectUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (redirectUrl) {
                    try {
                        const urlObj = new URL(redirectUrl.replace("#", "?"));
                        const token = urlObj.searchParams.get("access_token");
                        const expiresIn = urlObj.searchParams.get("expires_in") || "3600";
                        
                        if (token) {
                            const expiresAt = Date.now() + (parseInt(expiresIn) - 100) * 1000;
                            await chrome.storage.local.set({
                                "driftweb_sync_oauth_token": token,
                                "driftweb_sync_oauth_expires": expiresAt
                            });
                            
                            await handleLoginSuccess(token);
                            showNotification("Login efetuado com sucesso!", "success");
                            resolve(token);
                        } else {
                            reject(new Error("Token de acesso não encontrado no redirecionamento."));
                        }
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error("URL de redirecionamento nula."));
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

let isLoginInProgress = false;

// Login interativo
export function handleSyncLogin() {
    if (isLoginInProgress) return;
    isLoginInProgress = true;

    const btn = document.getElementById("btnSyncLogin");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="spinning" style="width: 14px; height: 14px; margin-right: 8px; color: white;" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span>Carregando...</span>
        `;
    }

    const resetLoginState = () => {
        isLoginInProgress = false;
        renderUserProfileArea();
    };

    if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
        startWebAuthFlow()
            .then(() => resetLoginState())
            .catch(flowErr => {
                console.error("Web Auth Flow falhou:", flowErr.message);
                showNotification(`Falha ao fazer login com o Google: ${flowErr.message}`, "error");
                resetLoginState();
            });
        return;
    }

    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message;
            console.warn("getAuthToken falhou, tentando launchWebAuthFlow:", err);
            
            startWebAuthFlow()
                .then(() => resetLoginState())
                .catch(flowErr => {
                    console.error("Web Auth Flow falhou:", flowErr.message);
                    showNotification(`Falha ao fazer login com o Google: ${flowErr.message}`, "error");
                    resetLoginState();
                });
            return;
        }
        if (token) {
            await handleLoginSuccess(token);
            showNotification("Login efetuado com sucesso!", "success");
            resetLoginState();
        }
    });
}

// Logout
export function handleSyncLogout() {
    chrome.storage.local.remove(["driftweb_sync_oauth_token", "driftweb_sync_oauth_expires", "driftweb_sync_last_time"], () => {
        if (syncState.token) {
            if (chrome.identity && chrome.identity.removeCachedAuthToken) {
                chrome.identity.removeCachedAuthToken({ token: syncState.token }, () => {
                    syncState.token = null;
                    syncState.user = null;
                    renderUserProfileArea();
                    showNotification("Sessão encerrada.", "success");
                });
            } else {
                syncState.token = null;
                syncState.user = null;
                renderUserProfileArea();
                showNotification("Sessão encerrada.", "success");
            }
        } else {
            syncState.token = null;
            syncState.user = null;
            renderUserProfileArea();
            showNotification("Sessão encerrada.", "success");
        }
    });
}

// Renderizar área do perfil do usuário
function renderUserProfileArea() {
    const area = document.getElementById("userProfileArea");
    if (!area) return;

    if (syncState.user) {
        const pictureHtml = syncState.user.picture 
            ? `<img id="userProfileAvatar" src="${syncState.user.picture}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-glass);" title="${syncState.user.email}">`
            : `<div id="userProfileAvatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; font-size: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-glass);" title="${syncState.user.email}">
                ${syncState.user.email.charAt(0).toUpperCase()}
               </div>`;

        const isPt = state.currentLang === 'pt';
        const logoutText = isPt ? "Sair da Conta" : "Sign Out";
        const deleteCloudText = isPt ? "Excluir dados na nuvem" : "Delete data from cloud";
        const lastSyncLabel = isPt ? "Última sincronização:" : "Last synced:";
        
        const tooltipText = isPt 
            ? "Seus dados estão atualizados na nuvem. Você pode logar em outro computador e seus dados estarão sincronizados!"
            : "Your data is synced to the cloud. You can log in on another computer and your data will be synchronized!";

        chrome.storage.local.get("driftweb_sync_last_time", (res) => {
            const lastTime = res.driftweb_sync_last_time || 0;
            let lastSyncFormatted = isPt ? "Nunca" : "Never";
            if (lastTime > 0) {
                const dateObj = new Date(lastTime);
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
                lastSyncFormatted = `${dateStr} ${isPt ? 'às' : 'at'} ${timeStr}`;
            }

            const isPaused = syncState.isPaused;
            const pauseText     = isPaused ? (isPt ? "Retomar Sincronização" : "Resume Sync") : (isPt ? "Pausar Sincronização" : "Pause Sync");
            const pauseColor    = isPaused ? "#f59e0b" : "var(--text-muted)";
            const pauseBorder   = isPaused ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.05)";
            const pauseBg       = isPaused ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)";
            // Ícone do badge muda quando pausado
            const badgeColor    = isPaused ? "#f59e0b" : "#00C080";
            const badgeIconSvg  = isPaused
                ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
                : `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            area.innerHTML = `
                <div class="user-profile" style="display: flex; align-items: center; gap: 8px; position: relative;">
                    <div style="position: relative; display: flex; align-items: center; cursor: pointer;" id="btnProfileDropdownToggle">
                        ${pictureHtml}
                        <div class="sync-status-icon" style="position: absolute; bottom: -2px; right: -2px; background: var(--bg-main); border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; color: ${badgeColor}; border: 1px solid var(--border-glass); cursor: help;">
                            ${badgeIconSvg}
                            <div class="custom-tooltip" style="
                                position: absolute;
                                top: 22px;
                                right: 0;
                                width: 210px;
                                background: var(--bg-glass);
                                backdrop-filter: blur(12px);
                                border: 1px solid var(--border-glass);
                                color: var(--text-main);
                                padding: 8px 12px;
                                border-radius: 8px;
                                font-size: 11px;
                                line-height: 1.4;
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                                pointer-events: none;
                                opacity: 0;
                                transform: translateY(-10px);
                                transition: opacity 0.2s ease, transform 0.2s ease;
                                z-index: 1000;
                                white-space: normal;
                            ">
                                ${tooltipText}
                            </div>
                        </div>
                    </div>

                    <div id="profileDropdown" class="profile-dropdown">
                        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; border-bottom: 1px solid var(--border-glass); padding-bottom: 12px; margin-bottom: 4px;">
                            <div style="font-weight: bold; font-size: 13px; color: var(--text-main);">${syncState.user.name || 'Usuário Google'}</div>
                            <div style="font-size: 11px; color: var(--text-muted); opacity: 0.8; word-break: break-all;">${syncState.user.email}</div>
                        </div>
                        
                        <div style="font-size: 11px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                            <span style="opacity: 0.7;">${lastSyncLabel}</span>
                            <span style="font-weight: bold; color: var(--primary);">${lastSyncFormatted}</span>
                        </div>

                        <button id="btnToggleSyncPause" data-action="sync-toggle-pause" class="glass-btn" style="padding: 8px; font-size: 11px; color: ${pauseColor}; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid ${pauseBorder}; background: ${pauseBg};">
                            ${isPaused
                                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
                                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
                            }
                            <span>${pauseText}</span>
                        </button>

                        <button id="btnDeleteSyncBackup" data-action="sync-delete-cloud" class="glass-btn" style="padding: 8px; font-size: 11px; color: #ff4a4a; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(255, 74, 74, 0.2); background: rgba(255, 74, 74, 0.05);">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            <span>${deleteCloudText}</span>
                        </button>

                        <button id="btnSyncLogout" data-action="sync-logout" class="glass-btn" style="padding: 8px; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            <span>${logoutText}</span>
                        </button>
                    </div>
                </div>
            `;
        });
    } else {
        area.innerHTML = `
            <button id="btnSyncLogin" data-action="sync-login" class="glass-btn" style="padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.05);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.743-.08-1.3-.177-1.86H12.24z"/></svg>
                <span>Google Login</span>
            </button>
        `;
    }
}

// Debounce para fazer o upload
function debounceUpload() {
    if (uploadTimeout) clearTimeout(uploadTimeout);
    uploadTimeout = setTimeout(async () => {
        try {
            await requestSyncUpload();
        } catch (e) {
            console.error("Erro no debounce upload:", e);
        }
    }, 3000); // 3 segundos de debounce
}

// Enviar dados para o Google Drive
export async function requestSyncUpload() {
    if (syncState.isPaused) return; // Se pausado, não faz upload!
    if (!syncState.user || !syncState.token) return;

    try {
        const localData = await chrome.storage.local.get(SYNC_KEYS);
        const payload = {
            version: 1,
            lastUpdated: Date.now(),
            data: localData
        };

        const password = syncState.user.id || syncState.user.email;
        const encryptedText = await encryptData(JSON.stringify(payload), password);

        // Buscar arquivo existente no drive
        const fileId = await findSyncFile();
        
        let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
        let method = "POST";
        let body;

        const metadata = {
            name: "remind_hub_sync.json",
            parents: ["appDataFolder"]
        };

        const boundary = "314159265358979323846";

        if (fileId) {
            url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
            method = "PATCH";
            body = encryptedText;
        } else {
            // Multipart upload (metadados + conteúdo) para criar
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            body = 
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: text/plain\r\n\r\n' +
                encryptedText +
                closeDelimiter;

            url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
        }

        const headers = {
            Authorization: `Bearer ${syncState.token}`
        };
        if (!fileId) {
            headers["Content-Type"] = `multipart/related; boundary=${boundary}`;
        } else {
            headers["Content-Type"] = "text/plain";
        }

        const res = await fetch(url, {
            method,
            headers,
            body
        });

        if (res.ok) {
            // Salvar o timestamp da sincronização localmente
            await chrome.storage.local.set({ "driftweb_sync_last_time": payload.lastUpdated });
            renderUserProfileArea();
        } else {
            const errText = await res.text();
            throw new Error(`API Google ${res.status}: ${errText}`);
        }
    } catch (e) {
        console.error("Erro no requestSyncUpload:", e);
        showNotification(`Erro ao salvar na nuvem: ${e.message}`, "error");
    }
}

// Baixar dados do Google Drive
export async function triggerSyncDownload(isInitial = false) {
    if (syncState.isPaused) return; // Se pausado, não faz download!
    if (!syncState.user || !syncState.token) return;

    try {
        const fileId = await findSyncFile();
        if (!fileId) {
            // Arquivo não existe no Drive, fazer o upload inicial do que temos local
            if (isInitial) {
                await requestSyncUpload();
            }
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${syncState.token}` }
        });

        if (res.ok) {
            const encryptedText = await res.text();
            if (!encryptedText) return;

            const password = syncState.user.id || syncState.user.email;
            const decryptedText = await decryptData(encryptedText, password);
            const payload = JSON.parse(decryptedText);

            // Comparar data da última atualização
            const localLastSyncTime = await getStorageData("driftweb_sync_last_time", 0);
            
            if (payload.lastUpdated > localLastSyncTime) {
                // Atualizar o storage local de forma silenciosa
                syncState.isSyncingIncoming = true;
                
                try {
                    await chrome.storage.local.set(payload.data);
                    await chrome.storage.local.set({ "driftweb_sync_last_time": payload.lastUpdated });
                    renderUserProfileArea();
                    
                    if (isInitial) {
                        // Forçar recarga da UI no download inicial
                        if (typeof window.render === 'function') {
                            window.render();
                        }
                    } else {
                        showNotification("Dados sincronizados com o Google Drive.", "success");
                    }
                } finally {
                    syncState.isSyncingIncoming = false;
                }
            }
        } else {
            const errText = await res.text();
            throw new Error(`API Google ${res.status}: ${errText}`);
        }
    } catch (e) {
        console.error("Erro no triggerSyncDownload:", e);
        showNotification(`Erro ao baixar da nuvem: ${e.message}`, "error");
    }
}

// Procurar arquivo no appDataFolder e retornar o id dele
async function findSyncFile() {
    try {
        const res = await fetch("https://www.googleapis.com/drive/v3/files?q=name='remind_hub_sync.json'&spaces=appDataFolder", {
            headers: { Authorization: `Bearer ${syncState.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.files && data.files.length > 0) {
                return data.files[0].id;
            }
        } else {
            const errText = await res.text();
            throw new Error(`API Google ${res.status}: ${errText}`);
        }
    } catch (e) {
        console.error("Erro ao buscar arquivo no Drive:", e);
        showNotification(`Erro ao ler status da nuvem: ${e.message}`, "error");
    }
    return null;
}

// Excluir arquivo de sincronização no Google Drive
export async function deleteSyncBackup() {
    if (!syncState.token) {
        showNotification("Faça login para poder excluir os dados da nuvem.", "error");
        return;
    }

    const isPt = state.currentLang === 'pt';
    const confirmMessage = isPt 
        ? "Tem certeza que deseja excluir permanentemente todos os seus dados salvos na nuvem do Google Drive? Esta ação não pode ser desfeita."
        : "Are you sure you want to permanently delete all your cloud backup data from Google Drive? This action cannot be undone.";

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const fileId = await findSyncFile();
        if (!fileId) {
            showNotification("Nenhum backup encontrado na nuvem.", "warning");
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${syncState.token}` }
        });

        if (res.ok || res.status === 204) {
            await chrome.storage.local.remove("driftweb_sync_last_time");
            showNotification("Backup excluído da nuvem com sucesso!", "success");
            
            const dropdown = document.getElementById("profileDropdown");
            if (dropdown) dropdown.classList.remove("active");
            
            renderUserProfileArea();
        } else {
            throw new Error(`Exclusão falhou com status ${res.status}`);
        }
    } catch (e) {
        console.error("Erro ao excluir sincronização do Drive:", e);
        showNotification("Erro ao excluir dados do Google Drive.", "error");
    }
}

// Alternar pausa da sincronização
export async function toggleSyncPause() {
    syncState.isPaused = !syncState.isPaused;
    await chrome.storage.local.set({ "driftweb_sync_paused": syncState.isPaused });

    // Fechar dropdown e atualizar badge IMEDIATAMENTE (antes de qualquer await assíncrono)
    const dropdown = document.getElementById("profileDropdown");
    if (dropdown) dropdown.classList.remove("active");
    renderUserProfileArea();
    
    const isPt = state.currentLang === 'pt';
    if (syncState.isPaused) {
        showNotification(isPt ? "Sincronização em nuvem pausada." : "Cloud synchronization paused.", "warning");
    } else {
        showNotification(isPt ? "Sincronização em nuvem retomada!" : "Cloud synchronization resumed!", "success");
        // Forçar upload em background ao retomar (sem bloquear a UI)
        requestSyncUpload().catch(e => console.error("Erro ao sincronizar após retomar:", e));
    }
}

// Sincronizar na janela global
window.triggerSyncDownload = triggerSyncDownload;
