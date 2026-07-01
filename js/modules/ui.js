// js/modules/ui.js
import { state, THEME_KEY, LANG_KEY, SIDEBAR_COLLAPSED_KEY, ACCENT_COLOR_KEY, LAST_SEEN_NEWS_KEY } from '../state.js';
import { t } from '../i18n.js';
import { setStorageData } from '../storage.js';
import { showNotification, escapeHtml } from '../utils.js';
import { checkAllStreamsStatus, updateStreamsSidebarIndicator } from './streams.js';
import { loadAndRenderNews, updateNewsSidebarIndicator } from './news.js';
import { renderContacts } from './contacts.js';

let draggedItem = null;
let draggedList = null;

export function applyTheme() {
    const isDarkMode = state.isDarkMode !== false;
    document.body.classList.toggle('light-mode', !isDarkMode);
    document.body.classList.toggle('dark-mode', isDarkMode);
    const themeText = document.querySelector('#themeToggleDashboard span');
    const themeIcon = document.querySelector('#themeToggleDashboard svg');
    if (themeText) themeText.innerText = isDarkMode ? t('darkMode') : t('lightMode');
    if (themeIcon) {
        themeIcon.innerHTML = isDarkMode
            ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>'
            : '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
    applyAccentColor(state.accentColor);
}

export function applyAccentColor(color) {
    if (!color) color = '#00C080';
    state.accentColor = color;
    
    const rgb = hexToRgb(color);
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-rgb', rgb);
    document.documentElement.style.setProperty('--primary-glow', `rgba(${rgb}, 0.4)`);
    
    // Save to localStorage for ultra-fast head script access
    localStorage.setItem('driftweb_accent_color', color);
    
    // Update active dot in settings if visible
    const dots = document.querySelectorAll('.color-dot');
    dots.forEach(dot => {
        if (dot.dataset.color === color) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

export async function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    await setStorageData(THEME_KEY, state.isDarkMode);
    applyTheme();
}

export function showView(view) {
    const oldView = state.currentView;
    state.currentView = view;

    // Sincronizar notícias ao entrar na aba para limpar o indicador imediatamente
    if (view === 'news' && state.cachedNewsData.length > 0) {
        state.lastSeenNewsUrls = state.cachedNewsData.map(item => item.link);
        setStorageData(LAST_SEEN_NEWS_KEY, state.lastSeenNewsUrls);
        updateNewsSidebarIndicator();
    }

    // Sincronizar notícias ao sair da aba para garantir persistência
    if (oldView === 'news' && state.cachedNewsData.length > 0) {
        state.lastSeenNewsUrls = state.cachedNewsData.map(item => item.link);
        setStorageData(LAST_SEEN_NEWS_KEY, state.lastSeenNewsUrls);
    }

    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');
    
    navLinks.forEach(l => {
        if (l.dataset.view === view) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    sections.forEach(s => {
        if (s.id === `view-${view}`) {
            s.classList.add('active');
        } else {
            s.classList.remove('active');
        }
    });

    // View specific logic
    const searchInput = document.getElementById('globalSearch');
    if (view === 'streams') {
        checkAllStreamsStatus();
        if (searchInput) searchInput.placeholder = t('searchStreamsPlaceholder');
    } else if (view === 'calendar') {
        if (typeof window.renderCalendar === 'function') window.renderCalendar();
        if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    } else if (view === 'kanban') {
        if (typeof window.renderKanban === 'function') window.renderKanban();
        if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    } else if (view === 'news') {
        updateNewsSidebarIndicator();
        loadAndRenderNews();
        if (searchInput) searchInput.placeholder = t('searchNewsPlaceholder');
    } else if (view === 'pipApps') {
        if (searchInput) searchInput.placeholder = t('searchPipAppsPlaceholder');
    } else if (view === 'sessions') {
        if (searchInput) searchInput.placeholder = t('searchSessionsPlaceholder');
    } else if (view === 'contacts') {
        renderContacts();
        if (searchInput) searchInput.placeholder = t('searchContactsPlaceholder');
    } else if (view === 'vault') {
        if (typeof window.renderVault === 'function') window.renderVault();
    } else {
        if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    }

    // Update sidebar indicators
    updateStreamsSidebarIndicator();
    updateNewsSidebarIndicator();

    // Sincronizar dados em background
    if (typeof window.triggerSyncDownload === 'function') {
        window.triggerSyncDownload();
    }
}

export function enableDragAndDrop(selector, listData, saveCallback) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => {
        // Ignorar elementos dentro do Kanban board para evitar conflitos
        if (el.closest('.kanban-board')) return;

        el.setAttribute('draggable', 'true');

        el.ondragstart = (e) => {
            if (state.isMultiViewSelectionMode) {
                e.preventDefault();
                return false;
            }
            e.stopPropagation();
            draggedItem = el;
            draggedList = listData;

            if (selector === '.stream-card') {
                el.classList.add('dragging');
                document.querySelectorAll(selector).forEach(item => {
                    if (item !== el) item.classList.add('drag-passive');
                });
            }

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        };

        el.ondragend = () => {
            if (selector === '.stream-card') {
                el.classList.remove('dragging');
                document.querySelectorAll(selector).forEach(item => {
                    item.classList.remove('drag-passive');
                });
            }
            document.querySelectorAll(selector).forEach(item => item.classList.remove('drag-over'));
            draggedItem = null;
        };

        el.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };

        el.ondragenter = (e) => {
            e.stopPropagation();
            if (el !== draggedItem) el.classList.add('drag-over');
        };

        el.ondragleave = (e) => {
            e.stopPropagation();
            el.classList.remove('drag-over');
        };

        el.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!draggedItem || draggedItem === el) return;

            const fromId = draggedItem.dataset.id;
            const toId = el.dataset.id;

            if (fromId !== toId) {
                const fromIndex = listData.findIndex(item => String(item.id) === String(fromId));
                const toIndex = listData.findIndex(item => String(item.id) === String(toId));

                if (fromIndex !== -1 && toIndex !== -1) {
                    const movedItem = listData[fromIndex];

                    if (selector === '.shortcut-item') {
                        const targetItem = listData[toIndex];
                        if (targetItem) {
                            movedItem.categoryId = targetItem.categoryId;
                        }
                    }

                    listData.splice(fromIndex, 1);
                    listData.splice(toIndex, 0, movedItem);

                    saveCallback();
                    if (window.render) window.render();
                    showNotification(t('orderUpdated'));
                }
            }
            return false;
        };
    });
}

