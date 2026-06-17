'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON-file "database" used when DB_MODE=file.
 *
 * Exposes the same surface as the real `db.js` module:
 *   connect(), getDb(), close()
 *
 * The "db" object passed to consumers is a thin facade with the
 * collection helpers they actually use:
 *   db.collection('orders').find / .findOne / .insertOne / .updateOne
 *     / .deleteOne / .countDocuments / .aggregate
 *   db.collection('users').findOneAndUpdate / .find
 *
 * This is intentionally minimal — it supports everything our
 * service layer needs and persists to disk.
 */

let filePath = null;
let collections = { orders: [], users: [] };

function load() {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      collections.orders = Array.isArray(parsed.orders) ? parsed.orders : [];
      collections.users  = Array.isArray(parsed.users)  ? parsed.users  : [];
    }
  } catch (e) {
    console.warn('[db:file] failed to load, starting empty:', e.message);
    collections = { orders: [], users: [] };
  }
}

function save() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(collections, null, 2));
}

// ---- Mongo-ish query helpers ----------------------------------------------

function matches(doc, filter) {
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === '$or') {
      if (!v.some((sub) => matches(doc, sub))) return false;
      continue;
    }
    if (k === '$gte') {
      if (!(new Date(doc) >= new Date(v))) return false;
      continue;
    }
    if (k === '$lt') {
      if (!(new Date(doc) < new Date(v))) return false;
      continue;
    }
    if (k === '$lte') {
      if (!(new Date(doc) <= new Date(v))) return false;
      continue;
    }
    if (k === '$in') {
      if (!v.includes(doc && doc[k])) return false;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      // nested operators: { $gte: ..., $lt: ... } on a date field
      const fieldVal = doc ? doc[k] : undefined;
      for (const [op, ov] of Object.entries(v)) {
        if (op === '$gte' && !(new Date(fieldVal) >= new Date(ov))) return false;
        else if (op === '$lt'  && !(new Date(fieldVal) <  new Date(ov))) return false;
        else if (op === '$lte' && !(new Date(fieldVal) <= new Date(ov))) return false;
        else if (op === '$in'  && !ov.includes(fieldVal)) return false;
      }
      continue;
    }
    if (doc == null || doc[k] !== v) return false;
  }
  return true;
}

function applyPipeline(docs, pipeline) {
  // Very small subset of Mongo aggregation pipeline: $match, $group, $sort,
  // $limit, $project-ish via accumulators ($sum, $avg, $push, $divide).
  let out = docs;
  for (const stage of pipeline) {
    const keys = Object.keys(stage);
    const op = keys[0];
    const expr = stage[op];

    if (op === '$match') {
      out = out.filter((d) => matches(d, expr));
    } else if (op === '$sort') {
      const entries = Object.entries(expr);
      out = [...out].sort((a, b) => {
        for (const [k, dir] of entries) {
          if (a[k] < b[k]) return dir > 0 ? -1 : 1;
          if (a[k] > b[k]) return dir > 0 ?  1 : -1;
        }
        return 0;
      });
    } else if (op === '$limit') {
      out = out.slice(0, expr);
    } else if (op === '$group') {
      const groups = new Map();
      for (const d of out) {
        const keyVal = expr._id === null ? null : resolveExpr(expr._id, d);
        const key = JSON.stringify(keyVal);
        if (!groups.has(key)) {
          const g = { _id: keyVal };
          for (const [gk, gexpr] of Object.entries(expr)) {
            if (gk === '_id') continue;
            if (gexpr && gexpr.$sum !== undefined) g[gk] = 0;
            else if (gexpr && gexpr.$avg !== undefined) g[gk + '__avgSum'] = 0;
            else if (gexpr && gexpr.$push !== undefined) g[gk] = [];
            else g[gk] = resolveExpr(gexpr, d);
          }
          groups.set(key, { doc: g, count: 0 });
        }
        const entry = groups.get(key);
        entry.count += 1;
        for (const [gk, gexpr] of Object.entries(expr)) {
          if (gk === '_id') continue;
          if (gexpr && gexpr.$sum !== undefined) {
            entry.doc[gk] += Number(resolveExpr(gexpr.$sum, d)) || 0;
          } else if (gexpr && gexpr.$avg !== undefined) {
            const v = Number(resolveExpr(gexpr.$avg, d)) || 0;
            entry.doc[gk + '__avgSum'] += v;
            entry.doc[gk + '__avgCnt'] = (entry.doc[gk + '__avgCnt'] || 0) + 1;
          } else if (gexpr && gexpr.$push !== undefined) {
            entry.doc[gk].push(resolveExpr(gexpr.$push, d));
          } else {
            entry.doc[gk] = resolveExpr(gexpr, d);
          }
        }
      }
      out = [...groups.values()].map((g) => {
        const final = { ...g.doc };
        for (const k of Object.keys(final)) {
          if (k.endsWith('__avgSum')) {
            const name = k.replace('__avgSum', '');
            const cnt = final[name + '__avgCnt'] || 1;
            final[name] = cnt ? final[k] / cnt : 0;
            delete final[k];
            delete final[name + '__avgCnt'];
          }
        }
        return final;
      });
    }
  }
  return out;
}

