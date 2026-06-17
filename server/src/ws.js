'use strict';

const { WebSocketServer } = require('ws');

let wss = null;
const clients = new Map(); // userId -> Set<ws>

function attach(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    ws.userId = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && msg.userId) {
          ws.userId = Number(msg.userId);
          if (!clients.has(ws.userId)) clients.set(ws.userId, new Set());
          clients.get(ws.userId).add(ws);
          ws.send(JSON.stringify({ type: 'hello', userId: ws.userId }));
        }
      } catch (_) {
        // ignore
      }
    });

    ws.on('close', () => {
      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId).delete(ws);
        if (clients.get(ws.userId).size === 0) clients.delete(ws.userId);
      }
    });

    ws.send(JSON.stringify({ type: 'hello' }));
  });

  return wss;
}

function broadcast(userId, payload) {
  const set = clients.get(Number(userId));
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (_) {
        // ignore
      }
    }
  }
}

module.exports = { attach, broadcast };
