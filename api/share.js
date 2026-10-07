'use strict';
const L = require('./_lib');

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Готує повідомлення від імені бота, яке користувач може відправити в будь-який чат через Telegram.WebApp.shareMessage.
// Бот не мусить бути учасником чату. Назви пісень стають посиланнями на YouTube, під текстом кнопка відкриття застосунку.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const tgUser = L.authUser(req);
    const songs = await L.loadSongs();
    const byId = new Map(songs.map((s) => [s.id, s]));
    const items = L.cleanItems((req.body || {}).items, new Set(byId.keys()));
    if (!items.some((x) => x.t === 'song')) return res.status(400).json({ error: 'empty' });

    let n = 0;
    const text = items.map((it) => {
      if (it.t !== 'song') return escHtml(it.x);
      n++;
      const s = byId.get(it.id), k = it.k || s.our;
      const title = s.yt ? `<a href="${escHtml(L.ytUrl(s.yt))}">${escHtml(s.title)}</a>` : escHtml(s.title);
      return `${n}. ${title}${k ? ` ${escHtml(k)}` : ''}${it.v ? ` - ${escHtml(it.v)}` : ''}`;
    }).join('\n');

    const result = {
      type: 'article',
      id: `setlist-${Date.now()}`,
      title: 'Сет-лист',
      description: `${n} пісень`,
      input_message_content: { message_text: text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    };
    if (process.env.MINIAPP_LINK) {
      result.reply_markup = { inline_keyboard: [[{ text: process.env.MINIAPP_BUTTON || 'Відкрити D.Youth Worship', url: process.env.MINIAPP_LINK }]] };
    }
    const r = await (await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: tgUser.id, result, allow_user_chats: true, allow_group_chats: true, allow_bot_chats: false, allow_channel_chats: false }),
    })).json();
    if (!r.ok) return res.status(502).json({ error: 'telegram', message: r.description || 'savePreparedInlineMessage failed' });
    res.status(200).json({ id: r.result.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
