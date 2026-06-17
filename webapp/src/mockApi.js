// Local mock API for development without Telegram / backend.
// Stores orders in localStorage, broadcasts changes across tabs.
//
// Activate by:
//   1. open http://localhost:5173/?mock=1  (or with hash: #/?mock=1)
//   2. or auto: when window.Telegram.WebApp is missing AND
//      VITE_MOCK is undefined (set VITE_MOCK=0 to force real backend)

const KEY = 'stats_bot_mock_v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stats_bot_mock') : null;

function uid() {
  return Number(localStorage.getItem('stats_bot_mock_uid') || (() => {
    const id = Math.floor(Math.random() * 1e9);
    localStorage.setItem('stats_bot_mock_uid', String(id));
    return id;
  })());
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return seed();
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  if (channel) channel.postMessage({ type: 'changed' });
}

function seed() {
  const userId = uid();
  const now = Date.now();
  const day = 86400000;
  const mk = (offsetDays, hour, name, cp, sp, status) => {
    const created = new Date(now - offsetDays * day);
    created.setHours(hour, 0, 0, 0);
    const completed = status === 'completed' ? new Date(created.getTime() + 2 * day) : null;
    return {
      orderId: 0, // assigned later
      userId,
      productName: name,
      costPrice: cp,
      sellingPrice: sp,
      status,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
      completedAt: completed ? completed.toISOString() : null,
      profit: completed ? Math.round((sp - cp) * 100) / 100 : null,
      category: null,
      comment: null
    };
  };

  const orders = [
    mk(6, 11, 'футболка nike',     900, 2100, 'completed'),
    mk(5, 14, 'худи оверсайз',    1800, 4200, 'completed'),
    mk(4, 10, 'кроссовки adidas', 3200, 6900, 'completed'),
    mk(3, 16, 'футболка nike',     900, 2100, 'shipped'),
    mk(2, 12, 'худи оверсайз',    1800, 4200, 'shipped'),
    mk(2, 18, 'шапка',             400, 1200, 'returned'),
    mk(1,  9, 'носки (3 пары)',    300,  900, 'created'),
    mk(0, 13, 'кроссовки adidas', 3200, 6900, 'created')
  ];

  // assign per-user orderId
  orders.forEach((o, i) => { o.orderId = i + 101; });

  const state = {
    userId,
    lastOrderNumber: orders[orders.length - 1].orderId,
    orders
  };
  save(state);
  return state;
}

let state = load();
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    notify('order:changed', null);
  }
});
if (channel) {
  channel.onmessage = () => {
    state = load();
    notify('order:changed', null);
  };
}

function notify(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

const STATUS_LABELS = { created: 'Оформлен', shipped: 'В доставке', completed: 'Выкуплен', returned: 'Возврат' };

function serialize(o) {
  if (!o) return null;
  return {
    ...o,
    statusLabel: STATUS_LABELS[o.status] || o.status,
    createdAtText: fmtDateTime(o.createdAt),
    updatedAtText: fmtDateTime(o.updatedAt),
    completedAtText: o.completedAt ? fmtDateTime(o.completedAt) : null
  };
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function nextOrderNumber() {
  state.lastOrderNumber += 1;
  return state.lastOrderNumber;
}

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}
function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 7); return e; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function within(d, from, to) { const t = new Date(d).getTime(); return t >= from.getTime() && t < to.getTime(); }

