'use strict';
const L = require('./_lib');

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const { serviceId, items, publish } = req.body || {};
    const sid = L.nid(String(serviceId || ''));
    if (!/^[0-9a-f]{32}$/.test(sid) || !Array.isArray(items) || items.length > 80) return res.status(400).json({ error: 'bad_request' });

    const [songs, windowList] = await Promise.all([L.loadSongs(), L.loadWindow()]);
    const svc = windowList.find((s) => s.id === sid);
    if (!svc) return res.status(404).json({ error: 'service_not_found' });
    if (!(svc.leadIds.includes(ctx.me.id) || ctx.isAdmin)) return res.status(403).json({ error: 'forbidden' });

    const known = new Set(songs.map((s) => s.id));
    const clean = L.cleanItems(items, known);
    const json = JSON.stringify(clean);

    const props = { 'Сет-лист (чернетка)': { rich_text: L.richText(json) } };
    if (publish) props['Сет-лист (опублікований)'] = { rich_text: L.richText(json) };
    await L.notion('PATCH', `/pages/${sid}`, { properties: props });

    if (publish) {
      // Синхронізуємо рядки бази «Сет-лист», щоб історія й лічильники лишались актуальними
      L.invalidate('rows');
      const rows = (await L.loadSetRows()).filter((r) => r.service === sid);
      await inBatches(rows, 3, (r) => L.notion('PATCH', `/pages/${r.id}`, { archived: true }));
      const byId = new Map(songs.map((s) => [s.id, s]));
      // Вокаліст пісні = людина зі складу цього служіння з таким ім'ям; якщо не вибрано, то лід служіння
      const vocalRole = svc.roles.find((r) => r.role === 'Вокал');
      const pool = [...new Set([...svc.leadIds, ...(vocalRole ? vocalRole.ids : [])])];
      const idByName = new Map(pool.map((i) => [(ctx.people.get(i) || {}).name, i]));
      const songItems = clean.filter((x) => x.t === 'song');
      await inBatches(songItems, 3, (it) => L.notion('POST', '/pages', {
        parent: { database_id: L.DB.sets },
        properties: {
          'Назва': { title: [{ type: 'text', text: { content: `${svc.name} — ${byId.get(it.id).title}`.slice(0, 200) } }] },
          'Служіння': { relation: [{ id: sid }] },
          'Пісня': { relation: [{ id: it.id }] },
          'Тональність': { rich_text: it.k ? [{ type: 'text', text: { content: it.k } }] : [] },
          'Лід-вокал': { relation: (idByName.has(it.v) ? [idByName.get(it.v)] : svc.leadIds).map((id) => ({ id })) },
        },
      }));
      L.invalidate('rows');
    }
    L.invalidate('window');
    const fresh = (await L.loadWindow()).find((s) => s.id === sid);
    const byService = L.groupBy(await L.loadSetRows(), (r) => r.service);
    res.status(200).json({ service: L.toClient(fresh, ctx, byService) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
