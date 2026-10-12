'use strict';
const L = require('./_lib');

// Скільки разів кожну пісню грали (за всією історією). Відділено від bootstrap, бо історія велика.
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const rows = await L.loadSetRows();
    const counts = {};
    for (const r of rows) if (r.song) counts[r.song] = (counts[r.song] || 0) + 1;
    res.status(200).json({ counts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
