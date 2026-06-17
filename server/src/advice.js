'use strict';

const { getDb } = require('./db');
const { startOfWeek, endOfWeek, round2 } = require('./utils');

const DAY = 86400000;

async function buildAdvice(userId) {
  const db = getDb();
  const now = new Date();
  const wkFrom = startOfWeek(now);
  const wkTo = endOfWeek(now);

  // previous week range
  const prevFrom = new Date(wkFrom.getTime() - 7 * DAY);
  const prevTo = wkFrom;

  const baseMatch = { userId, createdAt: { $gte: wkFrom, $lt: wkTo } };

  const all = await db.collection('orders').countDocuments(baseMatch);
  const completed = await db.collection('orders').countDocuments({
    ...baseMatch,
    status: 'completed'
  });
  const returned = await db.collection('orders').countDocuments({
    ...baseMatch,
    status: 'returned'
  });
  const shipped = await db.collection('orders').countDocuments({
    ...baseMatch,
    status: 'shipped'
  });

  // returns % = returns / total orders in the period
  const returnRate = all > 0 ? (returned / all) * 100 : 0;

  const tips = [];

  if (all >= 5 && returnRate > 15) {
    tips.push({
      level: 'warn',
      icon: '\u26a0\ufe0f',
      text: `Доля возвратов ${returnRate.toFixed(1)}% (>15% от всех заказов). Проверьте качество товара, фото и описания.`
    });
  } else if (all > 0 && returnRate > 0) {
    tips.push({
      level: 'ok',
      icon: '\u2705',
      text: `Доля возвратов ${returnRate.toFixed(1)}% — в пределах нормы.`
    });
  } else {
    tips.push({
      level: 'info',
      icon: '\u2139\ufe0f',
      text: 'Пока недостаточно данных по выкупам, чтобы оценить возвраты.'
    });
  }

  // margin
  const marginAgg = await db
    .collection('orders')
    .aggregate([
      { $match: { userId, status: 'completed', completedAt: { $gte: wkFrom, $lt: wkTo } } },
      {
        $group: {
          _id: null,
          avgMargin: { $avg: { $divide: ['$profit', '$sellingPrice'] } },
          items: {
            $push: {
              productName: '$productName',
              sellingPrice: '$sellingPrice',
              profit: '$profit',
              margin: { $divide: ['$profit', '$sellingPrice'] }
            }
          }
        }
      }
    ])
    .toArray();

  const avgMargin = marginAgg[0]?.avgMargin || 0;
  const items = marginAgg[0]?.items || [];

  for (const it of items) {
    if (avgMargin > 0 && it.margin < avgMargin * 0.7) {
      tips.push({
        level: 'warn',
        icon: '\u26a0\ufe0f',
        text: `Маржа товара «${it.productName}» (${(it.margin * 100).toFixed(1)}%) ниже средней (${(avgMargin * 100).toFixed(1)}%). Подумайте о повышении цены или смене поставщика.`
      });
      break; // one product-related tip is enough
    }
  }

  // shipped > 5 days
  const oldShipped = await db
    .collection('orders')
    .countDocuments({
      userId,
      status: 'shipped',
      updatedAt: { $lt: new Date(now.getTime() - 5 * DAY) }
    });

  if (oldShipped > 0) {
    tips.push({
      level: 'warn',
      icon: '\u26a0\ufe0f',
      text: `${oldShipped} заказ(ов) в доставке более 5 дней — проверьте их статус у покупателей.`
    });
  }

  // top product
  const top = await db
    .collection('orders')
    .aggregate([
      { $match: { userId, status: 'completed', completedAt: { $gte: wkFrom, $lt: wkTo } } },
      {
        $group: {
          _id: '$productName',
          profit: { $sum: '$profit' },
          qty: { $sum: 1 }
        }
      },
      { $sort: { profit: -1 } },
      { $limit: 1 }
    ])
    .toArray();

  if (top[0]) {
    tips.push({
      level: 'ok',
      icon: '\u2705',
      text: `Лучший товар недели — «${top[0]._id}»: прибыль ${round2(top[0].profit)} \u20bd, ${top[0].qty} шт. Сделайте на него акцент в рекламе.`
    });
  }

  // sales vs previous week
  const thisWeekCompleted = await db.collection('orders').countDocuments({
    userId,
    status: 'completed',
    createdAt: { $gte: wkFrom, $lt: wkTo }
  });
  const prevAll = await db.collection('orders').countDocuments({
    userId, createdAt: { $gte: prevFrom, $lt: prevTo }
  });
  const prevCompleted = await db.collection('orders').countDocuments({
    userId, status: 'completed', createdAt: { $gte: prevFrom, $lt: prevTo }
  });
  const prevReturned = await db.collection('orders').countDocuments({
    userId, status: 'returned', createdAt: { $gte: prevFrom, $lt: prevTo }
  });
  const prevShipped = await db.collection('orders').countDocuments({
    userId, status: 'shipped', createdAt: { $gte: prevFrom, $lt: prevTo }
  });
  const prevWeekCompleted = prevCompleted;

  if (prevWeekCompleted > 0) {
    const delta = ((thisWeekCompleted - prevWeekCompleted) / prevWeekCompleted) * 100;
    if (delta <= -20) {
      tips.push({
        level: 'bad',
        icon: '\u274c',
        text: `Продажи упали на ${Math.abs(delta).toFixed(1)}% по сравнению с прошлой неделей. Проверьте цены и конкурентов.`
      });
    } else if (delta >= 20) {
      tips.push({
        level: 'ok',
        icon: '\u2705',
        text: `Продажи выросли на ${delta.toFixed(1)}% по сравнению с прошлой неделей. Отличная динамика!`
      });
    }
  }

  // period metadata
  const range = { from: wkFrom.toISOString(), to: wkTo.toISOString() };
  const prevRange = { from: prevFrom.toISOString(), to: prevTo.toISOString() };

  return {
    summary: {
      all, completed, returned, shipped,
      returnRate: round2(returnRate),
      range, prevRange,
      prev: { all: prevAll, completed: prevCompleted, returned: prevReturned, shipped: prevShipped }
    },
    tips
  };
}

module.exports = { buildAdvice };
