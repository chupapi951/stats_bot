import React, { useState, useEffect } from 'react';

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

/**
 * Compute which preset is active for a given [from, to] range.
 * Returns 'custom' when no preset matches.
 */
function detectPreset(fromIso, toIso) {
  if (!fromIso || !toIso) return 'currentWeek';
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const today = new Date();

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // Current week
  const cw = startOfWeek(today), cwe = endOfWeek(today);
  if (sameDay(from, cw) && sameDay(to, cwe)) return 'currentWeek';
  // Last week
  const lw = new Date(today); lw.setDate(lw.getDate() - 7);
  const lwS = startOfWeek(lw), lwE = endOfWeek(lw);
  if (sameDay(from, lwS) && sameDay(to, lwE)) return 'lastWeek';
  // Current month
  const cm = startOfMonth(today), cme = endOfMonth(today);
  if (sameDay(from, cm) && sameDay(to, cme)) return 'currentMonth';
  // Last month
  const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lmS = startOfMonth(lm), lmE = endOfMonth(lm);
  if (sameDay(from, lmS) && sameDay(to, lmE)) return 'lastMonth';

  return 'custom';
}

export default function PeriodSelector({ value, onChange }) {
  const today = new Date();
  const [preset, setPreset] = useState(() => detectPreset(value?.from, value?.to));
  const [customFrom, setCustomFrom] = useState(value?.from ? ymdLocal(new Date(value.from)) : ymdLocal(startOfWeek(today)));
  const [customTo,   setCustomTo]   = useState(value?.to   ? ymdLocal(new Date(value.to))   : ymdLocal(endOfWeek(today)));

  // Keep the active preset in sync with the current range (covers external changes
  // like Report's initial range or a custom range applied via "Применить").
  useEffect(() => {
    setPreset(detectPreset(value?.from, value?.to));
  }, [value?.from, value?.to]);

  const apply = (id) => {
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
