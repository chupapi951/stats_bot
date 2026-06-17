import React, { useLayoutEffect, useRef, useState } from 'react';
import { fmtMoney, fmtMoneyShort } from '../format.js';

const MIN_BAR = 8;
const MAX_BAR = 56;
const MAX_BAR_HEIGHT = 190;     // tall enough so 30 narrow bars feel readable
const LABEL_AREA = 38;          // px reserved for date label below the bar

export default function BarChart({ days }) {
  const scrollRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track the container width so the bars fill the available space
  // (or scroll horizontally if the range is wide).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (!days.length) return <div className="empty">Нет данных</div>;

  // Max combined value across all buckets (potential + actual).
  const max = Math.max(
    1,
    ...days.map((d) => (Number(d.profit) || 0) + (Number(d.potentialProfit) || 0))
  );

  // Pick the widest bar that still fits the container, otherwise cap so
  // we trigger a horizontal scroll instead of bars overflowing.
  const GAP = 8;
  const available = Math.max(containerWidth - GAP, MIN_BAR);
  const naturalBar = Math.min(
    MAX_BAR,
    Math.max(MIN_BAR, Math.floor((available - days.length * GAP) / days.length))
  );

  // If the natural width still produces a chart wider than the container,
  // the chart scrolls; we don't shrink bars below MIN_BAR.
  const needsScroll = naturalBar * days.length + GAP * days.length > available;
  const barWidth = needsScroll ? MIN_BAR : naturalBar;
  const chartWidth = days.length * (barWidth + GAP);

  return (
    <>
      <div className="bar-chart-wrap">
        <div className="bar-chart-scroll" ref={scrollRef}>
          <div
            className="bar-chart bar-chart--stacked"
            style={{
              minWidth: needsScroll ? chartWidth : '100%',
              height: MAX_BAR_HEIGHT + LABEL_AREA
            }}
          >
            {days.map((d, i) => {
              const actual = Number(d.profit) || 0;
              const potential = Number(d.potentialProfit) || 0;
              const total = actual + potential;
              const hActual = total > 0 ? (actual / max) * MAX_BAR_HEIGHT : 0;
              const hPot = total > 0 ? (potential / max) * MAX_BAR_HEIGHT : 0;
              const label = d.from
                ? new Date(d.from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                : (d.dateText || '');
              const titleParts = [];
              if (actual > 0) titleParts.push(`Получено: ${fmtMoney(actual)}`);
              if (potential > 0) titleParts.push(`В пути: ${fmtMoney(potential)}`);
              const title = titleParts.length
                ? titleParts.join('\n')
                : `Нет заказов (${fmtMoney(0)})`;

              return (
                <div
                  key={i}
                  className="bar"
                  style={{ width: barWidth, minWidth: barWidth, flex: needsScroll ? '0 0 auto' : '1 1 0' }}
                  title={title}
                >
                  <div className="bar-stack" style={{ height: MAX_BAR_HEIGHT }}>
                    {/* Actual (green) at the bottom, potential (yellow) on top. */}
                    <div
                      className="bar-segment bar-segment--actual"
                      style={{ height: `${hActual}px` }}
                    />
                    <div
                      className="bar-segment bar-segment--potential"
                      style={{ height: `${hPot}px` }}
                    />
                  </div>
                  {total > 0 && (
                    <div className="bar-value">{fmtMoneyShort(total)}</div>
                  )}
                  <div className="bar-label">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
        {needsScroll && <div className="bar-chart-hint">← листайте →</div>}
      </div>

      <div className="bar-legend">
        <div className="bar-legend__item">
          <span className="bar-legend__swatch bar-legend__swatch--actual" />
          <span>Получено (выкуплено)</span>
        </div>
        <div className="bar-legend__item">
          <span className="bar-legend__swatch bar-legend__swatch--potential" />
          <span>Потенциал (оформлен / в доставке)</span>
        </div>
      </div>
    </>
  );
}
