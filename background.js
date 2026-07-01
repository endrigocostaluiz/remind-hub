const STORAGE_KEY = 'driftweb_reminders';
const LANG_KEY = 'driftweb_language';
const STREAMS_KEY = 'driftweb_streams';
const NEWS_SOURCES_KEY = 'driftweb_news_sources';
const NEWS_CACHE_KEY = 'driftweb_cached_news';
const STREAMS_INTERVAL_KEY = 'driftweb_streams_interval';
const NEWS_INTERVAL_KEY = 'driftweb_news_interval';

const locales = {
  pt: {
    nearExpiryTitle: "Lembrete perto de vencer!",
    expiryTitle: "Lembrete venceu!",
    nearExpiryBody: "O lembrete \"{title}\" vence amanhã.",
    near2ExpiryTitle: "Lembrete perto de vencer!",
    near2ExpiryBody: "O lembrete \"{title}\" vence em 2 dias.",
    expiryBody: "O lembrete \"{title}\" vence hoje.",
  },
  en: {
    nearExpiryTitle: "Reminder near expiry!",
    expiryTitle: "Reminder expired!",
    nearExpiryBody: "The reminder \"{title}\" expires tomorrow.",
    near2ExpiryTitle: "Reminder near expiry!",
    near2ExpiryBody: "The reminder \"{title}\" expires in 2 days.",
    expiryBody: "The reminder \"{title}\" expires today.",
  }
};

chrome.runtime.onInstalled.addListener(() => {
  setupInitialAlarms();
  checkStreamsInBackground();
  refreshNewsInBackground();
});

chrome.runtime.onStartup.addListener(() => {
  setupInitialAlarms();
  checkStreamsInBackground();
  refreshNewsInBackground();
});

async function setupInitialAlarms() {
  const data = await chrome.storage.local.get([STREAMS_INTERVAL_KEY, NEWS_INTERVAL_KEY]);
  const streamInterval = data[STREAMS_INTERVAL_KEY] || 5;
  const newsInterval = data[NEWS_INTERVAL_KEY] || 60;

  // Clear existing to avoid duplicates
  await chrome.alarms.clear('check-streams');
  await chrome.alarms.clear('refresh-news');

  chrome.alarms.create('check-streams', { periodInMinutes: streamInterval });
  chrome.alarms.create('refresh-news', { periodInMinutes: newsInterval });
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('index.html')
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check-streams') {
    await checkStreamsInBackground();
  } else if (alarm.name === 'refresh-news') {
    await refreshNewsInBackground();
  } else if (alarm.name.startsWith('remind-')) {
    handleReminderAlarm(alarm);
  }
});

