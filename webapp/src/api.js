import { useTelegram } from './telegram.jsx';
import { mockApi } from './mockApi.js';

const REAL_API = 'http://127.0.0.1:3000';

function isMockMode() {
  // Delegate to the shared detectMock in telegram.jsx (imported as isMockMode)
  // This is kept for backward compatibility — real logic is in telegram.jsx
  if (typeof window === 'undefined') return false;
  if (window.__STATS_BOT_MOCK__ === true) return true;
  if (window.__STATS_BOT_MOCK__ === false) return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get('mock') === '1') { window.__STATS_BOT_MOCK__ = true; return true; }
    if (u.searchParams.get('mock') === '0') { window.__STATS_BOT_MOCK__ = false; return false; }
  } catch (_) {}
  // Auto-mock only on localhost, never in production
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  if (isLocal && (!window.Telegram || !window.Telegram.WebApp)) {
    window.__STATS_BOT_MOCK__ = true;
    return true;
  }
  return false;
}

function getTestingHeaders(user) {
  if (isMockMode() && user) return { 'x-tg-user-id': String(user.id) };
  if (window.__STATS_BOT_TESTING__ && user) return { 'x-tg-user-id': String(user.id) };
  return {};
}

async function realRequest(method, url, body, { initData, user }) {
  const headers = {
    'x-tg-init-data': initData || '',
    ...getTestingHeaders(user)
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    // iOS WebKit throws TypeError "Load failed" for any network/CORS/connection
    // problem before a response arrives. Surface a friendlier message.
    console.error('[api] fetch failed:', url, e);
    const detail = (e && e.message) || String(e);
    if (window.Telegram && window.Telegram.WebApp) {
      throw new Error(`сеть: ${detail}`);
    }
    throw new Error(`сеть: ${detail}`);
  }

  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) err = j.error; } catch (_) {}
    throw new Error(err);
  }
  if (res.status === 204) return null;
  return res.json();
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
  if (method === 'GET' && url === '/api/advice')       return mockApi.advice();
  if (method === 'GET' && url === '/api/orders') {
    const u = new URL('http://x' + url + (window.location.search || ''));
    return mockApi.listOrders({ status: u.searchParams.get('status'), search: u.searchParams.get('search') });
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
}

export { isMockMode };
