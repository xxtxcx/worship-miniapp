'use strict';
const L = require('./_lib');

const TYPES = ['Молодіжка', 'Підліткове', 'Молитва', 'Вечір хвали', 'Зустріч команди', 'Інше'];
const dmy = (iso) => iso.split('-').reverse().join('.');

// Створення, редагування й видалення служінь і складу. Лише для адмінів.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    if (!ctx.isAdmin) return res.status(403).json({ error: 'forbidden' });
    const b = req.body || {};
    const id = b.id ? L.nid(String(b.id)) : '';
    if (id && !/^[0-9a-f]{32}$/.test(id)) return res.status(400).json({ error: 'bad_id' });

    if (b.action === 'delete') {
      if (!id) return res.status(400).json({ error: 'bad_id' });
      await L.notion('PATCH', `/pages/${id}`, { archived: true });
    } else {
      const date = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'bad_date' });
      const type = TYPES.includes(b.type) ? b.type : 'Молодіжка';
      const ok = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map((x) => L.nid(String(x))))].filter((x) => ctx.people.has(x));
      const props = {
        'Назва': { title: [{ type: 'text', text: { content: String(b.name || `${type} ${dmy(date)}`).slice(0, 120) } }] },
        'Дата': { date: { start: date } },
        'Тип': { select: { name: type } },
        'Лід-вокал': { relation: ok(b.leads).map((x) => ({ id: x })) },
      };
      const roles = b.roles && typeof b.roles === 'object' ? b.roles : {};
      for (const r of L.ROLES) props[r] = { relation: ok(roles[r]).map((x) => ({ id: x })) };
      if (id) await L.notion('PATCH', `/pages/${id}`, { properties: props });
      else {
        const page = await L.notion('POST', '/pages', { parent: { database_id: L.DB.services }, properties: props });
        b.newId = L.nid(page.id);
      }
    }
    L.invalidate('window', 'servicesAll', 'servicesLite');
    if (b.action === 'delete') return res.status(200).json({ deleted: id });
    const sid = id || b.newId;
    const win = await L.loadWindow();
    const fresh = win.find((s) => s.id === sid);
    const byService = L.groupBy(await L.loadSetRowsFor([sid]), (r) => r.service);
    res.status(200).json({ service: fresh ? L.toClient(fresh, ctx, byService) : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
