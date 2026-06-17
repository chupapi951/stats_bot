export const STATUS_LABELS = {
  created: 'Оформлен',
  shipped: 'В доставке',
  completed: 'Выкуплен',
  returned: 'Возврат'
};

export const STATUSES = [
  { id: 'all',       label: 'Все' },
  { id: 'created',   label: 'Оформлен' },
  { id: 'shipped',   label: 'В доставке' },
  { id: 'completed', label: 'Выкуплен' },
  { id: 'returned',  label: 'Возврат' }
];

export function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return (
    Number(n).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }) + ' \u20bd'
  );
}

/**
 * Compact money formatter for chart labels where space is tight.
 *   999       -> "999"
 *   1 200     -> "1,2k"
 *   12 500    -> "12,5k"
 *   150 000   -> "150k"
 *   1 200 000 -> "1,2M"
 */
export function fmtMoneyShort(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs < 1000) {
    return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' \u20bd';
  }
  if (abs < 1_000_000) {
    const k = v / 1000;
    return (
      k.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 }) +
      'k \u20bd'
    );
  }
  const m = v / 1_000_000;
  return (
    m.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 }) +
    'M \u20bd'
  );
}

export function fmtNumber(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

export function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function fmtDayShort(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { weekday: 'short' });
}

export function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
