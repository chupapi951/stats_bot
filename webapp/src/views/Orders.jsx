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
  const nav = useNavigate();

  // Keep the latest filter values in refs so the order:changed listener
  // (registered once on mount) always sees the current values without
  // being re-bound on every render.
  const statusRef = useRef(status);
  const searchRef = useRef(search);
  statusRef.current = status;
  searchRef.current = search;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api.orders({ status: statusRef.current, search: searchRef.current })
      .then((d) => { if (!cancelled) setItems(d.items || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [status, search, api]);

  useEffect(() => {
    const onChange = () => {
      // Re-fetch with the current filters when an order changes.
      let cancelled = false;
      setItems(null);
      api.orders({ status: statusRef.current, search: searchRef.current })
        .then((d) => { if (!cancelled) setItems(d.items || []); })
        .catch(() => { if (!cancelled) setItems([]); });
    };
    window.addEventListener('order:changed', onChange);
    return () => window.removeEventListener('order:changed', onChange);
  }, [api]);

  const onSearch = (v) => {
    setSearch(v);
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
