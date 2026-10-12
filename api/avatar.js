'use strict';
const L = require('./_lib');

const TG = () => `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Аватарка людини за її Telegram ID. Файл Telegram містить токен бота в URL, тому віддаємо його через проксі.
async function fetchAvatar(chatId) {
  const r = await (await fetch(`${TG()}/getUserProfilePhotos?user_id=${encodeURIComponent(chatId)}&limit=1`)).json();
  if (!r.ok) throw new Error(`getUserProfilePhotos: ${r.description}`); // помилка Telegram не кешується
  const sizes = r.result.photos && r.result.photos[0];
  if (!sizes || !sizes.length) return null; // фото немає або приховане налаштуваннями приватності
  const pick = sizes.find((s) => s.width >= 160) || sizes[sizes.length - 1];
  const f = await (await fetch(`${TG()}/getFile?file_id=${encodeURIComponent(pick.file_id)}`)).json();
  if (!f.ok) throw new Error(`getFile: ${f.description}`);
  const img = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${f.result.file_path}`);
  if (!img.ok) throw new Error(`file download ${img.status}`);
  return { buf: Buffer.from(await img.arrayBuffer()), type: 'image/jpeg' };
}

const MAX_PHOTO = 700 * 1024;
// Фото, яке адмін поклав у Notion («Фото» в базі «Люди»), має пріоритет над фото з Telegram
async function fetchManual(url) {
  const img = await fetch(url);
  if (!img.ok) throw new Error(`manual photo ${img.status}`);
  const type = (img.headers.get('content-type') || '').split(';')[0];
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  return buf.length <= MAX_PHOTO ? { buf, type } : null;
}

module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const id = L.nid(String(req.query.id || ''));
    const person = ctx.people.get(id);
    if (!person) return res.status(404).json({ error: 'no_avatar' });
    const hasTg = /^\d+$/.test(person.chatId);
    if (!person.photo && !hasTg) return res.status(404).json({ error: 'no_avatar' });
    const out = await L.cached(`ava:${id}:${person.photo ? 'm' : 't'}`, 3600e3, async () => {
      if (person.photo) { const m = await fetchManual(person.photo); if (m) return m; }
      return hasTg ? fetchAvatar(person.chatId) : null;
    });
    if (!out) return res.status(404).json({ error: 'no_avatar' });
    res.setHeader('Content-Type', out.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200).send(out.buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
