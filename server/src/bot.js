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
    const url = appUrlWithStart(startParam);
    if (!url) {
      return bot.sendMessage(chatId, 'Mini App URL не настроен (WEBAPP_URL).');
    }
    return bot.sendMessage(chatId, 'Открываю мини-приложение…', {
      reply_markup: { inline_keyboard: [[{ text: '📊 Открыть Mini App', url }]] }
    });
  });

  const openWithSection = (section) => async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(msg.from.id)) {
      return bot.sendMessage(chatId, 'Доступ запрещён.');
    }
    const url = appUrlWithStart(section);
    if (!url) {
      return bot.sendMessage(chatId, 'Mini App URL не настроен (WEBAPP_URL).');
    }
    return bot.sendMessage(chatId, `Открываю раздел «${sectionLabel(section)}»…`, {
      reply_markup: { inline_keyboard: [[{ text: '📱 Открыть', url }]] }
    });
  };

  bot.onText(/^\/week$/, openWithSection('report'));
  bot.onText(/^\/orders$/, openWithSection('orders'));
  bot.onText(/^\/advice$/, openWithSection('advice'));

  bot.onText(/^\/subscribe$/, (msg) => {
    subscribed.add(msg.from.id);
    bot.sendMessage(msg.chat.id, '✅ Буду присылать еженедельный отчёт каждое воскресенье в 20:00.');
  });

  bot.onText(/^\/unsubscribe$/, (msg) => {
    subscribed.delete(msg.from.id);
    bot.sendMessage(msg.chat.id, 'Отключил еженедельный отчёт.');
  });

  // expose notification sender for the api
  global.botNotify = async (userId, text) => {
    if (!bot) return;
    try {
      await bot.sendMessage(userId, text);
    } catch (e) {
      console.warn('[bot] notify failed:', e.message);
    }
  };

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
          reply_markup: { inline_keyboard: [[{ text: '📈 Открыть отчёт', url }]] }
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
