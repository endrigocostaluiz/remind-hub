// js/storage.js
import {
    STORAGE_KEY,
    SHORTCUTS_KEY,
    STREAMS_KEY,
    CATEGORIES_KEY,
    LAYOUT_KEY,
    THEME_KEY,
    LANG_KEY,
    STREAMS_INTERVAL_KEY,
    NOTIFICATION_TIME_KEY,
    SIDEBAR_COLLAPSED_KEY,
    STORAGE_MIGRATED_KEY
} from './state.js';

export async function migrateToChromeStorage() {
    const isMigrated = localStorage.getItem(STORAGE_MIGRATED_KEY);
    if (isMigrated) return;

    const dataToMigrate = {
        [STORAGE_KEY]: localStorage.getItem(STORAGE_KEY),
        [SHORTCUTS_KEY]: localStorage.getItem(SHORTCUTS_KEY),
        [STREAMS_KEY]: localStorage.getItem(STREAMS_KEY),
        [CATEGORIES_KEY]: localStorage.getItem(CATEGORIES_KEY),
        [LAYOUT_KEY]: localStorage.getItem(LAYOUT_KEY),
        [THEME_KEY]: localStorage.getItem(THEME_KEY),
        [LANG_KEY]: localStorage.getItem(LANG_KEY),
        [STREAMS_INTERVAL_KEY]: localStorage.getItem(STREAMS_INTERVAL_KEY),
        [NOTIFICATION_TIME_KEY]: localStorage.getItem(NOTIFICATION_TIME_KEY),
        [SIDEBAR_COLLAPSED_KEY]: localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    };

    const storageData = {};
    for (const key in dataToMigrate) {
        if (dataToMigrate[key] !== null) {
            try {
                storageData[key] = JSON.parse(dataToMigrate[key]);
            } catch (e) {
                storageData[key] = dataToMigrate[key];
            }
        }
    }

    if (Object.keys(storageData).length > 0) {
        await chrome.storage.local.set(storageData);
    }
    localStorage.setItem(STORAGE_MIGRATED_KEY, 'true');
}

export async function getStorageData(key, defaultValue = null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    }
    // Fallback for development if needed, though extension requires chrome.storage
    const data = localStorage.getItem(key);
    try {
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        return data || defaultValue;
    }
}

export async function setStorageData(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [key]: value });
    } else {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
}
