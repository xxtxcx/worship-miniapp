'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const [songs, rows, window] = await Promise.all([L.loadSongs(), L.loadSetRows(), L.loadWindow()]);
    const counts = new Map();
    for (const r of rows) if (r.song) counts.set(r.song, (counts.get(r.song) || 0) + 1);
    const byService = L.groupBy(rows, (r) => r.service);
    res.status(200).json({
      me: { id: ctx.me.id, name: ctx.me.name, isAdmin: ctx.isAdmin },
      songs: songs.filter((s) => s.status !== 'Архів').map((s) => ({ ...s, n: counts.get(s.id) || 0 })),
      services: window.map((s) => L.toClient(s, ctx, byService)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
