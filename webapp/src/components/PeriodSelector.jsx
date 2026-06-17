import React, { useState } from 'react';

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

const PRESETS = [
  { id: 'currentWeek',  label: 'Эта неделя' },
  { id: 'lastWeek',     label: 'Прошлая' },
  { id: 'currentMonth', label: 'Этот месяц' },
  { id: 'lastMonth',    label: 'Прошлый месяц' }
];

export default function PeriodSelector({ value, onChange }) {
  const today = new Date();
  const [preset, setPreset] = useState('currentWeek');
  const [customFrom, setCustomFrom] = useState(value?.from || ymdLocal(startOfWeek(today)));
  const [customTo,   setCustomTo]   = useState(value?.to   || ymdLocal(endOfWeek(today)));

  const apply = (id) => {
    setPreset(id);
    let from, to;
    if (id === 'currentWeek')  { from = startOfWeek(today);  to = endOfWeek(today); }
    else if (id === 'lastWeek') {
      const last = new Date(today); last.setDate(last.getDate() - 7);
      from = startOfWeek(last); to = endOfWeek(last);
    }
    else if (id === 'currentMonth') { from = startOfMonth(today); to = endOfMonth(today); }
    else if (id === 'lastMonth') {
      const last = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = startOfMonth(last); to = endOfMonth(last);
    }
    if (from && to) {
      setCustomFrom(ymdLocal(from));
      setCustomTo(ymdLocal(to));
      onChange({ from: from.toISOString(), to: to.toISOString() });
    }
  };

  const applyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    onChange({
      from: new Date(`${customFrom}T00:00:00`).toISOString(),
      to:   new Date(`${customTo}T23:59:59`).toISOString()
    });
  };

  return (
    <div className="period-selector">
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={'chip' + (preset === p.id ? ' active' : '')}
            onClick={() => apply(p.id)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="custom-range">
        <input
          type="date"
          value={customFrom}
          max={customTo}
          onChange={(e) => { setCustomFrom(e.target.value); setPreset('custom'); }}
        />
        <span className="dash">—</span>
        <input
          type="date"
          value={customTo}
          min={customFrom}
          max={ymdLocal(today)}
          onChange={(e) => { setCustomTo(e.target.value); setPreset('custom'); }}
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '8px 12px', fontSize: 13 }}
          onClick={applyCustom}
          disabled={!customFrom || !customTo || customFrom > customTo}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
