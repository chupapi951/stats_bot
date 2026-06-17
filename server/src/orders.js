'use strict';

const { getDb } = require('./db');
const { round2, startOfWeek, endOfWeek, startOfDay, endOfDay } = require('./utils');

const STATUSES = ['created', 'shipped', 'completed', 'returned'];
const STATUS_LABELS = {
  created: 'Оформлен',
  shipped: 'В доставке',
  completed: 'Выкуплен',
  returned: 'Возврат'
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

async function nextOrderNumber(userId) {
  const db = getDb();
  const user = await db
    .collection('users')
    .findOneAndUpdate(
      { userId },
      { $inc: { lastOrderNumber: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
  // mongodb driver v6 returns the document directly
  const doc = user && user.value ? user.value : user;
  return doc.lastOrderNumber;
}

async function createOrder(userId, { productName, costPrice, sellingPrice, createdAt }) {
  const db = getDb();
  const now = new Date();
  const num = await nextOrderNumber(userId);
  const orderId = num; // global per-user sequence (#101, #102…)

  let created = now;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) created = d;
  }

  const doc = {
    orderId,
    userId,
    productName: String(productName).trim(),
    costPrice: Number(costPrice) || 0,
    sellingPrice: Number(sellingPrice) || 0,
    status: 'created',
    createdAt: created,
    updatedAt: now,
    completedAt: null,
    profit: null,
    category: null,
    comment: null
  };

  await db.collection('orders').insertOne(doc);
  return doc;
}

async function listOrders(userId, { status, search, limit = 200 } = {}) {
  const db = getDb();
  const filter = { userId };
  if (status && status !== 'all') filter.status = status;
  if (search) {
    const re = new RegExp(escapeReg(search), 'i');
    filter.$or = [{ productName: re }, { orderId: Number(search) || -1 }];
  }
  const items = await db
    .collection('orders')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return items;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getOrder(userId, orderId) {
  const db = getDb();
  return db.collection('orders').findOne({ userId, orderId: Number(orderId) });
}

async function updateStatus(userId, orderId, newStatus) {
  if (!STATUSES.includes(newStatus)) throw new Error('invalid status');
  const db = getDb();
  const now = new Date();
  const order = await getOrder(userId, orderId);
  if (!order) throw new Error('not found');

  const update = { status: newStatus, updatedAt: now };

  if (newStatus === 'completed') {
    update.completedAt = now;
    update.profit = round2(order.sellingPrice - order.costPrice);
  } else if (newStatus === 'returned') {
    update.completedAt = null;
    update.profit = 0;
  } else if (newStatus === 'created' || newStatus === 'shipped') {
    update.completedAt = null;
    update.profit = null;
  }

  await db.collection('orders').updateOne({ userId, orderId: Number(orderId) }, { $set: update });
  return getOrder(userId, orderId);
}

async function updateOrder(userId, orderId, patch) {
  const db = getDb();
  const allowed = {};
  if (patch.productName !== undefined) allowed.productName = String(patch.productName).trim();
  if (patch.costPrice !== undefined) allowed.costPrice = Number(patch.costPrice) || 0;
  if (patch.sellingPrice !== undefined) allowed.sellingPrice = Number(patch.sellingPrice) || 0;
  if (patch.category !== undefined) allowed.category = patch.category || null;
  if (patch.comment !== undefined) allowed.comment = patch.comment || null;
  allowed.updatedAt = new Date();
  await db.collection('orders').updateOne(
    { userId, orderId: Number(orderId) },
    { $set: allowed }
  );
  return getOrder(userId, orderId);
}

async function deleteOrder(userId, orderId) {
  const db = getDb();
  return db.collection('orders').deleteOne({ userId, orderId: Number(orderId) });
}

async function computeStats(userId, from, to) {
  const db = getDb();
  const baseMatch = { userId, createdAt: { $gte: from, $lt: to } };
  const all = await db.collection('orders').countDocuments(baseMatch);

  const byStatus = await db
    .collection('orders')
    .aggregate([
      { $match: baseMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
    .toArray();

  const counts = { created: 0, shipped: 0, completed: 0, returned: 0 };
  for (const r of byStatus) counts[r._id] = r.count;

  // Revenue / cost / profit:
  //   - actual:    counted ONLY for completed orders
  //   - potential: counted for created + shipped orders (still in pipeline).
  //     For these the order's `profit` field is null until completion, so we
  //     compute it inline as sellingPrice - costPrice.
  // Returned orders are tracked separately via counts.returned + returnRate.
  const moneyAgg = await db
    .collection('orders')
    .aggregate([
      {
        $match: {
          ...baseMatch,
          status: { $in: ['created', 'shipped', 'completed'] }
        }
      },
      {
        $group: {
          _id: '$status',
          revenue: { $sum: '$sellingPrice' },
          cost: { $sum: '$costPrice' },
          // Use $ifNull so null profits (created/shipped) are computed inline
          // as sellingPrice - costPrice. The result is the expected profit
          // if the order is eventually completed.
          profit: {
            $sum: {
              $add: [
                { $ifNull: ['$profit', 0] },
                {
                  $cond: [
                    { $in: ['$status', ['created', 'shipped']] },
                    { $subtract: ['$sellingPrice', '$costPrice'] },
                    0
                  ]
                }
              ]
            }
          }
        }
      }
    ])
    .toArray();

  const byStatusMoney = { created: { revenue: 0, cost: 0, profit: 0 },
                           shipped: { revenue: 0, cost: 0, profit: 0 },
                           completed: { revenue: 0, cost: 0, profit: 0 } };
  for (const r of moneyAgg) {
    if (byStatusMoney[r._id]) {
      byStatusMoney[r._id].revenue = r.revenue || 0;
      byStatusMoney[r._id].cost = r.cost || 0;
      byStatusMoney[r._id].profit = r.profit || 0;
    }
  }

  const revenue = byStatusMoney.completed.revenue;
  const cost = byStatusMoney.completed.cost;
  const profit = byStatusMoney.completed.profit;
  const potentialRevenue = (byStatusMoney.created.revenue || 0) + (byStatusMoney.shipped.revenue || 0);
  const potentialProfit  = (byStatusMoney.created.profit  || 0) + (byStatusMoney.shipped.profit  || 0);

  // top products by profit (completed only)
  const topProducts = await db
    .collection('orders')
    .aggregate([
      { $match: { userId, status: 'completed', createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: '$productName',
          profit: { $sum: '$profit' },
          qty: { $sum: 1 },
          revenue: { $sum: '$sellingPrice' }
        }
      },
      { $sort: { profit: -1 } },
      { $limit: 3 }
    ])
    .toArray();

  return {
    totals: {
      all,
      ...counts,
      // return rate as % of all orders in the period
      returnRate: all > 0 ? round2((counts.returned / all) * 100) : 0,
      // Actual: completed only
      revenue: round2(revenue),
      cost: round2(cost),
      profit: round2(profit),
      // Potential: created + shipped (in pipeline)
      potentialRevenue: round2(potentialRevenue),
      potentialProfit: round2(potentialProfit)
    },
    topProducts: topProducts.map((p) => ({
      productName: p._id,
      profit: round2(p.profit),
      qty: p.qty,
      revenue: round2(p.revenue)
    }))
  };
}

/**
 * Build profitByDay for any range. Each bucket = [start, start+step).
 * step is one day for ranges <= 31 days, one week otherwise.
 */
function dayBuckets(from, to) {
  const totalMs = to.getTime() - from.getTime();
  const days = Math.max(1, Math.ceil(totalMs / 86400000));
  const stepDays = days <= 31 ? 1 : 7;
  const buckets = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + stepDays);
    if (next > to) next.setTime(to.getTime());
    buckets.push({ from: new Date(cursor), to: next });
    cursor = next;
  }
  return buckets;
}

async function profitByBuckets(userId, from, to) {
  const db = getDb();
  const buckets = dayBuckets(from, to);
  const out = [];
  for (const b of buckets) {
    // Split by status so the bar chart can render actual vs potential stacks.
    // For created/shipped, profit is null — compute it inline as
    // sellingPrice - costPrice.
    const agg = await db
      .collection('orders')
      .aggregate([
        {
          $match: {
            userId,
            status: { $in: ['created', 'shipped', 'completed'] },
            createdAt: { $gte: b.from, $lt: b.to }
          }
        },
        {
          $group: {
            _id: '$status',
            profit: {
              $sum: {
                $add: [
                  { $ifNull: ['$profit', 0] },
                  {
                    $cond: [
                      { $in: ['$status', ['created', 'shipped']] },
                      { $subtract: ['$sellingPrice', '$costPrice'] },
                      0
                    ]
                  }
                ]
              }
            },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();
    const byStatus = { created: { profit: 0, count: 0 },
                       shipped: { profit: 0, count: 0 },
                       completed: { profit: 0, count: 0 } };
    for (const r of agg) {
      if (byStatus[r._id]) {
        byStatus[r._id].profit = r.profit || 0;
        byStatus[r._id].count = r.count || 0;
      }
    }
    const actualProfit    = byStatus.completed.profit;
    const potentialProfit = (byStatus.created.profit || 0) + (byStatus.shipped.profit || 0);
    out.push({
      from: b.from.toISOString(),
      to: b.to.toISOString(),
      date: b.from.toISOString(),
      dateText: b.from.toLocaleDateString('ru-RU'),
      profit: round2(actualProfit),
      potentialProfit: round2(potentialProfit),
      orders: byStatus.completed.count
    });
  }
  return out;
}

/**
 * Generic period stats.
 *   from, to  – Date instances
 * Returns { range, totals, profitByDay, topProducts, bestDay, comparison? }
 */
async function periodStats(userId, from, to) {
  const stats = await computeStats(userId, from, to);
  const profitByDay = await profitByBuckets(userId, from, to);

  let bestBucket = null;
  profitByDay.forEach((d) => {
    if (!bestBucket || d.profit > bestBucket.profit) bestBucket = d;
  });
  if (bestBucket) {
    bestBucket.date = bestBucket.from;
    bestBucket.dateText = new Date(bestBucket.from).toLocaleDateString('ru-RU');
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    ...stats,
    profitByDay,
    bestDay: bestBucket
  };
}

/**
 * Period stats with comparison vs the previous, equally-sized window.
 */
async function periodStatsWithComparison(userId, from, to) {
  const current = await periodStats(userId, from, to);
  const ms = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - ms);
  const prev = await computeStats(userId, prevFrom, prevTo);

  const delta = (a, b) => {
    if (!b) return null;
    const diff = a - b;
    const pct = b === 0 ? null : (diff / b) * 100;
    return { abs: round2(diff), pct: pct === null ? null : round2(pct) };
  };

  const comparison = {
    range: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
    totals: {
      all: delta(current.totals.all, prev.totals.all),
      completed: delta(current.totals.completed, prev.totals.completed),
      returned: delta(current.totals.returned, prev.totals.returned),
      revenue: delta(current.totals.revenue, prev.totals.revenue),
      profit:  delta(current.totals.profit,  prev.totals.profit)
    }
  };

  return { ...current, comparison };
}

async function weekStats(userId) {
  const from = startOfWeek(new Date());
  const to = endOfWeek(new Date());
  return periodStatsWithComparison(userId, from, to);
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  statusLabel,
  createOrder,
  listOrders,
  getOrder,
  updateStatus,
  updateOrder,
  deleteOrder,
  weekStats,
  periodStats,
  periodStatsWithComparison
};