async function handleReminderAlarm(alarm) {
  const name = alarm.name;
  let type = '';
  let reminderId = null;

  if (name.startsWith('remind-near2-')) {
    type = 'near2';
    reminderId = parseInt(name.replace('remind-near2-', ''));
  } else if (name.startsWith('remind-near-')) {
    type = 'near';
    reminderId = parseInt(name.replace('remind-near-', ''));
  } else if (name.startsWith('remind-due-')) {
    type = 'due';
    reminderId = parseInt(name.replace('remind-due-', ''));
  }

  if (!reminderId) return;

  const data = await chrome.storage.local.get([STORAGE_KEY, LANG_KEY, 'focus_mode_active', 'pending_notifications', 'driftweb_notification_time']);
  const reminders = data[STORAGE_KEY] || [];
  const lang = data[LANG_KEY] || 'pt';

  const reminder = reminders.find(r => r.id === reminderId);
  if (!reminder) return;

  const loc = locales[lang] || locales.pt;
  let title = loc.expiryTitle;
  let message = loc.expiryBody;

  if (type === 'near') {
    title = loc.nearExpiryTitle;
    message = loc.nearExpiryBody;
  } else if (type === 'near2') {
    title = loc.near2ExpiryTitle;
    message = loc.near2ExpiryBody;
  }

  message = message.replace('{title}', reminder.title);

  if (data.focus_mode_active) {
    const pending = data.pending_notifications || [];
    pending.push({ id: `remind-notif-${reminderId}-${type}-${Date.now()}`, title, message });
    await chrome.storage.local.set({ pending_notifications: pending });
  } else {
    chrome.notifications.create(`remind-notif-${reminderId}-${type}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: message,
      priority: 2
    });
  }

  if (type === 'due' && reminder.repeat && reminder.repeat !== 'none') {
    const nextDueDate = calculateNextOccurrence(reminder.dueDate, reminder.repeat);
    if (nextDueDate) {
      reminder.dueDate = nextDueDate;
      const updatedReminders = reminders.map(r => r.id === reminder.id ? reminder : r);
      await chrome.storage.local.set({ [STORAGE_KEY]: updatedReminders });
      await scheduleNotifications(reminder, data['driftweb_notification_time'] || '09:00');
    }
  }
}

function calculateNextOccurrence(currentDateStr, repeat) {
  const date = new Date(currentDateStr + 'T00:00:00');
  if (repeat === 'daily') date.setDate(date.getDate() + 1);
  else if (repeat === 'weekly') date.setDate(date.getDate() + 7);
  else if (repeat === 'monthly') date.setMonth(date.getMonth() + 1);
  else return null;
  return date.toISOString().split('T')[0];
}

async function scheduleNotifications(reminder, notifTime) {
  const [hours, minutes] = notifTime.split(':').map(Number);
  const dueDate = new Date(reminder.dueDate + 'T00:00:00');
  const times = {
    due: new Date(dueDate).setHours(hours, minutes, 0, 0),
    near: new Date(dueDate).setDate(dueDate.getDate() - 1),
    near2: new Date(dueDate).setDate(dueDate.getDate() - 2)
  };
  
  const now = Date.now();
  if (times.near2 > now) chrome.alarms.create(`remind-near2-${reminder.id}`, { when: times.near2 });
  if (times.near > now) chrome.alarms.create(`remind-near-${reminder.id}`, { when: times.near });
  if (new Date(dueDate).setHours(hours, minutes, 0, 0) > now) {
      chrome.alarms.create(`remind-due-${reminder.id}`, { when: new Date(dueDate).setHours(hours, minutes, 0, 0) });
  }
}

// ========== STREAMS BACKGROUND CHECK ==========

async function checkStreamsInBackground() {
  const data = await chrome.storage.local.get([STREAMS_KEY, LANG_KEY]);
  const streams = data[STREAMS_KEY] || [];
  const lang = data[LANG_KEY] || 'pt';
  let changed = false;

  for (const stream of streams) {
    const oldLive = stream.isLive;
    const isLive = await fetchStreamStatus(stream.url);

    if (oldLive !== isLive) {
      stream.isLive = isLive;
      changed = true;

      if (isLive) {
        chrome.notifications.create(`stream-live-${stream.id}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: lang === 'pt' ? 'Canal Ao Vivo!' : 'Channel Live!',
          message: `${stream.name} ${lang === 'pt' ? 'está online agora!' : 'is online now!'}`,
          priority: 2
        });
      }
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [STREAMS_KEY]: streams });
    chrome.runtime.sendMessage({ action: 'streams-updated', streams: streams }).catch(() => {});
  }
}

async function fetchStreamStatus(url) {
  try {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('kick.com')) {
        const channel = url.split('/').pop().split('?')[0];
        const apiUrl = `https://kick.com/api/v2/channels/${channel}/livestream`;
        const res = await fetch(apiUrl);
        if (res.ok) {
            const json = await res.json();
            return !!(json && json.data && json.data.id);
        }
        return false;
    }

    const busterUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const response = await fetch(busterUrl, { cache: 'no-store' });
    if (!response.ok) return false;
    
    const html = await response.text();
    if (urlLower.includes('twitch.tv')) {
      return html.includes('isLiveBroadcasting":true') || html.includes('"isLive":true') || html.includes('LiveIndicator');
    } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return html.includes('yt-spec-avatar-shape__live-badge') || html.includes('"isLiveNow":true') || html.includes('"broadcastStatus":"LIVE"');
    }
  } catch (e) { return false; }
  return false;
}

// ========== NEWS BACKGROUND REFRESH ==========

