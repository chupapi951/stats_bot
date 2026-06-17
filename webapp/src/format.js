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
