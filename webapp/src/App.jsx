import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import Dashboard from './views/Dashboard.jsx';
import Orders from './views/Orders.jsx';
import OrderDetail from './views/OrderDetail.jsx';
import Report from './views/Report.jsx';
import Advice from './views/Advice.jsx';
import AddOrderModal from './components/AddOrderModal.jsx';
import TabBar from './components/TabBar.jsx';
import Toast from './components/Toast.jsx';
import { useTelegram, hapticNotify, backButtonHandler, isMockMode } from './telegram.jsx';
import { useApi } from './api.js';
import { mockApi } from './mockApi.js';

export const ToastContext = React.createContext({ push: () => {} });

export default function App() {
  const { user, tg } = useTelegram();
  const api = useApi();
  const [mock, setMock] = useState(isMockMode);
  const location = useLocation();
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2400);
  }, []);

  // Open deep-link sections from bot commands (e.g. /report)
  useEffect(() => {
    if (!tg) return;
    let start = tg.initDataUnsafe?.start_param;
    if (!start) {
      try {
        const u = new URL(window.location.href);
        start = u.searchParams.get('tgStartParam');
      } catch (_) {}
    }
    if (start) {
      const map = {
        home: '/',
        report: '/report',
        orders: '/orders',
        advice: '/advice'
      };
      if (map[start] && map[start] !== location.pathname) {
        navigate(map[start], { replace: true });
      }
    }
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Telegram BackButton: useful on the order detail page
  useEffect(() => {
    const onDetail = /^\/orders\/\d+/.test(location.pathname);
    if (onDetail) {
      const off = backButtonHandler(() => navigate(-1));
      return off;
    }
  }, [location.pathname, navigate]);

  // WebSocket for real-time updates (skipped in mock mode — mockApi uses BroadcastChannel)
  useEffect(() => {
    if (!user || mock) return;
    let ws;
    let closed = false;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'order:new' || msg.type === 'order:update') {
            pushToast(`Заказ #${msg.order.orderId}: ${msg.order.statusLabel || ''}`);
            window.dispatchEvent(new CustomEvent('order:changed', { detail: msg.order }));
          } else if (msg.type === 'order:delete') {
            pushToast(`Заказ #${msg.orderId} удалён`, 'info');
            window.dispatchEvent(new CustomEvent('order:changed', { detail: { orderId: msg.orderId, _deleted: true } }));
          }
        } catch (_) {}
      };
      ws.onclose = () => {
        if (!closed) setTimeout(() => { if (!closed) location.reload(); }, 1500);
      };
    } catch (e) {
      console.warn('ws failed', e);
    }
    return () => {
      closed = true;
      if (ws) try { ws.close(); } catch (_) {}
    };
  }, [user, pushToast, mock]);

  // Header title based on current route
  const title = (() => {
    if (location.pathname.startsWith('/orders/')) return `Заказ`;
    if (location.pathname === '/orders') return 'Заказы';
    if (location.pathname === '/report') return 'Отчёт';
    if (location.pathname === '/advice') return 'Советы';
    return 'Учёт заказов';
  })();

  return (
    <ToastContext.Provider value={{ push: pushToast }}>
      <div className="app">
        {mock && (
          <div className="mock-banner">
            <span>🧪 <b>Локальный мок-режим</b> · данные в браузере</span>
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => {
                mockApi.reset();
                pushToast('Демо-данные сброшены', 'info');
                window.dispatchEvent(new CustomEvent('order:changed', { detail: { _refresh: true } }));
              }}
            >
              Сбросить демо
            </button>
          </div>
        )}
        <header className="app-header">
          <div className="app-title">{title}</div>
          <button
            className="btn btn-primary"
            onClick={() => {
              hapticNotify('success');
              setAddOpen(true);
            }}
          >
            <span className="btn-icon">＋</span>
            <span className="btn-text">Добавить</span>
          </button>
        </header>

        <main className="view" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetailWrapper />} />
            <Route path="/report" element={<Report />} />
            <Route path="/advice" element={<Advice />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <TabBar />

        {addOpen && (
          <AddOrderModal
            api={api}
            onClose={() => setAddOpen(false)}
            onCreated={() => {
              setAddOpen(false);
              window.dispatchEvent(new CustomEvent('order:changed', { detail: { _refresh: true } }));
            }}
          />
        )}

        <Toast toasts={toasts} />
      </div>
    </ToastContext.Provider>
  );
}

function OrderDetailWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <OrderDetail
      orderId={Number(id)}
      onBack={() => navigate(-1)}
    />
  );
}
