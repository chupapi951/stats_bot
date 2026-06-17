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
  if (!window.Telegram || !window.Telegram.WebApp) {
    window.__STATS_BOT_MOCK__ = true;
    return true;
  }
  return false;
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
  const [initData, setInitData] = useState('');

  useEffect(() => {
    if (isMockMode) {
      // synthesize a fake Telegram user for local development
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
      setUser(tg.initDataUnsafe?.user || null);
      setColorScheme(tg.colorScheme || 'light');
      setInitData(tg.initData || '');
      tg.onEvent && tg.onEvent('themeChanged', () => {
        applyThemeParams(tg.themeParams);
        setColorScheme(tg.colorScheme || 'light');
      });
    } catch (e) {
      console.warn('tg init failed', e);
    }
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