function resolveExpr(expr, doc) {
  if (expr == null) return null;
  if (typeof expr !== 'string') return expr;
  // "$field" → doc[field]
  if (expr.startsWith('$')) return doc ? doc[expr.slice(1)] : undefined;
  return expr;
}

// ---- collection facade ---------------------------------------------------

function makeCollection(name) {
  return {
    _name: name,
    find(filter = {}, opts = {}) {
      return makeCursor(name, filter, opts);
    },
    async findOne(filter) {
      return collections[name].find((d) => matches(d, filter)) || null;
    },
    async findOneAndUpdate(filter, update, opts = {}) {
      const idx = collections[name].findIndex((d) => matches(d, filter));
      let doc;
      if (idx === -1) {
        if (opts.upsert) {
          const newDoc = {};
          for (const [k, v] of Object.entries(filter)) {
            if (!k.startsWith('$')) newDoc[k] = v;
          }
          for (const [k, v] of Object.entries(update.$set || update)) {
            if (k !== '$inc' && k !== '$set') continue;
          }
          if (update.$set) Object.assign(newDoc, update.$set);
          if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) {
            newDoc[k] = (newDoc[k] || 0) + v;
          }
          collections[name].push(newDoc);
          save();
          return newDoc;
        }
        return null;
      }
      doc = collections[name][idx];
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
      save();
      return doc;
    },
    async insertOne(doc) {
      const d = { ...doc };
      collections[name].push(d);
      save();
      return { insertedId: null, ...d };
    },
    async updateOne(filter, update) {
      const idx = collections[name].findIndex((d) => matches(d, filter));
      if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
      const doc = collections[name][idx];
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
      save();
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      const idx = collections[name].findIndex((d) => matches(d, filter));
      if (idx === -1) return { deletedCount: 0 };
      collections[name].splice(idx, 1);
      save();
      return { deletedCount: 1 };
    },
    async countDocuments(filter = {}) {
      return collections[name].filter((d) => matches(d, filter)).length;
    },
    aggregate(pipeline) {
      return {
        toArray: async () => applyPipeline(collections[name], pipeline)
      };
    }
  };
}

function makeCursor(name, filter, opts) {
  const cursor = {
    sort: (s) => makeCursor(name, filter, { ...opts, sort: s }),
    limit: (n) => makeCursor(name, filter, { ...opts, limit: n }),
    toArray: async () => {
      let docs = collections[name].filter((d) => matches(d, filter));
      if (opts.sort) {
        const entries = Object.entries(opts.sort);
        docs = [...docs].sort((a, b) => {
          for (const [k, dir] of entries) {
            const av = a[k], bv = b[k];
            if (av < bv) return dir > 0 ? -1 : 1;
            if (av > bv) return dir > 0 ?  1 : -1;
          }
          return 0;
        });
      }
      if (opts.limit) docs = docs.slice(0, opts.limit);
      return docs;
    },
    then(resolve, reject) {
      return cursor.toArray().then(resolve, reject);
    }
  };
  return cursor;
}

// ---- module surface ------------------------------------------------------

async function connect() {
  const dir = process.env.FILE_DB_DIR || path.join(process.cwd(), 'data');
  filePath = path.join(dir, 'stats_bot.json');
  load();
  console.log('[db:file] using', filePath);
  return getDb();
}

function getDb() {
  return {
    collection: (name) => {
      if (!collections[name]) collections[name] = [];
      return makeCollection(name);
    }
  };
}

async function close() {
  save();
}

module.exports = { connect, getDb, close };
