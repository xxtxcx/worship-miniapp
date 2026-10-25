'use strict';
const L = require('./_lib');
const B = require('./_bot');

// Вебхук бота. Замінює Apps Script: /start, зворотний звʼязок з адміном, розсилка #список учасникам найближчого служіння.
const ID_MARK = /\[(\d{4,15})\]/;

async function handle(msg) {
  const chatId = String(msg.chat.id);
  if (msg.chat.type !== 'private') return;
  const text = msg.text || msg.caption || '';
  const admins = L.adminIds();
  const isAdmin = admins.includes(chatId);

  // #список / #дрескод: адмін відповідає цим текстом на повідомлення (або пересилає його) — копія іде всім учасникам найближчого служіння
  if (isAdmin && /#(список|дрескод)/i.test(text)) {
    const src = msg.reply_to_message ? msg.reply_to_message.message_id : (msg.forward_date ? msg.message_id : null);
    if (!src) return B.send(chatId, '⚠️ Дайте відповідь цим текстом на повідомлення, яке треба розіслати, або перешліть його сюди з текстом #список.');
    const [services, people] = await Promise.all([L.loadWindow(), L.loadPeople()]);
    const svc = B.nextService(services, B.todayKyiv());
    if (!svc) return B.send(chatId, '⚠️ Не знайдено найближчого служіння.');
    let sent = 0, missing = [];
    for (const id of B.memberIds(svc)) {
      const p = people.get(id);
      if (!p || p.active === false) continue;
      if (!p.chatId) { missing.push(p.name); continue; }
      if ((await B.tg('copyMessage', { chat_id: p.chatId, from_chat_id: chatId, message_id: src })).ok) sent++;
    }
    return B.send(chatId, `✅ Надіслано ${sent} учасникам\n📅 ${B.fmtDate(svc.date)} — ${svc.type || svc.name}` + (missing.length ? `\n⚠️ Без chat_id: ${missing.join(', ')}` : ''));
  }

  // Відповідь адміна людині: беремо chat_id з мітки [id] у повідомленні, на яке він відповів
  if (isAdmin && msg.reply_to_message) {
    const m = ID_MARK.exec(msg.reply_to_message.text || msg.reply_to_message.caption || '');
    if (!m) return B.send(chatId, '⚠️ Не знайшов отримувача: відповідайте на повідомлення з міткою [id].');
    return B.tg('copyMessage', { chat_id: m[1], from_chat_id: chatId, message_id: msg.message_id });
  }
  if (isAdmin) return;

  if (/^\/start\b/.test(text)) {
    await B.send(chatId, '👋 Привіт! Бот активний 🎸\nУвійти до застосунку можна кнопкою нижче. Якщо вас ще немає в списку — відкрийте його, і команда отримає ваш запит.', B.webButton());
    return;
  }

  // Будь-яке інше повідомлення від людини йде адміну з міткою [chat_id], щоб можна було відповісти
  const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
  const nick = msg.from.username ? ` (@${msg.from.username})` : '';
  const head = `✉️ ${name}${nick} [${chatId}]`;
  for (const a of admins) {
    if (msg.text) await B.send(a, `${head}:\n${msg.text}`);
    else await B.tg('copyMessage', { chat_id: a, from_chat_id: chatId, message_id: msg.message_id, caption: `${head}${msg.caption ? `:\n${msg.caption}` : ''}` });
  }
}

module.exports = async (req, res) => {
  try {
    const secret = process.env.BOT_WEBHOOK_SECRET;
    if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).json({ error: 'unauthorized' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const upd = req.body || {};
    if (upd.message) await handle(upd.message);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    // Завжди 200: інакше Telegram повторюватиме те саме оновлення
    res.status(200).json({ ok: false });
  }
};
