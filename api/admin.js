'use strict';
const L = require('./_lib');

// Журнал активності. Лише для адмінів (ADMIN_CHAT_IDS): для всіх інших відповідь однакова, ніби такого шляху немає.
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    if (!ctx.isAdmin) return res.status(404).json({ error: 'not_found' });
    L.invalidate('people');
    const people = [...(await L.loadPeople()).values()]
      .map((p) => ({ id: p.id, name: p.name, active: p.active, registered: /^\d+$/.test(p.chatId), lastSeen: p.lastSeen || null }))
      .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '') || a.name.localeCompare(b.name, 'uk'));
    res.status(200).json({ people, now: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
