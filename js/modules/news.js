// js/modules/news.js
import { state, NEWS_SOURCES_KEY, NEWS_REFRESH_INTERVAL_KEY, NEWS_PER_SITE_KEY, READ_NEWS_KEY, LAST_SEEN_NEWS_KEY, NEWS_CACHE_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { t } from '../i18n.js';
import { showNotification } from '../utils.js';

export const NEWS_SIGNATURES = {
    'arcraiders.com': {
        item: '.news-article-card_container__bT0cM, a[href*="/news/"]',
        title: 'div.news-article-card_dateWrapper__R5pX3 + div',
        image: 'img',
        date: 'time, .news-article-card_dateWrapper__R5pX3',
        link: 'href'
    },
    'ubisoft.com': {
        item: '.updatesFeed__item, .updatesFeed-item, article.news-card',
        title: 'h3.news-card__title, h2, .updatesFeed__title',
        image: 'img.news-card__image, img',
        date: 'time, .news-card__date, span.date',
        link: 'href',
        image_attr: 'src' // Some sites use data-src
    },
    'blizzard.com': {
        item: '.NewsCard, blz-card[type="Article"], .LatestNews-item',
        title: 'h3, [slot="heading"], .LatestNews-itemTitle',
        image: 'img, .LatestNews-itemImage',
        date: 'time, .date, [slot="date"]',
        link: 'a, href'
    }
};

export async function loadNewsPreferences() {
    const savedNewsInterval = await getStorageData(NEWS_REFRESH_INTERVAL_KEY, 60);
    state.newsRefreshInterval = parseInt(savedNewsInterval);
    const newsInput = document.getElementById('newsRefreshInterval');
    const newsDisplay = document.getElementById('newsRefValueDisplay');
    if (newsInput) newsInput.value = state.newsRefreshInterval;
    if (newsDisplay) newsDisplay.innerText = `${state.newsRefreshInterval} min`;

    const savedNewsPerSite = await getStorageData(NEWS_PER_SITE_KEY, 5);
    state.newsPerSite = parseInt(savedNewsPerSite);
    const npsInput = document.getElementById('newsPerSiteLimit');
    const npsDisplay = document.getElementById('newsPerSiteDisplay');
    if (npsInput) npsInput.value = state.newsPerSite;
    if (npsDisplay) npsDisplay.innerText = t('newsPerSiteDisplay', { count: state.newsPerSite });

    await loadNewsSources();
    renderNewsSources();
    state.readNewsUrls = await getStorageData(READ_NEWS_KEY, []);
    state.lastSeenNewsUrls = await getStorageData(LAST_SEEN_NEWS_KEY, []);
    state.cachedNewsData = await getStorageData(NEWS_CACHE_KEY, []);
    
    // Suporte ao desejo do usuário: carregar inativa. 
    // Sincronizamos o que "vimos" com o que temos no cache para que apenas o que vier no FETCH novo dispare o ponto.
    if (state.cachedNewsData.length > 0) {
        const cachedLinks = state.cachedNewsData.map(item => item.link);
        // Só adicionamos ao lastSeen se ainda não estiver lá, para não perder histórico de "não lidos" mas "vistos"
        let changed = false;
        cachedLinks.forEach(link => {
            if (!state.lastSeenNewsUrls.includes(link)) {
                state.lastSeenNewsUrls.push(link);
                changed = true;
            }
        });
        if (changed) {
            setStorageData(LAST_SEEN_NEWS_KEY, state.lastSeenNewsUrls);
        }
    }
}

export async function saveNewsPreferences() {
    await setStorageData(NEWS_REFRESH_INTERVAL_KEY, state.newsRefreshInterval);
    await setStorageData(NEWS_PER_SITE_KEY, state.newsPerSite);
}

// News Source Logic
export async function loadNewsSources() {
    try {
        state.newsSources = await getStorageData(NEWS_SOURCES_KEY, []);
        if (!Array.isArray(state.newsSources)) state.newsSources = [];
    } catch (e) {
        state.newsSources = [];
    }
}

export async function saveNewsSources() {
    await setStorageData(NEWS_SOURCES_KEY, state.newsSources);
    renderNewsSources();
}

export async function addNewsSource() {
    const input = document.getElementById('newsSourceUrl');
    const url = input.value.trim();

    if (!url) {
        showNotification(t('urlRequired'), 'error');
        return;
    }

    if (state.newsSources.find(s => s.url === url)) {
        showNotification('Fonte já cadastrada!', 'error');
        return;
    }

    state.newsSources.push({ id: Date.now(), url: url });
    await saveNewsSources();
    input.value = '';
    showNotification(t('newsSourceAdded'));
}

export function deleteNewsSource(id) {
    state.newsSources = state.newsSources.filter(s => s.id !== id);
    saveNewsSources();
    showNotification(t('newsSourceRemoved'));
}

export function renderNewsSources() {
    const list = document.getElementById('newsSourcesList');
    if (!list) return;

    list.innerHTML = '';
    state.newsSources.forEach(s => {
        const item = document.createElement('div');
        item.className = 'glass-btn';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '8px 12px';
        item.style.cursor = 'default';

        const urlText = document.createElement('span');
        urlText.className = 'truncate';
        urlText.style.fontSize = '12px';
        urlText.innerText = s.url;

        const btnRemove = document.createElement('button');
        btnRemove.className = 'glass-btn danger';
        btnRemove.style.padding = '4px 8px';
        btnRemove.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        btnRemove.onclick = () => deleteNewsSource(s.id);

        item.appendChild(urlText);
        item.appendChild(btnRemove);
        list.appendChild(item);
    });
}

export async function translateText(text, targetLang) {
    if (!text || !targetLang || targetLang === 'en') return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            return data[0].map(x => x[0]).join('');
        }
    } catch (e) {
        console.warn("Translation failed:", e);
    }
    return text;
}

