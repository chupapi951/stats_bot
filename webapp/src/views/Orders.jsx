import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api.js';
import { fmtMoney, fmtDate, statusLabel, STATUSES } from '../format.js';
import { hapticImpact } from '../telegram.jsx';

export default function Orders() {
  const api = useApi();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const timer = useRef(null);
  const nav = useNavigate();

  const load = (s = status, q = search) => {
    setItems(null);
    api.orders({ status: s, search: q })
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('order:changed', onChange);
    return () => window.removeEventListener('order:changed', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  const onSearch = (v) => {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(status, v), 250);
  };

  return (
    <>
      <div className="orders-toolbar">
        <div className="search">
          <input
            type="search"
            placeholder="Поиск по № или товару"
            inputMode="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="chips">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={'chip' + (status === s.id ? ' active' : '')}
            onClick={() => { hapticImpact('selection'); setStatus(s.id); }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="order-list">
        {items === null ? (
          <div className="loader">Загрузка…</div>
        ) : !items.length ? (
          <div className="empty"><div className="big">📦</div><div>Заказов пока нет</div></div>
        ) : (
          items.map((o) => (
            <div
              key={o.orderId}
              className="order-row"
              onClick={() => { hapticImpact('selection'); nav(`/orders/${o.orderId}`); }}
            >
              <div>
                <div className="top">
                  <div className="name">{o.productName}</div>
                  <div className="id">#{o.orderId}</div>
                </div>
                <div className="meta">
                  <span className={'badge ' + o.status}>{statusLabel(o.status)}</span>
                  <span>{fmtDate(o.createdAt)}</span>
                </div>
              </div>
              <div className="price">{fmtMoney(o.sellingPrice)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
