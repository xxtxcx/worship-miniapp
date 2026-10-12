'use strict';
const L = require('./_lib');

// Фіксує, що людина відкрила застосунок (для журналу в адмінці). Викликається у фоні після завантаження.
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    await L.touchVisit(ctx.me);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
};
