'use strict';

const cron = require('node-cron');

let bot = null;
let webappUrl = '';
const subscribed = new Set(); // userId subscribed to weekly reports

function buildKeyboard(startParam) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '\u200d', // zero-width
            ...(startParam
              ? {}
              : {})
          }
        ]
      ]
    }
  };
}

function appUrlWithStart(startParam) {
  if (!webappUrl) return '';
  const sep = webappUrl.includes('?') ? '&' : '?';
  return `${webappUrl}${sep}tgStartParam=${encodeURIComponent(startParam)}`;
}

/**
 * Build an inline button that opens the Mini App inside Telegram
 * (rather than launching the external browser). Telegram supports
 * `web_app` button type only for inline keyboards.
 */
function webAppButton(text, startParam) {
  return { text, web_app: { url: appUrlWithStart(startParam) } };
}

async function start(token, url) {
  if (!token || token.includes('REPLACE') || token.length < 20) {
    console.warn('[bot] BOT_TOKEN is not configured — bot disabled. Set BOT_TOKEN in .env to enable.');
    return null;
  }
  const TelegramBot = require('node-telegram-bot-api');
  webappUrl = url;

  bot = new TelegramBot(token, { polling: true });

  const allowed = (process.env.ALLOWED_USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  const isAllowed = (id) => !allowed.length || allowed.includes(Number(id));

  bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(msg.from.id)) {
      return bot.sendMessage(chatId, 'Доступ запрещён.');
    }
    const startParam = match[1] || 'home';
    if (!webappUrl) {
      return bot.sendMessage(chatId, 'Mini App URL не настроен (WEBAPP_URL).');
    }
    return bot.sendMessage(chatId, 'Открываю мини-приложение…', {
      reply_markup: { inline_keyboard: [[webAppButton('📊 Открыть Mini App', startParam)]] }
    });
  });

  // All other section commands answer with the button only — no
  // informational text. The user just taps the button and the Mini App
  // opens in Telegram.
  const openWithSection = (section) => async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(msg.from.id)) {
      return bot.sendMessage(chatId, 'Доступ запрещён.');
    }
    if (!webappUrl) {
      return bot.sendMessage(chatId, 'Mini App URL не настроен (WEBAPP_URL).');
    }
    return bot.sendMessage(chatId, '\u200b', {
      reply_markup: { inline_keyboard: [[webAppButton('📱 Открыть', section)]] }
    });
  };

  bot.onText(/^\/week$/, openWithSection('report'));
  bot.onText(/^\/orders$/, openWithSection('orders'));
  bot.onText(/^\/advice$/, openWithSection('advice'));

  // /subscribe and /unsubscribe silently toggle the weekly report
  // subscription. We keep them working but send no chat message — the
  // toggle can be confirmed next time a weekly report arrives (or not).
  bot.onText(/^\/subscribe$/, (msg) => {
    subscribed.add(msg.from.id);
  });

  bot.onText(/^\/unsubscribe$/, (msg) => {
    subscribed.delete(msg.from.id);
  });

  // weekly cron: every Sunday 20:00 send a short report
  cron.schedule('0 20 * * 0', async () => {
    if (!bot) return;
    const { buildAdvice } = require('./advice');
    const { getDb } = require('./db');
    const ordersSvc = require('./orders');
    const { fmtMoney } = require('./utils');
    const db = getDb();
    const users = await db.collection('users').find({}).toArray();
    for (const u of users) {
      if (!subscribed.has(u.userId)) continue;
      try {
        const stats = await ordersSvc.weekStats(u.userId);
        const text =
          `📊 *Сводка за неделю*\n\n` +
          `Заказов: ${stats.totals.all}\n` +
          `Выкуплено: ${stats.totals.completed}\n` +
          `Возвратов: ${stats.totals.returned}\n` +
          `В доставке: ${stats.totals.shipped}\n` +
          `Выручка: ${fmtMoney(stats.totals.revenue)}\n` +
          `Прибыль: ${fmtMoney(stats.totals.profit)}`;
        const url = appUrlWithStart('report');
        await bot.sendMessage(u.userId, text, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[webAppButton('📈 Открыть отчёт', 'report')]] }
        });
      } catch (e) {
        console.warn('[bot] weekly send failed:', e.message);
      }
    }
  });

  bot.on('polling_error', (e) => console.warn('[bot] polling_error:', e.message));
  console.log('[bot] Telegram bot started');
  return bot;
}

function sectionLabel(s) {
  return (
    {
      home: 'Главная',
      report: 'Отчёт за неделю',
      orders: 'Заказы',
      advice: 'Советы'
    }[s] || s
  );
}

function notify(userId, text) {
  if (global.botNotify) global.botNotify(userId, text);
}

module.exports = { start, notify };