export function formatDateLong(timestamp, lang) {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return t('recent');

    const localeStr = lang === 'pt' ? 'pt-BR' : 'en-US';
    return d.toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function parseDateSafe(dateStr) {
    if (!dateStr) return Date.now();

    // Lowcase and remove "de" (common in PT dates: "3 de Março")
    let s = dateStr.toLowerCase().replace(/ de /g, ' ').replace(/\//g, '-').trim();

    const monthsPt = {
        'janeiro': 'jan', 'fevereiro': 'feb', 'março': 'mar', 'abril': 'apr',
        'maio': 'may', 'junho': 'jun', 'julho': 'jul', 'agosto': 'aug',
        'setembro': 'sep', 'outubro': 'oct', 'novembro': 'nov', 'dezembro': 'dec'
    };

    for (const [pt, en] of Object.entries(monthsPt)) {
        if (s.includes(pt)) {
            s = s.replace(pt, en);
            break;
        }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();

    // Fallback for DD-MM-YYYY or common PT numeric formats
    const parts = s.split(/[- ]/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0]);
        const year = parseInt(parts[2]);
        if (day > 0 && day <= 31 && year > 1900) {
            let month = parseInt(parts[1]) - 1;
            const d2 = new Date(year, month || 0, day);
            if (!isNaN(d2.getTime())) return d2.getTime();
        }
    }

    return Date.now(); // Final fallback
}

export async function fetchNews(silent = false) {
    const allNews = [];
    const loader = document.getElementById('newsLoader');
    const grid = document.getElementById('newsGrid');

    if (!silent) {
        if (loader) loader.style.display = 'block';
        if (grid) grid.style.display = 'none';
    }

    const fetchPromises = state.newsSources.map(async (source) => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'fetch-url', url: source.url });
            if (response && response.success) {
                const text = response.text;
                const trimmedText = text.trim();
                const baseUrl = new URL(source.url);

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, 'text/xml');
                const rootName = xmlDoc.documentElement ? xmlDoc.documentElement.nodeName.toLowerCase() : '';
                const isXML = ['rss', 'feed'].includes(rootName) || trimmedText.startsWith('<?xml');

                if (isXML) {
                    let items = [];
                    if (rootName === 'rss' || xmlDoc.querySelector('rss') || xmlDoc.querySelector('channel')) {
                        items = parseRSS(xmlDoc, baseUrl.hostname);
                    } else {
                        items = parseAtom(xmlDoc, baseUrl.hostname);
                    }
                    return items.slice(0, state.newsPerSite);
                }

                if (baseUrl.hostname.includes('grayzonewarfare.com')) {
                    const blocks = text.split(/\{\\?"id\\?":/);
                    let extracted = [];
                    for (let i = 1; i < blocks.length; i++) {
                        const block = blocks[i];
                        const titleMatch = block.match(/"title\\?":\\?"(.*?)\\?"/);
                        const linkMatch = block.match(/"link\\?":\\?"(.*?)\\?"/);
                        const imgMatch = block.match(/"previewImage\\?":\\?"(.*?)\\?"/);
                        const dateMatch = block.match(/"date\\?":\\?"\$D(.*?)\\?"/);

                        if (titleMatch && linkMatch && imgMatch) {
                            extracted.push({
                                title: titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, ''),
                                link: baseUrl.origin + '/news/' + linkMatch[1].replace(/\\\\/g, ''),
                                date: formatDateLong(parseDateSafe(dateMatch ? dateMatch[1].replace(/\\\\/g, '') : Date.now()), state.currentLang),
                                timestamp: parseDateSafe(dateMatch ? dateMatch[1].replace(/\\\\/g, '') : Date.now()),
                                image: imgMatch[1].replace(/\\\//g, '/').replace(/\\\\/g, ''),
                                source: baseUrl.hostname
                            });
                        }
                    }
                    if (extracted.length > 0) {
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(e => { if (!seen.has(e.link)) { seen.add(e.link); unique.push(e); } });
                        return unique.slice(0, state.newsPerSite);
                    }
                }

                const doc = new DOMParser().parseFromString(text, 'text/html');

                const discoverAndFetchRSS = async (htmlDoc, originalUrl) => {
                    const rssLink = htmlDoc.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]');
                    if (rssLink && rssLink.href) {
                        try {
                            const feedUrl = new URL(rssLink.getAttribute('href'), originalUrl).href;
                            const rssRes = await chrome.runtime.sendMessage({ action: 'fetch-url', url: feedUrl });
                            if (rssRes && rssRes.success) {
                                const rssDoc = new DOMParser().parseFromString(rssRes.text, 'text/xml');
                                if (rssDoc.querySelector('rss') || rssDoc.querySelector('channel')) {
                                    return parseRSS(rssDoc, new URL(originalUrl).hostname);
                                } else if (rssDoc.querySelector('feed')) {
                                    return parseAtom(rssDoc, new URL(originalUrl).hostname);
                                }
                            }
                        } catch (e) {
                            console.error(`[News] Failed to fetch discovered RSS: ${e}`);
                        }
                    }
                    return null;
                };

                let extracted = [];
                let domainKey = '';

                const jsonLds = doc.querySelectorAll('script[type="application/ld+json"]');
                jsonLds.forEach(script => {
                    try {
                        const data = JSON.parse(script.textContent);
                        const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
                        items.forEach(item => {
                            if ((item['@type'] === 'NewsArticle' || item['@type'] === 'Article') && extracted.length < state.newsPerSite) {
                                extracted.push({
                                    title: item.headline || item.name,
                                    link: item.url || source.url,
                                    date: formatDateLong(parseDateSafe(item.datePublished || Date.now()), state.currentLang),
                                    timestamp: parseDateSafe(item.datePublished || Date.now()),
                                    image: (item.image && typeof item.image === 'string') ? item.image : (item.image?.url || 'icons/icon128.png'),
                                    source: baseUrl.hostname
                                });
                            }
                        });
                    } catch (e) { }
                });

                if (extracted.length > 0) {
                    return extracted.slice(0, state.newsPerSite);
                }

                const nextScripts = doc.querySelectorAll('script');
                nextScripts.forEach(script => {
                    const content = script.textContent;
                    if (content && content.includes('self.__next_f.push') && extracted.length < state.newsPerSite) {
                        try {
                            const titleMatches = [...content.matchAll(/className\\":\\"news-article-card_title__[^"]+\\",\\"children\\":\\"([^"\\]+)\\"/g)];
                            const hrefMatches = [...content.matchAll(/\\"href\\":\\"(\/pt-BR\/news\/|\/en-US\/news\/|\/news\/)([^"\\]+)\\"/g)];
                            const dateMatches = [...content.matchAll(/className\\":\\"news-article-card_date__[^"]+\\",\\"children\\":\\"([^"\\]+)\\"/g)];
                            const imgMatches = [...content.matchAll(/src\\":\\"([^"\\]+)\\",\\"alt\\":\\"Generic article card image\\"/g)];

                            if (titleMatches.length > 0 && hrefMatches.length > 0) {
                                for (let i = 0; i < Math.min(titleMatches.length, state.newsPerSite); i++) {
                                    if (extracted.length >= state.newsPerSite) break;
                                    const titleRaw = titleMatches[i] ? titleMatches[i][1] : null;
                                    const slug = hrefMatches[i] ? hrefMatches[i][2] : null;

                                    if (titleRaw && slug) {
                                        const title = titleRaw.replace(/\\u[\dA-F]{4}/gi, (match) => {
                                            return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
                                        }).replace(/\\u00E3/gi, 'ã');
                                        const link = baseUrl.origin + (source.url.includes('/pt-BR/') ? '/pt-BR/news/' : '/news/') + slug;
                                        const dateStr = dateMatches[i] ? dateMatches[i][1] : null;
                                        const ts = parseDateSafe(dateStr || Date.now());
                                        const image = imgMatches[i] ? imgMatches[i][1] : 'icons/icon128.png';

                                        if (!extracted.some(e => e.link === link)) {
                                            extracted.push({
                                                title,
                                                link,
                                                date: formatDateLong(ts, state.currentLang),
                                                timestamp: ts,
                                                image: image,
                                                source: baseUrl.hostname
                                            });
                                        }
                                    }
                                }
                            }

                            const gzwBlocks = content.split(/\\"id\\":/);
                            if (gzwBlocks.length > 1) {
                                for (let i = 1; i < gzwBlocks.length; i++) {
                                    if (extracted.length >= state.newsPerSite) break;
                                    const block = gzwBlocks[i];
                                    const tMatch = block.match(/\\"title\\":\\"(.*?)\\"/);
                                    const lMatch = block.match(/\\"link\\":\\"(.*?)\\"/);
                                    const iMatch = block.match(/\\"previewImage\\":\\"(.*?)\\"/);
                                    const dMatch = block.match(/\\"date\\":\\"\$D(.*?)\\"/);

                                    if (tMatch && lMatch) {
                                        const titleRaw = tMatch[1];
                                        const slug = lMatch[1];
                                        const dateStr = dMatch ? dMatch[1] : null;
                                        const imageRaw = iMatch ? iMatch[1] : 'icons/icon128.png';

                                        if (titleRaw && slug && !titleRaw.includes('Gray Zone Warfare |')) {
                                            const title = titleRaw.replace(/\\u[\dA-F]{4}/gi, (match) => {
                                                return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
                                            }).replace(/\\\\/g, '');
                                            const link = baseUrl.origin + (source.url.includes('/pt-BR/') ? '/pt-BR/news/' : '/news/') + slug.replace(/\\\\/g, '');
                                            const image = imageRaw.replace(/\\\//g, '/').replace(/\\\\/g, '');
                                            const ts = parseDateSafe(dateStr || Date.now());

                                            if (!extracted.some(e => e.link === link)) {
                                                extracted.push({
                                                    title,
                                                    link,
                                                    date: formatDateLong(ts, state.currentLang),
                                                    timestamp: ts,
                                                    image: image,
                                                    source: baseUrl.hostname
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (e) { }
                    }
                });

                if (extracted.length > 0) {
                    return extracted.slice(0, state.newsPerSite);
                }

                let signature = null;
                for (const domain in NEWS_SIGNATURES) {
                    if (source.url.toLowerCase().includes(domain.toLowerCase()) ||
                        baseUrl.hostname.toLowerCase().includes(domain.toLowerCase())) {
                        signature = NEWS_SIGNATURES[domain];
                        domainKey = domain;
                        break;
                    }
                }

                if (signature) {
                    const items = doc.querySelectorAll(signature.item);
                    items.forEach((item) => {
                        if (extracted.length >= state.newsPerSite) return;
                        const titleEl = signature.title ? item.querySelector(signature.title) : item.querySelector('h1, h2, h3, h4, .title, strong');
                        let linkEl = signature.link ? item.querySelector(signature.link) : null;
                        if (!linkEl && item.tagName.toLowerCase() === 'a') linkEl = item;
                        if (!linkEl) linkEl = item.querySelector('a');
                        const dateEl = signature.date ? item.querySelector(signature.date) : null;
                        const imgEl = signature.image ? item.querySelector(signature.image) : item.querySelector('img, picture');

                        if (titleEl && linkEl) {
                            const title = titleEl.textContent.trim();
                            let link = linkEl.getAttribute('href');
                            if (!link && linkEl.parentElement && linkEl.parentElement.tagName.toLowerCase() === 'a') {
                                link = linkEl.parentElement.getAttribute('href');
                            }
                            if (link && !link.startsWith('http')) {
                                link = baseUrl.origin + (link.startsWith('/') ? '' : '/') + link;
                            }
                            if (!title || !link || title.length < 5) return;
                            const ts = parseDateSafe(dateEl ? dateEl.textContent.trim() : Date.now());

                            let image = 'icons/icon128.png';
                            if (imgEl) {
                                if (signature.image_attr && imgEl.getAttribute(signature.image_attr)) {
                                    image = imgEl.getAttribute(signature.image_attr);
                                } else if (imgEl.getAttribute('src')) {
                                    image = imgEl.getAttribute('src');
                                } else if (imgEl.getAttribute('data-src')) {
                                    image = imgEl.getAttribute('data-src');
                                } else if (imgEl.style && imgEl.style.backgroundImage) {
                                    const match = imgEl.style.backgroundImage.match(/url\(["']?([^"']*)["']?\)/);
                                    if (match && match[1]) image = match[1];
                                }
                            }

                            extracted.push({
                                title,
                                link,
                                date: formatDateLong(ts, state.currentLang),
                                timestamp: ts,
                                image: image && !image.startsWith('http') && image !== 'icons/icon128.png' ? baseUrl.origin + image : image,
                                source: domainKey || baseUrl.hostname
                            });
                        }
                    });

                    if (extracted.length > 0) {
                        return extracted.slice(0, state.newsPerSite);
                    }
                }

                const discoveredItems = await discoverAndFetchRSS(doc, source.url);
                if (discoveredItems && discoveredItems.length > 0) {
                    return discoveredItems.slice(0, state.newsPerSite);
                }

                const genericItems = doc.querySelectorAll('article, .post, .news-item, .article, [class*="card"], [class*="item"]');
                const seenLinks = new Set();
                genericItems.forEach((item) => {
                    if (extracted.length >= state.newsPerSite) return;
                    const titleEl = item.querySelector('h1, h2, h3, h4, .title, [class*="title"], strong');
                    const imgEl = item.querySelector('img');
                    const linkEl = item.querySelector('a');

                    const title = titleEl?.textContent?.trim();
                    let link = linkEl ? linkEl.getAttribute('href') : null;
                    if (link && !link.startsWith('http')) {
                        link = baseUrl.origin + (link.startsWith('/') ? '' : '/') + link;
                    }

                    if (title && title.length > 5 && link && link !== source.url && !seenLinks.has(link)) {
                        seenLinks.add(link);
                        extracted.push({
                            title,
                            image: imgEl && imgEl.hasAttribute('src') && !imgEl.getAttribute('src').startsWith('http') ? baseUrl.origin + imgEl.getAttribute('src') : (imgEl?.getAttribute('src') || 'icons/icon128.png'),
                            date: formatDateLong(Date.now(), state.currentLang),
                            timestamp: Date.now(),
                            link,
                            source: baseUrl.hostname
                        });
                    }
                });

                if (extracted.length > 0) {
                    return extracted.slice(0, state.newsPerSite);
                }

                const pageTitle = doc.querySelector('title')?.innerText;
                const ogTitle = doc.querySelector('meta[property="og:title"]')?.content;
                const ogImage = doc.querySelector('meta[property="og:image"]')?.content;

                if (ogTitle || pageTitle) {
                    return [{
                        title: (ogTitle || pageTitle) + " [Notícia Única]",
                        image: ogImage || 'icons/icon128.png',
                        date: 'Link Direto',
                        timestamp: Date.now() - 86400000,
                        link: source.url,
                        source: baseUrl.hostname
                    }];
                }
            } else {
                console.error(`[News] Failed to fetch ${source.url}:`, response?.error);
                showNotification(`Não foi possível carregar: ${new URL(source.url).hostname}`, 'error');
            }
        } catch (e) {
            console.error('Error fetching news from', source.url, e);
            showNotification(`Erro ao processar fonte de notícias`, 'error');
        }
        return [];
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(items => allNews.push(...items));

    if (!silent) {
        if (loader) loader.style.display = 'none';
        if (grid) grid.style.display = 'grid';
    }

    allNews.sort((a, b) => {
        const tA = Number(a.timestamp) || 0;
        const tB = Number(b.timestamp) || 0;
        return tB - tA;
    });

    return allNews;
}

export function parseRSS(doc, sourceName) {
    const items = doc.querySelectorAll('item');
    const result = [];
    items.forEach(item => {
        const title = item.querySelector('title')?.textContent;
        const link = item.querySelector('link')?.textContent || item.querySelector('guid')?.textContent;
        const pubDate = item.querySelector('pubDate')?.textContent || item.querySelector('date')?.textContent;
        let image = '';

        const mediaContent = item.querySelector('media\\:content, content') || item.getElementsByTagName('media:content')[0];
        if (mediaContent) image = mediaContent.getAttribute('url') || mediaContent.getAttribute('src');

        if (!image) {
            const enclosure = item.querySelector('enclosure');
            if (enclosure) image = enclosure.getAttribute('url');
        }

        if (!image) {
            const description = item.querySelector('description')?.textContent;
            if (description) {
                const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
                if (imgMatch) image = imgMatch[1];
            }
        }

        if (title && link) {
            const ts = parseDateSafe(pubDate);
            result.push({
                title,
                link,
                date: formatDateLong(ts, state.currentLang),
                timestamp: ts,
                image: image || 'icons/icon128.png',
                source: sourceName
            });
        }
    });

    result.forEach((res, i) => {
        if (res.image === 'icons/icon128.png') {
            const item = items[i];
            const mediaThumb = item.querySelector('media\\:thumbnail, thumbnail') || item.getElementsByTagName('media:thumbnail')[0];
            if (mediaThumb) res.image = mediaThumb.getAttribute('url');
        }
    });

    return result;
}

export function parseAtom(doc, sourceName) {
    const entries = doc.querySelectorAll('entry');
    const result = [];
    entries.forEach(entry => {
        const title = entry.querySelector('title')?.textContent;
        const link = entry.querySelector('link')?.getAttribute('href') || entry.querySelector('link')?.textContent;
        const updated = entry.querySelector('updated')?.textContent || entry.querySelector('published')?.textContent;

        let image = '';
        const content = entry.querySelector('content')?.textContent;
        if (content) {
            const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) image = imgMatch[1];
        }

        if (title && link) {
            const ts = parseDateSafe(updated);
            result.push({
                title,
                link,
                date: formatDateLong(ts, state.currentLang),
                timestamp: ts,
                image: image || 'icons/icon128.png',
                source: sourceName
            });
        }
    });
    return result;
}

export async function loadAndRenderNews(silent = false) {
    const grid = document.getElementById('newsGrid');
    const filterContainer = document.getElementById('news-site-filter');
    const loader = document.getElementById('newsLoader');
    if (!grid) return;

    if (state.newsSources.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-dim);">
                <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.3;">🗞️</div>
                <p style="font-size: 16px; margin-bottom: 20px;">${t('emptyNewsSource')}</p>
                <button class="glass-btn primary" data-action="navigate-to-settings-news" style="padding: 10px 24px;">
                    ${t('settings')}
                </button>
            </div>
        `;
        if (filterContainer) filterContainer.innerHTML = '';
        return;
    }

    if (!silent) {
        if (loader) loader.style.display = 'block';
        grid.style.display = 'none';
    }

    let allFetchedNews = await fetchNews(silent);

    if (state.currentLang !== 'en') {
        const translationPromises = allFetchedNews.map(async item => {
            const commonEnTags = ['patch', 'notes', 'update', 'season', 'news', 'event'];
            const needsTranslation = commonEnTags.some(tag => item.title.toLowerCase().includes(tag)) ||
                /[a-zA-Z]{5,}/.test(item.title);

            if (needsTranslation) {
                item.title = await translateText(item.title, state.currentLang);
            }
        });
        await Promise.allSettled(translationPromises);
    }

    state.cachedNewsData = allFetchedNews;
    
    // Se ainda estivermos na aba de notícias, marcamos tudo como visto para evitar que o ponto volte a aparecer
    if (state.currentView === 'news') {
        const currentLinks = allFetchedNews.map(item => item.link);
        state.lastSeenNewsUrls = currentLinks;
        setStorageData(LAST_SEEN_NEWS_KEY, state.lastSeenNewsUrls);
    }

    applyNewsFilter(silent);
}

export function applyNewsFilter(silent = false) {
    const grid = document.getElementById('newsGrid');
    const filterContainer = document.getElementById('news-site-filter');
    const loader = document.getElementById('newsLoader');

    if (!silent) {
        if (loader) loader.style.display = 'none';
        if (grid) grid.style.display = 'grid';
    }

    const domains = [...new Set(state.cachedNewsData.map(item => item.source))].sort();
    if (filterContainer) {
        let filterHtml = `<button class="tag-badge ${state.newsSiteFilter === 'all' ? 'active' : ''}" data-site="all">${t('all')}</button>`;
        filterHtml += `
                <button class="tag-badge ${state.newsSiteFilter === 'unread' ? 'active' : ''}" data-site="unread">${t('unread')}</button>`;
        domains.forEach(domain => {
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            filterHtml += `
                <button class="tag-badge ${state.newsSiteFilter === domain ? 'active' : ''}" data-site="${domain}" style="display: flex; align-items: center; gap: 8px;">
                    <img src="${faviconUrl}" width="16" height="16" style="border-radius: 4px; pointer-events: none;">
                    ${domain}
                </button>`;
        });
        filterContainer.innerHTML = filterHtml;

        filterContainer.querySelectorAll('.tag-badge').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                state.newsSiteFilter = btn.dataset.site;
                applyNewsFilter();
            };
        });
    }

    let news = [...state.cachedNewsData];

    if (state.newsSiteFilter === 'unread') {
        news = news.filter(item => !state.readNewsUrls.includes(item.link));
    } else if (state.newsSiteFilter !== 'all') {
        news = news.filter(item => item.source === state.newsSiteFilter);
    }

    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        news = news.filter(item =>
            item.title.toLowerCase().includes(query) ||
            item.source.toLowerCase().includes(query)
        );
    }

    if (!grid) return;

    if (news.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">${t('noNewsFound')}</div>`;
        return;
    }

    grid.innerHTML = '';
    news.forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-card';
        const isRead = state.readNewsUrls.includes(item.link);
        card.innerHTML = `
            <div class="news-image-container" style="position: relative;">
                <img src="${item.image}" alt="" class="news-card-image" onerror="this.onerror=null; this.src='icons/icon128.png'">
                ${isRead ? '<div class="read-checkmark" style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); z-index: 5;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
            </div>
            <div class="news-card-content">
                <span class="news-card-tag">${item.source}</span>
                <h3 class="news-card-title">${item.title}</h3>
                <div class="news-card-footer">
                    <span class="news-card-date">${item.date}</span>
                    <button class="glass-btn primary" data-action="open-news" data-url="${item.link}" style="padding: 4px 12px; font-size: 11px;">${t('viewOfficial')}</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    updateNewsSidebarIndicator();
}

export function renderNewsPreview() {
    const container = document.getElementById('dash-news-preview');
    if (!container) return;

    const hasNew = state.cachedNewsData.some(item => !state.readNewsUrls.includes(item.link));
    const latestNews = state.cachedNewsData.length > 0 ? state.cachedNewsData[0].title : t('noNewsFound');
    let faviconHtml = '';
    if (state.cachedNewsData.length > 0) {
        try {
            const url = new URL(state.cachedNewsData[0].link);
            faviconHtml = `<img src="https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32" class="card-favicon" alt="icon">`;
        } catch (e) {}
    }

    container.innerHTML = `
        <div class="card-icon-area" style="color: var(--accent-warning); background: rgba(255, 159, 67, 0.1);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20H5a2 2-0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <div class="card-info">
            <span class="card-title-main">${t('news') || 'Notícias'}</span>
            <span class="card-subtitle-small">${faviconHtml}${latestNews}</span>
        </div>
        <div class="card-avatars-corner">
            <div class="avatar-dot ${hasNew ? 'active' : ''}" style="${hasNew ? 'background: var(--accent-warning); box-shadow: 0 0 8px var(--accent-warning);' : ''}"></div>
        </div>
    `;
}

export function updateNewsSidebarIndicator() {
    const navLink = document.querySelector('.nav-link[data-view="news"]');
    if (!navLink) return;

    const isNewsViewActive = state.currentView === 'news';
    
    if (isNewsViewActive) {
        navLink.classList.remove('has-live');
        if (state.cachedNewsData && state.cachedNewsData.length > 0) {
            const currentLinks = state.cachedNewsData.map(item => item.link);
            const needsUpdate = currentLinks.some(link => !state.lastSeenNewsUrls.includes(link));
            if (needsUpdate) {
                state.lastSeenNewsUrls = currentLinks;
                setStorageData(LAST_SEEN_NEWS_KEY, state.lastSeenNewsUrls);
            }
        }
        return;
    }

    if (!state.cachedNewsData || state.cachedNewsData.length === 0) {
        navLink.classList.remove('has-live');
        return;
    }

    const normalizeUrl = (url) => url ? url.replace(/\/$/, '').replace('http://', 'https://').trim() : '';
    const lastSeenSet = new Set((state.lastSeenNewsUrls || []).map(normalizeUrl));
    const readSet = new Set((state.readNewsUrls || []).map(normalizeUrl));
    
    // Se lastSeenNewsUrls está vazio, significa que é a primeira vez ou cache foi limpo.
    // Para evitar "flash" de notificação, se o cache carregado do storage for antigo, não mostramos.
    const hasUnseenNews = state.cachedNewsData.some(item => {
        const link = normalizeUrl(item.link);
        return !lastSeenSet.has(link) && !readSet.has(link);
    });

    navLink.classList.toggle('has-live', hasUnseenNews);
}