function dashboard() {
  const wkFrom = startOfWeek(new Date());
  const wkTo = endOfWeek(new Date());
  const inWeek = state.orders.filter((o) => within(o.createdAt, wkFrom, wkTo));
  const counts = { created: 0, shipped: 0, completed: 0, returned: 0 };
  for (const o of inWeek) counts[o.status] += 1;
  // Revenue / cost / profit counted ONLY for completed orders in the
  // current week. Returned orders are tracked via counts.returned.
  const completed = inWeek.filter((o) => o.status === 'completed');
  const potential = inWeek.filter((o) => o.status === 'created' || o.status === 'shipped');
  const revenue = round2(completed.reduce((s, o) => s + (o.sellingPrice || 0), 0));
  const cost    = round2(completed.reduce((s, o) => s + (o.costPrice || 0), 0));
  const profit  = round2(completed.reduce((s, o) => s + (o.profit || 0), 0));
  const potentialRevenue = round2(potential.reduce((s, o) => s + (o.sellingPrice || 0), 0));
  // Potential profit is sellingPrice - costPrice, since created/shipped
  // orders haven't had their `profit` field set yet.
  const potentialProfit  = round2(potential.reduce((s, o) => s + ((o.sellingPrice || 0) - (o.costPrice || 0)), 0));

  const profitByDay = [];
  for (let i = 0; i < 7; i += 1) {
    const ds = startOfDay(new Date(wkFrom.getTime() + i * 86400000));
    const de = endOfDay(ds);
    const day = state.orders.filter((o) => o.status === 'completed' && within(o.completedAt || o.createdAt, ds, de));
    const pot  = state.orders.filter((o) => (o.status === 'created' || o.status === 'shipped') && within(o.createdAt, ds, de));
    profitByDay.push({
      date: ds.toISOString(),
      profit: day.reduce((s, o) => s + (o.profit || 0), 0),
      // Potential profit for in-pipeline orders is sellingPrice - costPrice.
      potentialProfit: pot.reduce((s, o) => s + ((o.sellingPrice || 0) - (o.costPrice || 0)), 0),
      orders: day.length
    });
  }

  const productMap = new Map();
  for (const o of state.orders) {
    if (o.status !== 'completed') continue;
    const cur = productMap.get(o.productName) || { productName: o.productName, profit: 0, qty: 0, revenue: 0 };
    cur.profit += o.profit || 0;
    cur.qty += 1;
    cur.revenue += o.sellingPrice || 0;
    productMap.set(o.productName, cur);
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.profit - a.profit).slice(0, 3);
  const bestDay = profitByDay.reduce((a, b) => (b.profit > (a?.profit || 0) ? b : a), null);

  return {
    week: {
      all: inWeek.length,
      ...counts,
      revenue: round2(revenue),
      cost: round2(cost),
      profit: round2(profit),
      potentialRevenue: potentialRevenue,
      potentialProfit: potentialProfit,
      profitByDay,
      topProducts: topProducts.map((p) => ({ ...p, profit: round2(p.profit), revenue: round2(p.revenue) })),
      bestDay: bestDay ? { ...bestDay, dateText: new Date(bestDay.date).toLocaleDateString('ru-RU') } : null
    },
    recent: [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map(serialize)
  };
}

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function listOrders({ status, search } = {}) {
  let items = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status && status !== 'all') items = items.filter((o) => o.status === status);
  if (search) {
    const s = String(search).toLowerCase();
    items = items.filter((o) => o.productName.toLowerCase().includes(s) || String(o.orderId).includes(s));
  }
  return { items: items.map(serialize) };
}

function getOrder(id) {
  return serialize(state.orders.find((o) => o.orderId === Number(id)) || null);
}

function createOrder({ productName, costPrice, sellingPrice, createdAt }) {
  const now = new Date();
  const created = createdAt ? new Date(createdAt) : now;
  const order = {
    orderId: nextOrderNumber(),
    userId: state.userId,
    productName: String(productName).trim(),
    costPrice: Number(costPrice) || 0,
    sellingPrice: Number(sellingPrice) || 0,
    status: 'created',
    createdAt: (isNaN(created.getTime()) ? now : created).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    profit: null,
    category: null,
    comment: null
  };
  state.orders.push(order);
  save(state);
  notify('order:changed', { order: serialize(order) });
  return serialize(order);
}

function setStatus(id, status) {
  const o = state.orders.find((x) => x.orderId === Number(id));
  if (!o) throw new Error('not found');
  o.status = status;
  o.updatedAt = new Date().toISOString();
  if (status === 'completed') {
    o.completedAt = o.updatedAt;
    o.profit = round2(o.sellingPrice - o.costPrice);
  } else if (status === 'returned') {
    o.completedAt = null;
    o.profit = 0;
  } else {
    o.completedAt = null;
    o.profit = null;
  }
  save(state);
  notify('order:changed', { order: serialize(o) });
  return serialize(o);
}

function deleteOrder(id) {
  const i = state.orders.findIndex((x) => x.orderId === Number(id));
  if (i === -1) throw new Error('not found');
  state.orders.splice(i, 1);
  save(state);
  notify('order:changed', { orderId: Number(id), _deleted: true });
  return { ok: true };
}

