import React from 'react';
import { fmtMoney, fmtMoneyShort } from '../format.js';

export default function BarChart({ days }) {
  if (!days.length) return <div className="empty">Нет данных</div>;

  // Each bucket has:
  //   profit          — actual (completed orders, green)
  //   potentialProfit — in-pipeline (created + shipped, yellow)
  // The yellow bar is drawn ON TOP of the green one.
  const max = Math.max(
    1,
    ...days.map((d) => (Number(d.profit) || 0) + (Number(d.potentialProfit) || 0))
  );

  const barWidth = days.length > 14 ? 22 : days.length > 7 ? 36 : 48;
  const chartWidth = days.length * (barWidth + 8);

  // tallest possible stacked bar fills up to 140px, leaving headroom for
  // the floating value label above the bar.
  const MAX_BAR_HEIGHT = 140;

  return (
    <>
      <div className="bar-chart-scroll">
        <div
          className="bar-chart bar-chart--stacked"
          style={{ minWidth: chartWidth, height: 160 }}
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
                style={{ width: barWidth, minWidth: barWidth }}
                title={title}
              >
                <div className="bar-stack">
                  {/* Yellow (potential) is drawn first, then green (actual)
                      stacks on top of it. flex-direction: column-reverse in
                      .bar-stack gives the visual order "green on top, yellow
                      at the bottom" which matches the legend. */}
                  <div
                    className="bar-segment bar-segment--potential"
                    style={{ height: `${hPot}px` }}
                  />
                  <div
                    className="bar-segment bar-segment--actual"
                    style={{ height: `${hActual}px` }}
                  />
                  {total > 0 && (
                    <div className="bar-value">{fmtMoneyShort(total)}</div>
                  )}
                </div>
                <div className="bar-label">{label}</div>
              </div>
            );
          })}
        </div>
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
