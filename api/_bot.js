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
      out.push({ chatId: me.chatId, name: me.name, text, diff, svc });
    }
  }
  return { out, missing };
}

const kt = (k) => (k === '?' ? 'ще обираємо' : k);
// Що змінилося між двома версіями сет-листа (масиви елементів після cleanItems)
function diffSetlist(prev, next, titleOf) {
  const songs = (a) => a.filter((x) => x.t === 'song');
  const p = songs(prev), n = songs(next);
  const pm = new Map(p.map((x) => [x.id, x])), nm = new Map(n.map((x) => [x.id, x]));
  const lines = [];
  for (const x of n) if (!pm.has(x.id)) lines.push(`➕ ${titleOf(x.id)}${x.k ? ` (${kt(x.k)})` : ''}`);
  for (const x of p) if (!nm.has(x.id)) lines.push(`➖ ${titleOf(x.id)}`);
  for (const x of n) {
    const o = pm.get(x.id);
    if (!o) continue;
    if ((o.k || '') !== (x.k || '')) lines.push(`🎼 ${titleOf(x.id)}: тональність ${kt(o.k) || '—'} → ${kt(x.k) || '—'}`);
    if ((o.v || '') !== (x.v || '')) lines.push(`🎤 ${titleOf(x.id)}: вокаліст ${o.v || '—'} → ${x.v || '—'}`);
  }
  const common = (a, m) => a.filter((x) => m.has(x.id)).map((x) => x.id).join();
  if (common(p, nm) !== common(n, pm)) lines.push('↕️ Змінився порядок пісень');
  const extra = (a) => a.filter((x) => x.t !== 'song').map((x) => `${x.t === 'mom' ? '◦' : '💬'} ${x.x}`);
  const pe = extra(prev), ne = extra(next);
  for (const x of ne) if (!pe.includes(x)) lines.push(`➕ ${x}`);
  for (const x of pe) if (!ne.includes(x)) lines.push(`➖ ${x}`);
  if (!lines.length && pe.join('|') !== ne.join('|')) lines.push('↕️ Змінився порядок пунктів');
  return lines;
}

// Повідомлення учасникам про публікацію сет-листа. prev = попередній опублікований (або null)
function publishMessage(svc, prev, next, titleOf, now = new Date()) {
  const nextJson = JSON.stringify(next);
  if (prev && JSON.stringify(prev) === nextJson) return null;
  if (svc.date && svc.date < todayKyiv(now)) return null;
  const when = `${svc.date ? fmtDate(svc.date) : ''}${svc.type || svc.name ? ` — ${svc.type || svc.name}` : ''}`.trim();
  const songs = next.filter((x) => x.t === 'song');
  if (!prev) {
    let n = 0;
    const list = next.map((x) => (x.t === 'mom' ? `◦ ${x.x}` : x.t === 'note' ? `   💬 ${x.x}` : `${++n}. ${titleOf(x.id)}${x.k ? ` (${kt(x.k)})` : ''}${x.v ? ` — ${x.v}` : ''}`)).join('\n');
    return `🎶 Опубліковано сет-лист\n📅 ${when}\n\n${list || 'Без пісень'}`;
  }
  const d = diffSetlist(prev, next, titleOf);
  return `🔄 Апдейт в сетлисті\n📅 ${when}\n\n${d.join('\n') || 'Дрібні зміни'}`;
}

// Розсилка всім залученим до служіння; кожен результат пишемо в журнал, про невдалі (і відсутній chat_id) — адмінам
async function notifyPublished(svc, people, text, kind = 'Публікація') {
  const ids = memberIds(svc).filter((id) => people.get(id) && people.get(id).name && people.get(id).active !== false);
  const entries = [];
  await Promise.all(ids.map(async (id) => {
    const me = people.get(id);
    const e = { name: me.name, kind, svc: svc.name || svc.type || '', date: svc.date || '', result: 'Надіслано', error: '' };
    if (!me.chatId) { e.result = 'Немає chat_id'; }
    else {
      try {
        const r = await send(me.chatId, text, webButton('Переглянути'));
        if (!r.ok) { e.result = 'Помилка'; e.error = r.description || 'помилка Telegram'; }
      } catch (err) { e.result = 'Помилка'; e.error = String(err.message || err).slice(0, 200); }
    }
    entries.push(e);
  }));
  const failed = entries.filter((e) => e.result !== 'Надіслано').map((e) => `${e.name} (${e.error || 'немає chat_id'})`);
  if (failed.length) {
    const msg = `⚠️ Сет-лист ${svc.date ? fmtDate(svc.date) : ''}: не вдалося сповістити: ${failed.join(', ')}`;
    for (const a of L.adminIds()) await send(a, msg);
  }
  await L.logDelivery(entries);
  return { sent: entries.length - failed.length, failed };
}

const nextService = (services, today) => services.filter((s) => s.date && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;

const webButton = (label) => (process.env.MINIAPP_LINK ? { reply_markup: { inline_keyboard: [[{ text: label || process.env.MINIAPP_BUTTON || 'Відкрити застосунок', url: process.env.MINIAPP_LINK }]] } } : {});

module.exports = { tg, send, todayKyiv, daysBetween, fmtDate, daysWord, memberIds, rolesOf, remindersFor, diffSetlist, publishMessage, notifyPublished, nextService, webButton, REMINDER_DAYS };