function updateOrder(id, patch) {
  const o = state.orders.find((x) => x.orderId === Number(id));
  if (!o) throw new Error('not found');
  if (patch.productName !== undefined) o.productName = String(patch.productName).trim();
  if (patch.costPrice !== undefined)    o.costPrice    = Number(patch.costPrice) || 0;
  if (patch.sellingPrice !== undefined) o.sellingPrice = Number(patch.sellingPrice) || 0;
  if (patch.category !== undefined)     o.category     = patch.category || null;
  if (patch.comment !== undefined)      o.comment      = patch.comment || null;
  o.updatedAt = new Date().toISOString();
  save(state);
  notify('order:changed', { order: serialize(o) });
  return serialize(o);
}

function weekReport() {
  const r = dashboard();
  const fromDate = new Date(r.week.profitByDay[0].date);
  const toDate = new Date(r.week.profitByDay[6].date);
  toDate.setHours(23, 59, 59, 999);
  const comparison = {
    range: { from: new Date(fromDate.getTime() - 7 * 86400000).toISOString(), to: fromDate.toISOString() },
    totals: { all: null, completed: null, returned: null, revenue: null, profit: null }
  };
  return {
    range: { from: fromDate.toISOString(), to: new Date(toDate.getTime() + 1).toISOString() },
    totals: { ...r.week.totals, returnRate: r.week.all > 0 ? round2((r.week.returned / r.week.all) * 100) : 0 },
    profitByDay: r.week.profitByDay,
    topProducts: r.week.topProducts,
    bestDay: r.week.bestDay,
    comparison,
    fromText: fromDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    toText: toDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  };
}

function statsFor(from, to) {
  const inRange = state.orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
  const counts = { created: 0, shipped: 0, completed: 0, returned: 0 };
  for (const o of inRange) counts[o.status] += 1;
  const all = inRange.length;
  // Revenue / cost / profit counted ONLY for completed orders.
  // Returned orders are tracked separately in counts.returned + returnRate.
  const completed = inRange.filter((o) => o.status === 'completed');
  const potential = inRange.filter((o) => o.status === 'created' || o.status === 'shipped');
  const revenue = round2(completed.reduce((s, o) => s + o.sellingPrice, 0));
  const cost    = round2(completed.reduce((s, o) => s + o.costPrice, 0));
  const profit  = round2(completed.reduce((s, o) => s + (o.profit || 0), 0));
  const potentialRevenue = round2(potential.reduce((s, o) => s + o.sellingPrice, 0));
  // Potential profit is sellingPrice - costPrice.
  const potentialProfit  = round2(potential.reduce((s, o) => s + (o.sellingPrice - o.costPrice), 0));

  const productMap = new Map();
  for (const o of inRange) {
    if (o.status !== 'completed') continue;
    const cur = productMap.get(o.productName) || { productName: o.productName, profit: 0, qty: 0, revenue: 0 };
    cur.profit += o.profit || 0; cur.qty += 1; cur.revenue += o.sellingPrice || 0;
    productMap.set(o.productName, cur);
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.profit - a.profit).slice(0, 3)
    .map((p) => ({ ...p, profit: round2(p.profit), revenue: round2(p.revenue) }));

  // bucketed profit timeline (day for <=31d, else week)
  const totalDays = Math.max(1, Math.ceil((to - from) / 86400000));
  const stepDays = totalDays <= 31 ? 1 : 7;
  const profitByDay = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + stepDays);
    if (next > to) next.setTime(to.getTime());
    const slice = inRange.filter((o) => o.status === 'completed' &&
      new Date(o.createdAt) >= cursor && new Date(o.createdAt) < next);
    const pot = inRange.filter((o) =>
      (o.status === 'created' || o.status === 'shipped') &&
      new Date(o.createdAt) >= cursor && new Date(o.createdAt) < next);
    profitByDay.push({
      from: cursor.toISOString(),
      to: next.toISOString(),
      profit: round2(slice.reduce((s, o) => s + (o.profit || 0), 0)),
      potentialProfit: round2(pot.reduce((s, o) => s + (o.sellingPrice - o.costPrice), 0)),
      orders: slice.length
    });
    cursor = next;
  }

  let best = null;
  for (const b of profitByDay) {
    if (!best || b.profit > best.profit) best = b;
  }
  if (best) {
    best.date = best.from;
    best.dateText = new Date(best.from).toLocaleDateString('ru-RU');
  }

  return {
    totals: {
      all, ...counts,
      returnRate: all > 0 ? round2((counts.returned / all) * 100) : 0,
      revenue, cost, profit,
      potentialRevenue, potentialProfit
    },
    profitByDay,
    topProducts,
    bestDay: best
  };
}

