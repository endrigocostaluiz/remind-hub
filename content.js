(function () {
    function detectChannel() {
        const url = window.location.href;
        let platform = '';
        let channelName = '';
        let channelUrl = '';

        if (url.includes('twitch.tv/')) {
            platform = 'twitch';
            const parts = url.split('twitch.tv/');
            if (parts[1] && !['directory', 'search', 'p'].includes(parts[1].split('/')[0])) {
                channelName = parts[1].split('/')[0].split('?')[0];
                channelUrl = `https://twitch.tv/${channelName}`;
            }
        } else if (url.includes('youtube.com/')) {
            platform = 'youtube';
            // Detect channel from various YT URL patterns
            const parts = url.split('youtube.com/');
            if (parts[1] && (parts[1].startsWith('@') || parts[1].startsWith('c/') || parts[1].startsWith('channel/'))) {
                channelName = parts[1].split('/')[0].split('?')[0];
                channelUrl = `https://youtube.com/${channelName}`;
            } else if (url.includes('/watch?v=')) {
                // On a video page, we can try to find the channel name
                const owner = document.querySelector('ytd-video-owner-renderer #channel-name a');
                if (owner) {
                    channelUrl = owner.href;
                    channelName = owner.innerText.trim();
                }
            }
        } else if (url.includes('kick.com/')) {
            platform = 'kick';
            const parts = url.split('kick.com/');
            if (parts[1] && !['categories', 'search', 'video'].includes(parts[1].split('/')[0])) {
                channelName = parts[1].split('/')[0].split('?')[0];
                channelUrl = `https://kick.com/${channelName}`;
            }
        }

        return channelName ? { platform, channelName, channelUrl } : null;
    }

    async function injectButton(data) {
        if (document.getElementById('remind-hub-add-btn')) return;

        const result = await chrome.storage.local.get('driftweb_accent_color');
        const accentColor = result['driftweb_accent_color'] || '#00C080';
        const r = parseInt(accentColor.slice(1, 3), 16);
        const g = parseInt(accentColor.slice(3, 5), 16);
        const b = parseInt(accentColor.slice(5, 7), 16);
        const rgb = `${r}, ${g}, ${b}`;

        const btn = document.createElement('div');
        btn.id = 'remind-hub-add-btn';
        btn.title = `Adicionar ${data.channelName} ao Remind.hub`;

        const addIcon = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
            </svg>
        `;
        const checkIcon = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;

        btn.innerHTML = addIcon;

        // Custom positioning based on platform
        let bottom = '80px';
        let right = '40px';

        if (data.platform === 'twitch') {
            bottom = '90px';
            right = '30px';
        }

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: bottom,
            right: right,
            width: '36px',
            height: '36px',
            backgroundColor: accentColor,
            color: 'white',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: `0 4px 15px rgba(${rgb}, 0.4)`,
            zIndex: '99999',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            border: 'none'
        });

        btn.addEventListener('mouseover', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.filter = 'brightness(1.1)';
        });
        btn.addEventListener('mouseout', () => {
            btn.style.transform = 'scale(1)';
            btn.style.filter = 'none';
        });

        btn.addEventListener('click', () => {
            chrome.runtime.sendMessage({
                action: 'add-stream',
                stream: {
                    name: data.channelName,
                    url: data.channelUrl
                }
            }, (response) => {
                if (response && response.success) {
                    btn.innerHTML = checkIcon;
                    btn.style.boxShadow = `0 0 20px rgba(${rgb}, 0.6)`;
                    setTimeout(() => {
                        btn.style.opacity = '0';
                        btn.style.transform = 'scale(0.8)';
                        setTimeout(() => btn.remove(), 2000);
                    }, 2000);
                } else {
                    console.error('Erro ao adicionar canal.');
                }
            });
        });

        document.body.appendChild(btn);
    }

    // Update button color if storage changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.driftweb_accent_color) {
            const btn = document.getElementById('remind-hub-add-btn');
            if (btn) {
                const newColor = changes.driftweb_accent_color.newValue;
                btn.style.backgroundColor = newColor;
                const r = parseInt(newColor.slice(1, 3), 16);
                const g = parseInt(newColor.slice(3, 5), 16);
                const b = parseInt(newColor.slice(5, 7), 16);
                btn.style.boxShadow = `0 4px 15px rgba(${r}, ${g}, ${b}, 0.4)`;
            }
        }
    });

    // Refresh detection periodically
    let lastUrl = '';
    setInterval(async () => {
        const result = await chrome.storage.local.get('driftweb_smart_add_enabled');
        const isEnabled = result['driftweb_smart_add_enabled'] !== false;

        if (!isEnabled) {
            const btn = document.getElementById('remind-hub-add-btn');
            if (btn) btn.remove();
            return;
        }

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            const data = detectChannel();
            if (data) {
                const storage = await chrome.storage.local.get('driftweb_streams');
                const streams = storage['driftweb_streams'] || [];
                const isAlreadyAdded = streams.some(s => s.url.toLowerCase().includes(data.channelUrl.toLowerCase()));

                if (!isAlreadyAdded) {
                    injectButton(data);
                } else {
                    const btn = document.getElementById('remind-hub-add-btn');
                    if (btn) btn.remove();
                }
            } else {
                const btn = document.getElementById('remind-hub-add-btn');
                if (btn) btn.remove();
            }
        }
    }, 2000);
})();
