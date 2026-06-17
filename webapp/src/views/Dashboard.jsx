import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api.js';
import { fmtMoney, fmtNumber, fmtDayShort, statusLabel, fmtDate } from '../format.js';
import { hapticImpact } from '../telegram.jsx';

export default function Dashboard() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    setErr(null);
    api.dashboard()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message));
    const onChange = () => api.dashboard().then((d) => alive && setData(d)).catch(() => {});
    window.addEventListener('order:changed', onChange);
    return () => { alive = false; window.removeEventListener('order:changed', onChange); };
  }, []);

  if (err) return <div className="empty">Ошибка: {err}</div>;
  if (!data) return <div className="loader">Загрузка…</div>;

  const w = data.week;
  const kpis = [
    { label: 'Всего заказов', value: fmtNumber(w.all), sub: 'за неделю' },
    { label: 'Выкуплено', value: fmtNumber(w.completed) },
    { label: 'В доставке', value: fmtNumber(w.shipped) },
    { label: 'Возвратов', value: fmtNumber(w.returned) },
    { label: 'Выручка', value: fmtMoney(w.revenue) },
    { label: 'Прибыль', value: fmtMoney(w.profit), accent: true }
  ];

  const bestSub = w.bestDay && w.bestDay.profit > 0
    ? `Лучший день: ${w.bestDay.dateText} (${fmtMoney(w.bestDay.profit)})`
    : 'Лучший день: —';

  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className={'kpi' + (k.accent ? ' accent' : '')}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            {k.sub ? <div className="kpi-sub">{k.sub}</div> : <div className="kpi-sub">{bestSub}</div>}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Прибыль по дням</h3>
        <BarChart days={w.profitByDay || []} />
      </div>

      <div className="card">
        <h3>ТОП-3 товара по прибыли</h3>
        {w.topProducts?.length ? (
          w.topProducts.map((p, i) => (
            <div key={i} className="product">
              <div className="rank">{i + 1}</div>
              <div className="name">
                <div>{p.productName}</div>
                <div style={{ color: 'var(--hint)', fontSize: 12 }}>{fmtNumber(p.qty)} шт · {fmtMoney(p.revenue)}</div>
              </div>
              <div className="profit">{fmtMoney(p.profit)}</div>
            </div>
          ))
        ) : (
          <div className="empty"><div>Пока нет выкупленных заказов</div></div>
        )}
      </div>

      <div className="section-title">Последние заказы</div>
      <div className="order-list">
        {data.recent?.length ? (
          data.recent.slice(0, 5).map((o) => (
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
        ) : (
          <div className="empty">Заказов пока нет</div>
        )}
      </div>
    </>
  );
}

function BarChart({ days }) {
  if (!days.length) return <div className="empty">Нет данных</div>;
  const max = Math.max(1, ...days.map((d) => d.profit));
  // Same adaptive sizing as Report: wider bars for short ranges,
  // narrower for longer ones (week → ~7 wide bars, month → ~30 narrow).
  const barWidth = days.length > 14 ? 22 : days.length > 7 ? 36 : 48;
  const chartWidth = days.length * (barWidth + 8);
  return (
    <div className="bar-chart-scroll">
      <div className="bar-chart" style={{ minWidth: chartWidth, height: 160 }}>
        {days.map((d, i) => {
          const h = Math.max(4, (d.profit / max) * 140);
          const label = d.from
            ? new Date(d.from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
            : fmtDayShort(d.date);
          return (
            <div key={i} className="bar" style={{ width: barWidth, minWidth: barWidth }}>
              <div className="bar-fill" style={{ height: `${h}px` }}>
                <div className="bar-value">{d.profit > 0 ? fmtMoney(d.profit) : ''}</div>
              </div>
              <div className="bar-label">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
