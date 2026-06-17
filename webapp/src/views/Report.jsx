import React, { useEffect, useState } from 'react';
import { useApi } from '../api.js';
import { fmtMoney, fmtNumber, fmtDayShort } from '../format.js';
import PeriodSelector from '../components/PeriodSelector.jsx';

export default function Report() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [range, setRange] = useState(null);

  useEffect(() => {
    if (!range) return;
    setErr(null);
    setData(null);
    let alive = true;
    api.periodReport(range)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message || 'ошибка загрузки'));
    return () => { alive = false; };
  }, [range]);

  // Default to current week on first mount
  useEffect(() => {
    if (range) return;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setRange({ from: start.toISOString(), to: end.toISOString() });
  }, [range]);

  if (err) return <div className="empty">Ошибка: {err}</div>;
  if (!data) return <div className="loader">Загрузка…</div>;

  const t = data.totals;
  const returnRate = t.returnRate;
  const cmp = data.comparison?.totals || {};

  const kpis = [
    { label: 'Заказов',        value: fmtNumber(t.all),       cmp: cmp.all },
    { label: 'Выкуплено',      value: fmtNumber(t.completed), cmp: cmp.completed },
    { label: 'Возвратов',      value: fmtNumber(t.returned),  cmp: cmp.returned,
      sub: `${returnRate}% от всех` },
    { label: 'В доставке',     value: fmtNumber(t.shipped) },
    { label: 'Выручка',        value: fmtMoney(t.revenue),    cmp: cmp.revenue },
    { label: 'Себестоимость',  value: fmtMoney(t.cost) },
    { label: 'Чистая прибыль', value: fmtMoney(t.profit),     cmp: cmp.profit, accent: true }
  ];

  return (
    <>
      <PeriodSelector value={range} onChange={setRange} />

      <div className="card report-summary">
        <div className="report-summary__head">
          <h3>Период</h3>
          <div className="report-summary__dates">{data.fromText} — {data.toText}</div>
        </div>
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          {kpis.map((k, i) => (
            <div key={i} className={'kpi' + (k.accent ? ' accent' : '')}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <Delta info={k.cmp} />
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Прибыль по дням</h3>
        <BarChart days={data.profitByDay || []} />
      </div>

      {data.bestDay && data.bestDay.profit > 0 && (
        <div className="card best-day">
          <h3>Лучший период</h3>
          <div className="kv">
            <span className="k">{data.bestDay.dateText}</span>
            <span className="v">{fmtMoney(data.bestDay.profit)}</span>
          </div>
        </div>
      )}

      <div className="card">
        <h3>ТОП-3 товара</h3>
        {data.topProducts?.length ? (
          data.topProducts.map((p, i) => (
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
          <div className="empty">Пока нет данных</div>
        )}
      </div>
    </>
  );
}

function Delta({ info }) {
  if (!info || info.pct === null) {
    return info ? <div className="kpi-sub">{info.abs > 0 ? '+' : ''}{info.abs}</div> : null;
  }
  const up = info.pct > 0;
  const flat = info.pct === 0;
  return (
    <div className={'kpi-delta ' + (flat ? 'flat' : up ? 'up' : 'down')}>
      {flat ? '→' : up ? '↑' : '↓'} {Math.abs(info.pct).toFixed(1)}%
      <span className="kpi-delta-prev"> vs прошл. период</span>
    </div>
  );
}

function BarChart({ days }) {
  if (!days.length) return <div className="empty">Нет данных</div>;
  const max = Math.max(1, ...days.map((d) => d.profit));
  // Wider bar = fewer days shown at once; narrower = more. Min 22px per bar.
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
