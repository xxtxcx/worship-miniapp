'use strict';
const L = require('./_lib');

// Минулі служіння: ?offset=0&limit=12 (список) або ?id=… (одне служіння). Бачать усі, хто є в базі «Люди».
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const [all, rows] = await Promise.all([L.loadAllServices(), L.loadSetRows()]);
    const rowsBy = L.groupBy(rows, (r) => r.service);
    const today = new Date().toISOString().slice(0, 10);
    const build = (s) => L.toHistory(s, ctx, rowsBy.get(s.id) || []);
    if (req.query.id) {
      const sid = L.nid(String(req.query.id));
      const svc = all.find((s) => s.id === sid && s.date && s.date <= today);
      if (!svc) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ service: build(svc) });
    }
    const offset = Math.max(0, Number(req.query.offset) || 0), limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const past = all.filter((s) => s.date && s.date < today).sort((a, b) => b.date.localeCompare(a.date)).map(build)
      .filter((s) => s.lineup.length || s.published.some((x) => x.t === 'song'));
    res.status(200).json({ services: past.slice(offset, offset + limit), total: past.length, hasMore: offset + limit < past.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
