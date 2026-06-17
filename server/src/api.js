'use strict';

const express = require('express');
const path = require('path');
const cors = require('cors');

const { authMiddleware } = require('./auth');
const orders = require('./orders');
const { buildAdvice } = require('./advice');
const { fmtMoney, formatDateTimeRu, formatDateRu } = require('./utils');
const ws = require('./ws');

function serializeOrder(o) {
  if (!o) return null;
  return {
    orderId: o.orderId,
    userId: o.userId,
    productName: o.productName,
    costPrice: o.costPrice,
    sellingPrice: o.sellingPrice,
    status: o.status,
    statusLabel: orders.statusLabel(o.status),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    completedAt: o.completedAt,
    profit: o.profit,
    category: o.category,
    comment: o.comment,
    createdAtText: formatDateTimeRu(o.createdAt),
    updatedAtText: formatDateTimeRu(o.updatedAt),
    completedAtText: o.completedAt ? formatDateTimeRu(o.completedAt) : null
  };
}

function buildApi(botToken) {
  const api = express.Router();
  api.use(express.json({ limit: '256kb' }));

  // Temporary request logger — logs every /api call with auth header presence
  if (process.env.AUTH_DEBUG) {
    api.use((req, _res, next) => {
      const initData = req.header('x-tg-init-data') || '';
      console.log(`[req] ${req.method} ${req.path} | initData len=${initData.length} | first60=${initData.slice(0, 60)}`);
      next();
    });
  }

  api.use(authMiddleware(botToken));

  // ---- Dashboard ----
  api.get('/dashboard', async (req, res) => {
    const userId = req.tgUser.id;
    const [stats, allOrders] = await Promise.all([
      orders.weekStats(userId),
      orders.listOrders(userId, { limit: 50 })
    ]);
    res.json({
      week: {
        ...stats.totals,
        profit: stats.totals.profit,
        bestDay: stats.bestDay
          ? {
              date: stats.bestDay.date,
              profit: stats.bestDay.profit,
              dateText: formatDateRu(stats.bestDay.date)
            }
          : null,
        topProducts: stats.topProducts,
        profitByDay: stats.profitByDay
      },
      recent: allOrders.slice(0, 10).map(serializeOrder)
    });
  });

  // ---- Orders ----
  api.get('/orders', async (req, res) => {
    const userId = req.tgUser.id;
    const items = await orders.listOrders(userId, {
      status: req.query.status,
      search: req.query.search
    });
    res.json({ items: items.map(serializeOrder) });
  });

  api.post('/orders', async (req, res) => {
    const userId = req.tgUser.id;
    const { productName, costPrice, sellingPrice, createdAt } = req.body || {};
    if (!productName || !String(productName).trim()) {
      return res.status(400).json({ error: 'productName required' });
    }
    const cp = Number(costPrice);
    const sp = Number(sellingPrice);
    if (!Number.isFinite(cp) || cp < 0) {
      return res.status(400).json({ error: 'costPrice invalid' });
    }
    if (!Number.isFinite(sp) || sp < 0) {
      return res.status(400).json({ error: 'sellingPrice invalid' });
    }
    const doc = await orders.createOrder(userId, {
      productName, costPrice: cp, sellingPrice: sp, createdAt
    });
    const payload = serializeOrder(doc);
    ws.broadcast(userId, { type: 'order:new', order: payload });
    if (global.botNotify) {
      global.botNotify(userId, `Заказ #${doc.orderId} создан`);
    }
    res.json(payload);
  });

  api.get('/orders/:id', async (req, res) => {
    const userId = req.tgUser.id;
    const o = await orders.getOrder(userId, req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    res.json(serializeOrder(o));
  });

  api.patch('/orders/:id', async (req, res) => {
    const userId = req.tgUser.id;
    const o = await orders.updateOrder(userId, req.params.id, req.body || {});
    if (!o) return res.status(404).json({ error: 'not found' });
    res.json(serializeOrder(o));
  });

  api.post('/orders/:id/status', async (req, res) => {
    const userId = req.tgUser.id;
    const newStatus = (req.body && req.body.status) || '';
    try {
      const o = await orders.updateStatus(userId, req.params.id, newStatus);
      if (!o) return res.status(404).json({ error: 'not found' });
      const payload = serializeOrder(o);
      ws.broadcast(userId, { type: 'order:update', order: payload });
      if (global.botNotify) {
        const profitText =
          o.status === 'completed'
            ? `. Прибыль: ${fmtMoney(o.profit)}`
            : '';
        global.botNotify(
          userId,
          `Заказ #${o.orderId} переведён в статус «${orders.statusLabel(o.status)}»${profitText}`
        );
      }
      res.json(payload);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  api.delete('/orders/:id', async (req, res) => {
    const userId = req.tgUser.id;
    const r = await orders.deleteOrder(userId, req.params.id);
    if (!r.deletedCount) return res.status(404).json({ error: 'not found' });
    ws.broadcast(userId, { type: 'order:delete', orderId: Number(req.params.id) });
    res.json({ ok: true });
  });

  // ---- Weekly / period report ----
  api.get('/report/week', async (req, res) => {
    const userId = req.tgUser.id;
    const stats = await orders.weekStats(userId);
    res.json({
      ...stats,
      fromText: formatDateRu(stats.range.from),
      toText: formatDateRu(new Date(new Date(stats.range.to).getTime() - 1))
    });
  });

  api.get('/report/period', async (req, res) => {
    const userId = req.tgUser.id;
    const parse = (s) => {
      if (!s) return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    let from = parse(req.query.from);
    let to   = parse(req.query.to);

    if (!from || !to || to <= from) {
      // default to current week
      const wkFrom = new Date();
      wkFrom.setHours(0, 0, 0, 0);
      const day = (wkFrom.getDay() + 6) % 7;
      wkFrom.setDate(wkFrom.getDate() - day);
      const wkTo = new Date(wkFrom);
      wkTo.setDate(wkTo.getDate() + 7);
      from = wkFrom;
      to = wkTo;
    } else {
      // normalise: start of "from" day, exclusive end-of-day for "to"
      from = new Date(from); from.setHours(0, 0, 0, 0);
      to   = new Date(to);   to.setHours(23, 59, 59, 999);
      to   = new Date(to.getTime() + 1); // make exclusive
    }

    const stats = await orders.periodStatsWithComparison(userId, from, to);
    res.json({
      ...stats,
      fromText: formatDateRu(stats.range.from),
      toText:   formatDateRu(new Date(new Date(stats.range.to).getTime() - 1))
    });
  });

  // ---- Advice ----
  api.get('/advice', async (req, res) => {
    const userId = req.tgUser.id;
    const a = await buildAdvice(userId);
    res.json(a);
  });

  return api;
}

function buildApp(botToken, webappDir) {
  const app = express();
  app.use(cors());

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use('/api', buildApi(botToken));

  // Serve the built React app (webapp/dist) if present, otherwise
  // fall back to the source directory (useful for `vite dev`).
  const fs = require('fs');
  const distDir = path.join(webappDir, 'dist');
  const serveDir = fs.existsSync(path.join(distDir, 'index.html')) ? distDir : webappDir;

  app.use(express.static(serveDir));

  // SPA fallback: any non-API route returns index.html so the
  // Mini App can handle client-side routing.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(serveDir, 'index.html'));
  });

  return app;
}

module.exports = { buildApp, buildApi };
