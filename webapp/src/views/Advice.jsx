import React, { useEffect, useState } from 'react';
import { useApi } from '../api.js';
import { fmtMoney, fmtNumber, fmtDate, fmtDayShort } from '../format.js';

const ICONS = {
  ok:   '\u2705',
  warn: '\u26a0\ufe0f',
  bad:  '\u274c',
  info: '\u2139\ufe0f'
};

function pct(n) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1) + '%';
}

function deltaArrow(prev, current) {
  if (prev === undefined || current === undefined) return null;
  if (current > prev) return { dir: 'up', text: `+${current - prev}` };
  if (current < prev) return { dir: 'down', text: `${current - prev}` };
  return { dir: 'flat', text: '0' };
}

export default function Advice() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.advice().then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="empty">Ошибка: {err}</div>;
  if (!data) return <div className="loader">Загрузка…</div>;

  const s = data.summary;
  const from = s.range?.from ? fmtDate(s.range.from) : '—';
  const to   = s.range?.to   ? new Date(new Date(s.range.to).getTime() - 1) : null;
  const toText = to ? fmtDate(to) : '—';
  const prev   = s.prev || {};

  // visual % bars (capped to 100)
  const max = Math.max(1, s.all);
  const allBar    = { w: 100 };
  const compBar   = { w: (s.completed / max) * 100 };
  const shipBar   = { w: (s.shipped / max) * 100 };
  const retBar    = { w: (s.returned / max) * 100 };

  const tiles = [
    {
      key: 'all',
      label: 'Всего заказов',
      value: fmtNumber(s.all),
      bar: allBar,
      delta: deltaArrow(prev.all, s.all),
      tone: 'neutral'
    },
    {
      key: 'completed',
      label: 'Выкуплено',
      value: fmtNumber(s.completed),
      bar: compBar,
      delta: deltaArrow(prev.completed, s.completed),
      tone: 'good'
    },
    {
      key: 'shipped',
      label: 'В доставке',
      value: fmtNumber(s.shipped),
      bar: shipBar,
      delta: deltaArrow(prev.shipped, s.shipped),
      tone: 'info'
    },
    {
      key: 'returned',
      label: 'Возвратов',
      value: `${fmtNumber(s.returned)} · ${pct(s.returnRate)}`,
      bar: retBar,
      delta: deltaArrow(prev.returned, s.returned),
      tone: s.returnRate > 15 ? 'bad' : 'good',
      note: s.returnRate > 15 ? 'выше нормы' : 'в пределах нормы'
    }
  ];

  return (
    <>
      <div className="advice-hero card">
        <div className="advice-hero__head">
          <div>
            <div className="advice-hero__eyebrow">📅 Сводка за неделю</div>
            <div className="advice-hero__title">{from} — {toText}</div>
          </div>
          <div className="advice-hero__return" data-tone={tiles[3].tone}>
            <div className="advice-hero__return-num">{pct(s.returnRate)}</div>
            <div className="advice-hero__return-lbl">возвратов</div>
          </div>
        </div>
        <div className="advice-tiles">
          {tiles.map((t) => (
            <div key={t.key} className="advice-tile" data-tone={t.tone}>
              <div className="advice-tile__label">{t.label}</div>
              <div className="advice-tile__value">{t.value}</div>
              <div className="advice-tile__bar">
                <div className="advice-tile__bar-fill" style={{ width: `${t.bar.w}%` }} />
              </div>
              <div className="advice-tile__delta" data-dir={t.delta?.dir || 'flat'}>
                {t.delta && (
                  <>
                    <span className="advice-tile__arrow">
                      {t.delta.dir === 'up' ? '↑' : t.delta.dir === 'down' ? '↓' : '→'}
                    </span>
                    <span>{t.delta.text}</span>
                    <span className="advice-tile__delta-prev">vs прошлая</span>
                  </>
                )}
              </div>
              {t.note && <div className="advice-tile__note">{t.note}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="section-title">Советы и рекомендации</div>

      {data.tips?.length ? (
        data.tips.map((t, i) => (
          <div key={i} className={'tip tip--' + t.level}>
            <div className="tip__icon">{ICONS[t.level] || ICONS.info}</div>
            <div className="tip__text">{t.text}</div>
          </div>
        ))
      ) : (
        <div className="empty">Пока недостаточно данных</div>
      )}
    </>
  );
}
