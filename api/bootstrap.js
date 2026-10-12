'use strict';
const L = require('./_lib');

// Швидкий старт: без повного завантаження історії сет-листів. Лічильники «скільки разів грали» приходять окремо з /api/counts,
// а відмітка про заходи окремим /api/ping, щоб не затримувати першу відповідь.
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const [songs, window] = await Promise.all([L.loadSongs(), L.loadWindow()]);
    const rows = await L.loadSetRowsFor(window.map((s) => s.id));
    const byService = L.groupBy(rows, (r) => r.service);
    res.status(200).json({
      me: { id: ctx.me.id, name: ctx.me.name, isAdmin: ctx.isAdmin },
      songs: songs.map((s) => ({ ...s, n: 0 })),
      services: window.map((s) => L.toClient(s, ctx, byService)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
