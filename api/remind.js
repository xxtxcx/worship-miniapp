'use strict';
const L = require('./_lib');
const B = require('./_bot');

// Щоденна розсилка (Vercel Cron): нагадування учасникам за 5 і 2 дні до служіння.
module.exports = async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
    const [services, people] = await Promise.all([L.loadWindow(), L.loadPeople()]);
    const { out, missing } = B.remindersFor(services, people, B.todayKyiv());
    let sent = 0;
    for (const m of out) {
      const r = await B.send(m.chatId, m.text, B.webButton());
      if (r.ok) sent++;
    }
    const admin = L.adminIds()[0];
    if (admin && missing.length) {
      const list = missing.map((x) => `${x.name} (${B.fmtDate(x.svc.date)})`).join(', ');
      await B.send(admin, `⚠️ Немає chat_id для: ${list}`);
    }
    res.status(200).json({ sent, failed: out.length - sent, missing: missing.length });
  } catch (e) {
    console.error(e);
    const admin = L.adminIds()[0];
    if (admin) await B.send(admin, `❌ Помилка розсилки: ${String(e.message || e).slice(0, 200)}`);
    res.status(500).json({ error: 'server' });
  }
};
