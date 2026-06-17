import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { hapticImpact } from '../telegram.jsx';

const TABS = [
  { to: '/',       icon: '📊', label: 'Главная' },
  { to: '/orders', icon: '📦', label: 'Заказы' },
  { to: '/report', icon: '📈', label: 'Отчёт' },
  { to: '/advice', icon: '💡', label: 'Советы' }
];

export default function TabBar() {
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => {
        const active = t.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.to);
        return (
          <button
            key={t.to}
            className={'tab' + (active ? ' active' : '')}
            onClick={() => {
              hapticImpact('selection');
              nav(t.to);
            }}
            role="tab"
            aria-selected={active}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
