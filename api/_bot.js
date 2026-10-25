'use strict';
const L = require('./_lib');

const TZ = 'Europe/Kyiv';
const REMINDER_DAYS = [5, 2];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

const tg = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.error(`tg ${method}`, body.chat_id, j.description);
  return j;
};
const send = (chatId, text, extra = {}) => tg('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...extra });

// Сьогоднішня дата за київським часом (YYYY-MM-DD)
const todayKyiv = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(now);
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400e3);
const fmtDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const daysWord = (n) => (n === 1 ? 'день' : n >= 2 && n <= 4 ? 'дні' : 'днів');

const memberIds = (svc) => [...new Set([...svc.leadIds, ...svc.roles.flatMap((r) => r.ids)])];
const rolesOf = (svc, id) => [...(svc.leadIds.includes(id) ? ['Лід-вокал'] : []), ...svc.roles.filter((r) => r.ids.includes(id)).map((r) => r.role)];

// Нагадування: для кожного служіння, до якого лишилось 5 або 2 дні, кожному учаснику
function remindersFor(services, people, today) {
  const out = [], missing = [];
  for (const svc of services) {
    if (!svc.date) continue;
    const diff = daysBetween(today, svc.date);
    if (!REMINDER_DAYS.includes(diff)) continue;
    const ids = memberIds(svc).filter((id) => people.get(id) && people.get(id).name && people.get(id).active !== false);
    if (!ids.length) continue;
    for (const id of ids) {
      const me = people.get(id);
      if (!me.chatId) { missing.push({ name: me.name, svc }); continue; }
      const others = ids.filter((i) => i !== id).map((i) => people.get(i).name);
      const roles = rolesOf(svc, id);
      const text = `👋 ${me.name}, нагадування!\n\n📅 Через ${diff} ${daysWord(diff)} (${fmtDate(svc.date)}) — ${svc.type || svc.name || 'Служіння'}`
        + (roles.length ? `\n🎸 Твоя роль: ${roles.join(', ')}` : '') + (others.length ? `\n👥 Разом: ${others.join(', ')}` : '');
      out.push({ chatId: me.chatId, text, diff, svc });
    }
  }
  return { out, missing };
}

const nextService = (services, today) => services.filter((s) => s.date && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;

const webButton = () => (process.env.MINIAPP_LINK ? { reply_markup: { inline_keyboard: [[{ text: process.env.MINIAPP_BUTTON || 'Відкрити застосунок', url: process.env.MINIAPP_LINK }]] } } : {});

module.exports = { tg, send, todayKyiv, daysBetween, fmtDate, daysWord, memberIds, rolesOf, remindersFor, nextService, webButton, REMINDER_DAYS };
