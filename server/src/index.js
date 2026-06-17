'use strict';

require('dotenv').config();

const http = require('http');
const path = require('path');

const { connect } = require('./db');
const { buildApp } = require('./api');
const ws = require('./ws');
const bot = require('./bot');

async function main() {
  const webappDir = path.join(__dirname, '..', '..', 'webapp');
  await connect();

  const token = process.env.BOT_TOKEN || '';
  const webappUrl = process.env.WEBAPP_URL || `http://localhost:${process.env.PORT || 3000}`;

  const app = buildApp(token, webappDir);
  const server = http.createServer(app);
  ws.attach(server);
  bot.start(token, webappUrl);

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
    console.log(`[server] Mini App: ${webappUrl}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