export function processImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxSize = 1920;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL(file.type));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function copyImageToClipboard(base64Src, showNotify = true, customMsg = null) {
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
                    canvas.toBlob((blob) => {
                        blobToCopy = blob;
                        resolve();
                    }, 'image/png');
                };
                img.onerror = reject;
                img.src = base64Src;
            });
        }

        const item = new ClipboardItem({ 'image/png': blobToCopy });
        await navigator.clipboard.write([item]);

        if (showNotify) {
            showNotification(customMsg || t('imageCopied'), 'success');
        }
        return true;
    } catch (err) {
        if (showNotify) {
            showNotification(t('copyImageError'), 'error');
        }
        return false;
    }
}

export function renderChangelog() {
    const container = document.getElementById('changelog-container');
    if (!container) return;

    const changelog = [
        {
            version: "5.1.8",
            date: "30 Jun 2026",
            changes: [
                "Sincronização em Nuvem: Integração completa com Google Drive (OAuth2) para backup automático e criptografado dos seus dados.",
                "Pausar/Retomar Sync: Novo botão no menu de perfil para pausar e retomar a sincronização em nuvem sem sair da conta.",
                "Badge dinâmico: O ícone de status na foto do usuário muda para amarelo (pausa) ou verde (ativo) conforme o estado da sincronização.",
                "Excluir Backup: Opção para apagar permanentemente os dados do Google Drive com confirmação em português.",
                "Backup JSON Total: Exportação e importação de todos os dados locais com suporte a formatos legados.",
                "Correções de Estabilidade: Resolvido estouro de pilha na conversão Base64 com grandes volumes de dados."
            ]
        },
        {
            version: "5.1.6",
            date: "10 Jun 2026",
            changes: [
                "Visualização por Pastas: Adicionado modo de visualização agrupado por pastas de tags na Agenda de Contatos.",
                "Máscara de Telefone: Inclusão de máscara de digitação brasileira inteligente e condicional baseada no idioma ativo (pt-BR).",
                "Organização Inteligente: Contatos sem tags associadas são automaticamente agrupados em uma pasta especial 'Sem Tag'.",
                "Busca Integrada: Ao realizar pesquisas no modo pastas, as pastas condizentes são expandidas automaticamente para exibição imediata dos resultados.",
                "Experiência Fluida: Transição de layouts instantânea com persistência de preferências de visualização."
            ]
        },
        {
            version: "5.1.5",
            date: "10 Jun 2026",
            changes: [
                "Tags Independentes: Separação completa de tags de contatos e lembretes com persistência e seletores exclusivos.",
                "Correção de Sobreposição: Modal de seleção de tags de contato agora abre com z-index correto por cima do formulário de contato.",
                "WhatsApp Premium: O botão de compartilhamento nos cards foi limpo de fundos cinzas e foi inserido o ícone oficial na cor verde em toda a extensão."
            ]
        },
        {
            version: "5.1.4",
            date: "10 Jun 2026",
            changes: [
                "Agenda de Contatos: Adicionado gerenciador completo de contatos com busca e compartilhamento rápido via WhatsApp.",
                "Menu Simplificado: Remoção do Modo Foco para uma interface mais limpa, ágil e focada em produtividade.",
                "Compartilhamento Rápido: Botão de compartilhamento WhatsApp adicionado diretamente no canto inferior direito dos cards de contatos.",
                "Melhorias de Usabilidade: Ajustes finos de layout e navegação premium."
            ]
        },
        {
            version: "5.1.3",
            date: "07 May 2026",
            changes: [
                "Gestão de PiP Apps: Implementação de lógica robusta de edição via modal para aplicativos flutuantes.",
                "Modo de Edição UI/UX: Adicionado toggle de gerenciamento que oculta botões de interação para evitar cliques acidentais durante a edição.",
                "Correções de Estabilidade: Registro corrigido de event listeners e bindings de ações no orquestrador principal (main.js).",
                "Refinamentos Visuais: Ajustes de renderização e correção de regressões tipográficas em toda a interface."
            ]
        },
        {
            version: "5.1.2",
            date: "30 Apr 2026",
            changes: [
                "Nova Seção de Apoio: Implementação de opções de doação via PIX e Buy Me a Coffee no menu lateral.",
                "Menu Reformulado: O antigo menu 'Indique' agora é 'Apoio / Indique', com layout moderno em grid.",
                "Cópia Rápida de PIX: Adicionado botão para copiar a chave PIX (e-mail) com apenas um clique.",
                "Melhorias Visuais: Ajustes na interface de compartilhamento para melhor usabilidade e estética."
            ]
        },
        {
            version: "5.1.1",
            date: "24 Apr 2026",
            changes: [
                "Melhoria na Verificação de Atualizações: Novo sistema híbrido que checa versões ao iniciar e via botão manual.",
                "Notificações em Background: Alertas imediatos via sistema assim que uma nova versão é baixada pelo Chrome.",
                "Tratamento de Throttling: Feedback preciso quando o limite de requisições do Google é atingido.",
                "Correção de Carregamento: Resolvido erro de referência que poderia travar a inicialização da dashboard."
            ]
        },
        {
            version: "5.1.0",
            date: "23 Apr 2026",
            changes: [
                "Novo Recurso: Cofre (Vault) - Área protegida para lembretes sensíveis com criptografia de senha e frase de recuperação.",
                "Estatísticas do Kanban: Novo painel de acompanhamento em tempo real no topo do quadro visual.",
                "Integração do Cofre: Reordenação por Drag-and-Drop e filtros por tags agora suportados em lembretes privados.",
                "UX Refinada: Ocultação automática de campos vazios (Tags/Links/Checklist) no modal de visualização para uma interface mais limpa.",
                "Correções Globais: Sincronização instantânea de idioma no Dashboard e no widget de Streams sem necessidade de recarregar."
            ]
        },
        {
            version: "5.0.3",
            date: "22 Apr 2026",
            changes: [
                "Melhorias no Envio de Feedback: Integração real com Web3Forms para sugestões e reports.",
                "Novas Opções de Compartilhamento: Implementação dos botões de WhatsApp e E-mail.",
                "Correção de Backup: Resolvido problema que impedia a importação de arquivos JSON.",
                "Ajustes de UI: Pequenos refinamentos nos formulários de configuração."
            ]
        },
        {
            version: "5.0.0",
            date: "22 Apr 2026",
            changes: [
                "Temas Dinâmicos: Introdução de 6 paletas de cores vibrantes com sincronização total em toda a UI.",
                "Estabilidade Visual: Fim definitivo do 'flash' verde no carregamento com novo sistema de preloader.",
                "Novo Motor Kanban: Gestão visual de lembretes com Drag-and-Drop persistente.",
                "Sincronização de Cores: Indicadores de live, notificações e links agora seguem o tema escolhido.",
                "Smart Add v2: Botão de captura externa sincronizado com o tema e reativo a mudanças.",
                "Segurança de Conteúdo: Bloqueio de lembretes individuais com senha própria.",
                "Sistema de Novidades: Novo modal automático para informar sobre atualizações importantes."
            ]
        },
        {
            version: "4.9.4",
            date: "13 Apr 2026",
            changes: [
                "Correção Dashboard: Resolvida a tela preta ao alternar entre visualização em lista e colunas.",
                "Home Dashboard: Adicionados atalhos rápidos para aplicativos PiP logo abaixo dos atalhos normais."
            ]
        },
        // ... (truncated versions)
        {
            version: "4.9.0",
            date: "24 Mar 2026",
            changes: [
                "Tags Persistentes: Agora as tags são salvas e ficam disponíveis para reuso mesmo que o lembrete seja deletado.",
                "Gerenciamento de Tags: Adicionada opção de editar (renomear globalmente) e deletar tags diretamente no modal.",
                "Correção de Notificações: Fim dos falsos positivos no ponto vermelho da sidebar; notícias lidas agora são respeitadas.",
                "Otimização de Rede: Redução drástica de fetches de notícias, economizando bateria e dados ao navegar em outras abas."
            ]
        }
    ];

    container.innerHTML = changelog.map(item => `
        <div class="changelog-item">
            <div class="changelog-version">
                ${t('version')} ${item.version}
                <span class="changelog-date">${item.date}</span>
            </div>
            <ul class="changelog-list">
                ${item.changes.map(change => `<li>${change}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

export function getFaviconUrl(url) {
    return `https://www.google.com/s2/favicons?domain=${url}&sz=64`;
}
