// js/state.js

// Constants
export const STORAGE_KEY = 'driftweb_reminders';
export const SHORTCUTS_KEY = 'driftweb_shortcuts';
export const STREAMS_KEY = 'driftweb_streams';
export const CATEGORIES_KEY = 'driftweb_categories';
export const LAYOUT_KEY = 'driftweb_layout';
export const THEME_KEY = 'driftweb_theme';
export const LANG_KEY = 'driftweb_language';
export const STREAMS_INTERVAL_KEY = 'driftweb_streams_interval';
export const NOTIFICATION_TIME_KEY = 'driftweb_notification_time';
export const SIDEBAR_COLLAPSED_KEY = 'driftweb_sidebar_collapsed';
export const STORAGE_MIGRATED_KEY = 'driftweb_storage_migrated';
export const SMART_ADD_ENABLED_KEY = 'driftweb_smart_add_enabled';
export const YT_PLAYER_MODE_KEY = 'driftweb_yt_player_mode';
export const NEWS_SOURCES_KEY = 'driftweb_news_sources';
export const NEWS_REFRESH_INTERVAL_KEY = 'driftweb_news_interval';
export const NEWS_PER_SITE_KEY = 'driftweb_news_per_site';
export const READ_NEWS_KEY = 'driftweb_read_news';
export const LAST_SEEN_NEWS_KEY = 'driftweb_last_seen_news';
export const SESSIONS_KEY = 'driftweb_sessions';
export const PIP_APPS_KEY = 'driftweb_pip_apps';
export const TAGS_KEY = 'driftweb_custom_tags';
export const NEWS_CACHE_KEY = 'driftweb_cached_news';
export const ACCENT_COLOR_KEY = 'driftweb_accent_color';
export const CHANGELOG_VERSION_KEY = 'driftweb_last_changelog';
export const VAULT_REMINDERS_KEY = 'driftweb_vault_reminders';
export const VAULT_PASS_KEY = 'driftweb_vault_pass';
export const VAULT_HINT_KEY = 'driftweb_vault_hint';
export const CONTACTS_KEY = 'driftweb_contacts';
export const CONTACT_TAGS_KEY = 'driftweb_contact_custom_tags';
export const CONTACTS_LAYOUT_KEY = 'driftweb_contacts_layout';
export const INVIDIOUS_INSTANCE = 'https://yewtu.be';

// Global Mutable State (Encapsulated)
export const state = {
    currentView: 'dashboard',
    currentLang: 'pt',
    contacts: [],
    accentColor: '#00C080',
    streamCheckInterval: 5,
    youtubePlayerMode: 'standard',
    streamCheckTimer: null,
    newsRefreshTimer: null,
    newsInterval: null,
    isStreamEditMode: false,
    isPipAppEditMode: false,
    pipAppEditId: null,
    isShortcutEditMode: false,
    isSidebarCollapsed: false,
    cachedNewsData: [],
    readNewsUrls: [],
    lastSeenNewsUrls: [],
    savedSessions: [],
    pipApps: [],
    reminders: [],
    shortcuts: [],
    streams: [],
    categories: [],
    customTags: [],
    newsSources: [],
    newsRefreshInterval: 60,
    newsPerSite: 5,
    newsSiteFilter: 'all',
    currentFilter: 'all',
    currentDateFilter: 'all',
    isHorizontalLayout: false,
    isDarkMode: true,
    currentLinks: [],
    selectedTags: [],
    searchQuery: '',
    currentEditId: null,
    dashboardTagFilter: null,
    remindersTagFilter: null,
    calendarTagFilter: null,
    editingLinks: [],
    currentChecklist: [],
    editingChecklist: [],
    currentImages: [],
    editingImages: [],
    tagSelectionContext: 'create',


    // Calendar State
    calendarDate: new Date(),

    // Multi-Stream State
    selectedStreamsForMultiView: [],
    isMultiViewSelectionMode: false,
    unlockedReminders: new Set(),
    passwordModalPendingId: null,
    passwordModalPendingAction: null, // 'view' or 'edit'

    // Vault State
    vaultReminders: [],
    vaultPassword: null,
    vaultHint: null,
    isVaultUnlocked: false,
    vaultSelectedTags: [],
    vaultCurrentLinks: [],
    vaultCurrentChecklist: [],
    vaultCurrentImages: [],
    vaultCurrentEditId: null,
    vaultEditingLinks: [],
    vaultEditingChecklist: [],
    vaultEditingImages: [],
    contactsTagFilter: null,
    selectedContactTags: [],
    contactCustomTags: [],
    contactsLayout: 'grid',
    selectedContactFolder: null
};
