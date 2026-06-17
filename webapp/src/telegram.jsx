import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

function detectMock() {
  if (typeof window === 'undefined') return false;
  if (window.__STATS_BOT_MOCK__ === true) return true;
  if (window.__STATS_BOT_MOCK__ === false) return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get('mock') === '1') { window.__STATS_BOT_MOCK__ = true; return true; }
    if (u.searchParams.get('mock') === '0') { window.__STATS_BOT_MOCK__ = false; return false; }
  } catch (_) {}
  // Auto-mock ONLY in local dev (localhost / 127.x), never on production
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  if (isLocal && (!window.Telegram || !window.Telegram.WebApp)) {
    window.__STATS_BOT_MOCK__ = true;
    return true;
  }
  return false;
}

const INIT_DATA_CACHE_KEY = 'stats_bot_initdata_v1';
const INIT_DATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — server caps auth_date at 24h

function loadCachedInitData() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.sessionStorage.getItem(INIT_DATA_CACHE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || !parsed.value) return '';
    if (Date.now() - parsed.ts > INIT_DATA_CACHE_TTL_MS) return '';
    return parsed.value;
  } catch (_) {
    return '';
  }
}

function saveCachedInitData(value) {
  if (typeof window === 'undefined' || !value) return;
  try {
    window.sessionStorage.setItem(
      INIT_DATA_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), value })
    );
  } catch (_) {}
}

export const isMockMode = detectMock();

export const tg =
  typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

const TelegramContext = createContext({
  tg: null,
  user: null,
  colorScheme: 'light',
  initData: ''
});

function applyThemeParams(tp) {
  if (!tp) return;
  const root = document.documentElement;
  const map = {
    bg_color: '--tg-theme-bg-color',
    secondary_bg_color: '--tg-theme-secondary-bg-color',
    text_color: '--tg-theme-text-color',
    hint_color: '--tg-theme-hint-color',
    link_color: '--tg-theme-link-color',
    button_color: '--tg-theme-button-color',
    button_text_color: '--tg-theme-button-text-color',
    section_bg_color: '--tg-theme-section-bg-color',
    section_header_text_color: '--tg-theme-section-header-text-color'
  };
  for (const [k, v] of Object.entries(tp)) {
    if (map[k] && v) root.style.setProperty(map[k], v);
  }
}

export function TelegramProvider({ children }) {
  const [user, setUser] = useState(null);
  const [colorScheme, setColorScheme] = useState('light');
  // Seed from cache so a page refresh still has valid initData while we
  // re-initialise the SDK. The cache lives in sessionStorage and is wiped
  // when the tab closes — it never outlives the Mini App session.
  const [initData, setInitData] = useState(() => loadCachedInitData());

  useEffect(() => {
    if (isMockMode) {
      const mockUser = { id: 100001, first_name: 'Demo', username: 'demo' };
      setUser(mockUser);
      setInitData('');
      return;
    }
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      applyThemeParams(tg.themeParams);
      if (tg.setHeaderColor && tg.themeParams?.bg_color) {
        tg.setHeaderColor(tg.themeParams.bg_color);
      }
      const fresh = tg.initData || '';
      if (fresh) {
        // SDK provided a fresh signed initData — use it and cache for the next refresh.
        setUser(tg.initDataUnsafe?.user || null);
        setInitData(fresh);
        saveCachedInitData(fresh);
      } else {
        // SDK has no initData (e.g. iOS pull-to-refresh destroyed the context).
        // Fall back to the cached one from the previous open; do NOT change user,
        // because the cached initData is bound to that user.
        const cached = loadCachedInitData();
        if (cached && !initData) {
          setInitData(cached);
        }
      }
      setColorScheme(tg.colorScheme || 'light');
      tg.onEvent && tg.onEvent('themeChanged', () => {
        applyThemeParams(tg.themeParams);
        setColorScheme(tg.colorScheme || 'light');
      });
    } catch (e) {
      console.warn('tg init failed', e);
    }
    // We intentionally do NOT depend on `initData` here — this effect runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ tg, user, colorScheme, initData, isMockMode }),
    [user, colorScheme, initData]
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}

export function hapticImpact(style = 'light') {
  if (tg?.HapticFeedback?.impactOccurred) {
    try { tg.HapticFeedback.impactOccurred(style); } catch (_) {}
  }
}

export function hapticNotify(type = 'success') {
  if (tg?.HapticFeedback?.notificationOccurred) {
    try { tg.HapticFeedback.notificationOccurred(type); } catch (_) {}
  }
}

export function backButtonHandler(handler) {
  if (!tg?.BackButton) return () => {};
  try { tg.BackButton.show(); } catch (_) {}
  const cb = () => handler();
  try { tg.BackButton.onClick(cb); } catch (_) {}
  return () => {
    try { tg.BackButton.offClick(cb); tg.BackButton.hide(); } catch (_) {}
  };
}