async function refreshNewsInBackground() {
    const data = await chrome.storage.local.get([NEWS_SOURCES_KEY, 'driftweb_news_per_site']);
    const sources = data[NEWS_SOURCES_KEY] || [];
    const limit = data['driftweb_news_per_site'] || 10;
    
    if (sources.length === 0) return;

    let allNews = [];
    for (const source of sources) {
        try {
            const response = await fetch(source.url);
            if (response.ok) {
                const text = await response.text();
                const isRss = text.includes('<rss') || text.includes('<feed');
                const news = isRss ? parseRss(text, source, limit) : parseHtmlNews(text, source, limit);
                allNews = allNews.concat(news);
            }
        } catch (e) {}
    }

    allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
    await chrome.storage.local.set({ [NEWS_CACHE_KEY]: allNews });
}

function parseRss(xmlText, source, limit) {
    const news = [];
    const items = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || xmlText.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (let i = 0; i < Math.min(items.length, limit); i++) {
        const item = items[i];
        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || item.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i) || item.match(/<link href="([\s\S]*?)"/i);
        const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || item.match(/<published>([\s\S]*?)<\/published>/i);
        if (titleMatch && linkMatch) {
            news.push({ title: titleMatch[1].trim(), link: linkMatch[1].trim(), date: dateMatch ? dateMatch[1].trim() : new Date().toISOString(), sourceName: source.name, sourceUrl: source.url });
        }
    }
    return news;
}

function parseHtmlNews(html, source, limit) {
    const news = [];
    const links = html.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g) || [];
    let count = 0;
    for (const linkTag of links) {
        if (count >= limit) break;
        const hrefMatch = linkTag.match(/href="([^"]+)"/);
        const text = linkTag.replace(/<[^>]+>/g, '').trim();
        if (hrefMatch && text.length > 20) {
            let url = hrefMatch[1];
            if (url.startsWith('/')) url = new URL(source.url).origin + url;
            if (url.includes(new URL(source.url).hostname) && !news.some(n => n.link === url)) {
                news.push({ title: text, link: url, date: new Date().toISOString(), sourceName: source.name, sourceUrl: source.url });
                count++;
            }
        }
    }
    return news;
}

// ========== MESSAGING ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch-url') {
    fetch(request.url)
      .then(async response => {
        const text = await response.text();
        sendResponse({ success: response.ok, status: response.status, text });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'open-pip-popup') {
    chrome.windows.create({ url: request.url, type: 'popup', width: 500, height: 650 });
    sendResponse({ success: true });
    return true;
  }
  if (request.action === 'add-stream') {
    chrome.storage.local.get([STREAMS_KEY]).then(data => {
      const streams = data[STREAMS_KEY] || [];
      const newStream = request.stream;
      
      // Check if already exists
      const exists = streams.some(s => s.url.toLowerCase().includes(newStream.url.toLowerCase()));
      if (!exists) {
        newStream.id = Date.now();
        newStream.isLive = false;
        streams.push(newStream);
        chrome.storage.local.set({ [STREAMS_KEY]: streams }).then(() => {
          chrome.runtime.sendMessage({ action: 'streams-updated', streams: streams }).catch(() => {});
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: 'Already exists' });
      }
    });
    return true; // Keep message channel open for async response
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('remind-notif-') || notificationId.startsWith('stream-live-')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    chrome.notifications.clear(notificationId);
  }
});

// Update Available Notification
chrome.runtime.onUpdateAvailable.addListener((details) => {
    chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Nova Versão Disponível!',
        message: `Uma nova versão (${details.version}) foi baixada. Clique aqui para reiniciar e aplicar agora.`,
        priority: 2,
        requireInteraction: true
    });
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'update-available') {
        chrome.runtime.reload();
    }
});

// Kick.com CSRF Fix
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes('kick.com') && !changeInfo.removed) {
    if (changeInfo.cookie.sameSite !== 'no_restriction') {
      let url = (changeInfo.cookie.secure ? 'https://' : 'http://') + changeInfo.cookie.domain.replace(/^\./, '');
      chrome.cookies.set({
        url: url, name: changeInfo.cookie.name, value: changeInfo.cookie.value, domain: changeInfo.cookie.domain,
        path: changeInfo.cookie.path, secure: true, httpOnly: changeInfo.cookie.httpOnly, sameSite: 'no_restriction'
      }).catch(() => {});
    }
  }
});
