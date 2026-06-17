import { useMemo } from 'react';
import { useTelegram, isMockMode as _isMockMode } from './telegram.jsx';
import { mockApi } from './mockApi.js';

const INIT_DATA_CACHE_KEY = 'stats_bot_initdata_v1';
const INIT_DATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isMockMode() {
  return _isMockMode;
}

function getTestingHeaders(user) {
  if (isMockMode() && user) return { 'x-tg-user-id': String(user.id) };
  if (window.__STATS_BOT_TESTING__ && user) return { 'x-tg-user-id': String(user.id) };
  return {};
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

const REAL_API = 'https://statsbot.duckdns.org';

async function realRequest(method, url, body, { initData, user }) {
  // Last-resort fallback: if React state is empty (e.g. right after a refresh
  // before the TelegramProvider useEffect ran), try the sessionStorage cache.
  let effectiveInitData = initData;
  if (!effectiveInitData && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(INIT_DATA_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.value && Date.now() - (parsed.ts || 0) < INIT_DATA_CACHE_TTL_MS) {
          effectiveInitData = parsed.value;
        }
      }
    } catch (_) {}
  }

  const headers = {
    'x-tg-init-data': effectiveInitData || '',
    ...getTestingHeaders(user)
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(REAL_API + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    console.error('[api] fetch failed:', url, e);
    const detail = (e && e.message) || String(e);
    throw new Error(`сеть: ${detail}`);
  }

  // Refresh the cache from any non-401 success response. Some Telegram
  // sessions rotate the hash on a fresh server tick, so we want the
  // most recent valid token cached for the next refresh.
  if (res.ok && res.status !== 401 && effectiveInitData) {
    saveCachedInitData(effectiveInitData);
  }

  if (res.status === 401) {
    // Server rejected the initData (expired or stale). Drop the cache so
    // the next reload doesn't keep replaying the same bad token.
    try { window.sessionStorage.removeItem(INIT_DATA_CACHE_KEY); } catch (_) {}
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) err = j.error; } catch (_) {}
    throw new Error(err);
  }
  if (res.status === 204) return null;
  return res.json();
}

function mockRequest(method, url, body) {
  const m = url.match(/^\/api\/orders\/(\d+)(\/status)?$/);
  if (method === 'GET' && url === '/api/dashboard') return mockApi.dashboard();
  if (method === 'GET' && url === '/api/report/week') return mockApi.weekReport();
  if (method === 'GET' && url.startsWith('/api/report/period')) {
    const u = new URL('http://x' + url);
    return mockApi.periodReport({ from: u.searchParams.get('from'), to: u.searchParams.get('to') });
  }
  if (method === 'GET' && url === '/api/advice') return mockApi.advice();
  if (method === 'GET' && url === '/api/orders') {
    // Strip any window.location.search suffix the request may have
    // picked up (e.g. '?mock=1') so the status/search query params
    // are read from the API URL itself, not from the page URL.
    const qIndex = url.indexOf('?');
    const queryString = qIndex >= 0 ? url.slice(qIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    return mockApi.listOrders({
      status: params.get('status'),
      search: params.get('search')
    });
  }
  if (method === 'POST' && url === '/api/orders') return mockApi.createOrder(body);
  if (method === 'DELETE' && m && !m[2]) return mockApi.deleteOrder(m[1]);
  if (method === 'PATCH'  && m) return mockApi.updateOrder(m[1], body);
  if (method === 'POST'    && m && m[2] === '/status') return mockApi.setStatus(m[1], body.status);
  if (method === 'GET' && m) return mockApi.getOrder(m[1]);
  throw new Error(`mock: unhandled ${method} ${url}`);
}

function request(method, url, body, ctx) {
  if (isMockMode()) return Promise.resolve(mockRequest(method, url, body));
  return realRequest(method, url, body, ctx);
}

export function useApi() {
  const { initData, user } = useTelegram();

  // Memoize on the actual primitive deps (initData string, user object) so
  // the returned API object stays referentially stable across renders.
  // Otherwise, any useEffect that lists `api` in its deps would re-fire on
  // every render, causing an infinite fetch → setState → re-render loop.
  return useMemo(() => {
    const ctx = { initData, user };
    return {
      dashboard: () => request('GET', '/api/dashboard', undefined, ctx),
      orders: (params = {}) => {
        const q = new URLSearchParams();
        if (params.status && params.status !== 'all') q.set('status', params.status);
        if (params.search) q.set('search', params.search);
        const qs = q.toString();
        return request('GET', '/api/orders' + (qs ? '?' + qs : ''), undefined, ctx);
      },
      order: (id) => request('GET', `/api/orders/${id}`, undefined, ctx),
      createOrder: (data) => request('POST', '/api/orders', data, ctx),
      updateOrder: (id, patch) => request('PATCH', `/api/orders/${id}`, patch, ctx),
      setStatus: (id, status) => request('POST', `/api/orders/${id}/status`, { status }, ctx),
      deleteOrder: (id) => request('DELETE', `/api/orders/${id}`, undefined, ctx),
      weekReport: () => request('GET', '/api/report/week', undefined, ctx),
      periodReport: (params = {}) => {
        const q = new URLSearchParams();
        if (params.from) q.set('from', params.from);
        if (params.to)   q.set('to',   params.to);
        return request('GET', '/api/report/period' + (q.toString() ? '?' + q : ''), undefined, ctx);
      },
      advice: () => request('GET', '/api/advice', undefined, ctx)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, user && user.id, user && user.username]);
}

export { isMockMode };