function periodReport({ from: fromIso, to: toIso } = {}) {
  let from, to;
  if (fromIso && toIso) {
    from = new Date(fromIso); from.setHours(0, 0, 0, 0);
    to   = new Date(toIso);   to.setHours(23, 59, 59, 999);
    to   = new Date(to.getTime() + 1);
  } else {
    const t = new Date();
    const d = (t.getDay() + 6) % 7;
    from = new Date(t); from.setDate(from.getDate() - d); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setDate(to.getDate() + 7);
  }
  const current = statsFor(from, to);
  const ms = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - ms);
  const prevTo   = from;
  const prev = statsFor(prevFrom, prevTo);
  const delta = (a, b) => b === 0 ? { abs: round2(a), pct: null } : { abs: round2(a - b), pct: round2(((a - b) / b) * 100) };

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    ...current,
    comparison: {
      range: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
      totals: {
        all:       delta(current.totals.all, prev.totals.all),
        completed: delta(current.totals.completed, prev.totals.completed),
        returned:  delta(current.totals.returned, prev.totals.returned),
        revenue:   delta(current.totals.revenue, prev.totals.revenue),
        profit:    delta(current.totals.profit, prev.totals.profit)
      }
    },
    fromText: new Date(from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    toText:   new Date(to.getTime() - 1).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  };
}

function advice() {
  const r = dashboard();
  const decided = r.week.completed + r.week.returned;
  const returnRate = decided > 0 ? (r.week.returned / decided) * 100 : 0;
  const tips = [];

  if (decided >= 3 && returnRate > 15) {
    tips.push({ level: 'warn', icon: '\u26a0\ufe0f', text: `Доля возвратов ${returnRate.toFixed(1)}% (>15%). Проверьте качество товара, фото и описания.` });
  } else if (returnRate > 0) {
    tips.push({ level: 'ok', icon: '\u2705', text: `Доля возвратов ${returnRate.toFixed(1)}% — в пределах нормы.` });
  } else {
    tips.push({ level: 'info', icon: '\u2139\ufe0f', text: 'Пока недостаточно данных по выкупам, чтобы оценить возвраты.' });
  }

  const completed = state.orders.filter((o) => o.status === 'completed');
  if (completed.length) {
    const margins = completed.map((o) => ({ name: o.productName, m: o.profit / o.sellingPrice }));
    const avg = margins.reduce((s, x) => s + x.m, 0) / margins.length;
    const low = margins.filter((x) => x.m < avg * 0.7);
    if (low.length) {
      const name = low[0].name;
      tips.push({ level: 'warn', icon: '\u26a0\ufe0f', text: `Маржа товара «${name}» ниже средней. Подумайте о повышении цены или смене поставщика.` });
    }
  }

  const oldShipped = state.orders.filter((o) => o.status === 'shipped' && (Date.now() - new Date(o.updatedAt).getTime()) > 5 * 86400000).length;
  if (oldShipped > 0) {
    tips.push({ level: 'warn', icon: '\u26a0\ufe0f', text: `${oldShipped} заказ(ов) в доставке более 5 дней — проверьте их статус.` });
  }

  if (r.week.topProducts[0]) {
    const p = r.week.topProducts[0];
    tips.push({ level: 'ok', icon: '\u2705', text: `Лучший товар недели — «${p.productName}»: прибыль ${p.profit} \u20bd, ${p.qty} шт. Сделайте на него акцент.` });
  }

  tips.push({ level: 'info', icon: '\u2139\ufe0f', text: 'Советы обновляются автоматически каждую неделю.' });

  return { summary: { all: r.week.all, completed: r.week.completed, returned: r.week.returned, shipped: r.week.shipped, returnRate: round2(returnRate) }, tips };
}

function reset() {
  localStorage.removeItem(KEY);
  state = seed();
  notify('order:changed', { _refresh: true });
  return { ok: true };
}

export const mockApi = {
  enabled: true,
  dashboard, listOrders, getOrder, createOrder, setStatus, deleteOrder, updateOrder,
  weekReport, periodReport, advice, reset,
  get userId() { return state.userId; }
};
