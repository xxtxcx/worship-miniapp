'use strict';
const L = require('./_lib');

const TG = () => `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Аватарка людини за її Telegram ID. Файл Telegram містить токен бота в URL, тому віддаємо його через проксі.
async function fetchAvatar(chatId) {
  const r = await (await fetch(`${TG()}/getUserProfilePhotos?user_id=${encodeURIComponent(chatId)}&limit=1`)).json();
  const sizes = r.ok && r.result.photos && r.result.photos[0];
  if (!sizes || !sizes.length) return null;
  const pick = sizes.find((s) => s.width >= 160) || sizes[sizes.length - 1];
  const f = await (await fetch(`${TG()}/getFile?file_id=${encodeURIComponent(pick.file_id)}`)).json();
  if (!f.ok) return null;
  const img = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${f.result.file_path}`);
  if (!img.ok) return null;
  return Buffer.from(await img.arrayBuffer());
}

module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const id = L.nid(String(req.query.id || ''));
    const person = ctx.people.get(id);
    if (!person || !/^\d+$/.test(person.chatId)) return res.status(404).json({ error: 'no_avatar' });
    const buf = await L.cached(`ava:${id}`, 6 * 3600e3, () => fetchAvatar(person.chatId));
    if (!buf) return res.status(404).json({ error: 'no_avatar' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
