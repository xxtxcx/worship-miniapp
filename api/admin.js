'use strict';
const L = require('./_lib');

const CORE_ROLES = ['Вокал', 'Барабани', 'Бас', 'Клавіші'];

// Адмінка: усе лише для адмінів (ADMIN_CHAT_IDS). Для всіх інших відповідь однакова, ніби такого шляху немає.
module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    if (!ctx.isAdmin) return res.status(404).json({ error: 'not_found' });

    if (req.method === 'POST') {
      const { action, id } = req.body || {};
      const rid = L.nid(String(id || ''));
      if (!/^[0-9a-f]{32}$/.test(rid) || !['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'bad_request' });
      await L.resolveRequest(rid, action === 'approve');
      return res.status(200).json({ ok: true });
    }

    L.invalidate('people', 'window');
    const [peopleMap, songs, win, rows, requests] = await Promise.all([L.loadPeople(), L.loadSongs(), L.loadWindow(), L.loadSetRows(), L.loadRequests()]);
    const people = [...peopleMap.values()];
    const name = (id) => (peopleMap.get(id) || {}).name;
    const rowsBy = L.groupBy(rows, (r) => r.service);

    const services = win.map((svc) => {
      const st = L.setlistState(svc, rowsBy.get(svc.id) || []);
      const present = new Set(svc.roles.filter((r) => r.ids.length).map((r) => r.role));
      return {
        id: svc.id, date: svc.date, type: svc.type,
        lead: svc.leadIds.map(name).filter(Boolean), leadIds: svc.leadIds.filter((i) => name(i)),
        missing: CORE_ROLES.filter((r) => !present.has(r) && !(r === 'Вокал' && svc.leadIds.length)),
        setlist: st,
      };
    });

    const live = songs.filter((s) => s.status !== 'Архів');
    const gap = (key, title, f) => ({ key, title, items: live.filter(f).map((s) => ({ id: s.id, title: s.title })) });
    const gaps = [
      gap('chords', 'Без акордів', (s) => !s.hasChords),
      gap('dur', 'Без тривалості', (s) => !s.dur),
      gap('bpm', 'Без BPM', (s) => !s.bpm),
      gap('meter', 'Без розміру', (s) => !s.meter),
      gap('key', 'Без тональності', (s) => !s.our),
      gap('links', 'Без жодного посилання', (s) => !(s.yt || s.mt || s.reh)),
    ].filter((g) => g.items.length);
    const noChat = people.filter((p) => p.active && !/^\d+$/.test(p.chatId)).map((p) => ({ id: p.id, title: p.name }));
    if (noChat.length) gaps.push({ key: 'chat', title: 'Люди без chat_id', items: noChat, people: true });

    const activity = people
      .map((p) => ({ id: p.id, name: p.name, active: p.active, registered: /^\d+$/.test(p.chatId), lastSeen: p.lastSeen || null }))
      .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '') || a.name.localeCompare(b.name, 'uk'));

    res.status(200).json({ now: new Date().toISOString(), services, requests, gaps, people: activity });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
