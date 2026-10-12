'use strict';
/* Локальний перегляд без Notion і Telegram: node dev/mock-server.js → http://localhost:3000
   ?role=lead|member|none змінює, ким ви себе вважаєте. Дані вигадані на основі репертуару. */
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const META = { a1: [147, '4/4'], a2: [72, '4/4'], a5: [131, '4/4'] };
const ARTISTS = { a1: 'Equippers Revolution', a2: 'Equippers Worship', a5: 'Hillsong Young & Free', a8: 'REVERE' };
const DUR = { a1: 280, a2: 290, a3: 310, a4: 360, a5: 260, a6: 285 };
const COVER = (c1, c2) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="100" r="46" fill="none" stroke="#fff" stroke-width="6"/></svg>`);
const COVERS = { a1: COVER('#e96443', '#904e95'), a5: COVER('#2193b0', '#6dd5ed'), a2: COVER('#134e5e', '#71b280') };
const mk = (id, title, type, orig, our, n, extra = {}) => ({ artist: ARTISTS[id] || '', cover: COVERS[id] || '', dur: DUR[id] || 0, bpm: (META[id] || [0])[0], meter: (META[id] || [0, ''])[1], id, title, type, status: 'Активна', orig, our, n, keysBy: '', mt: '', yt: '', reh: '', gtr: '', vit: '', links: '', related: '', notes: '', hasChords: false, ...extra });
const songs = [
  mk('a1', 'Just Want You', 'Прославлення', 'D', 'D', 18, { status: 'Зелені', keysBy: 'Наталя: A', mt: 'https://www.multitracks.com/songs/Equippers-Revolution/Truth/Just-Want-You/' }),
  mk('a2', 'None Like You', 'Прославлення', 'C', 'C', 11, { status: 'Жовті' }),
  mk('a3', 'Relentless(Remix)', 'Прославлення', 'D', 'D', 4, { yt: 'https://www.youtube.com/watch?v=TOLW_dXoIgk', gtr: 'EG2' }),
  mk('a4', 'Holy Spirit', 'Поклоніння', 'D', 'D', 9),
  mk('a5', 'Wake', 'Прославлення', 'G', 'G', 9, { hasChords: true, mt: 'https://www.multitracks.com/songs/Hillsong-Young-And-Free/Wake/Wake/' }),
  mk('a6', 'Free', 'Прославлення', 'Bm', 'Bm', 13),
  mk('a7', 'Here in Your Presence', 'Поклоніння', 'A', 'A', 7, { status: 'Вчимо' }),
  mk('a8', 'Omnipotent', 'Поклоніння', 'Am', 'Am', 9),
];
const wake = `# 1 куплет
[G]В надії ми кожен [D]день,
[Em]І погляд свій підносим [C]вверх.
[G]І ритм сердець хай буде [D]Твій,
[Em]Де ми йдемо, там будеш [C]Ти.
# Приспів
[G]Ти зі мною, Ти зі [D]мною.
[Em]В моєму серці завжди [C]Ти.`;
const songData = {
  a5: { chords: wake, lyrics: [{ h: '1 КУПЛЕТ', t: 'В надії ми кожен день,\nІ погляд свій підносим вверх.' }, { h: 'ПРИСПІВ', t: 'Ти зі мною, Ти зі мною.\nВ моєму серці завжди Ти.' }], history: [{ date: '2026-04-12', lead: 'Діана', key: 'G' }, { date: '2026-02-15', lead: 'Квітка', key: 'Ab' }] },
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const svc = (id, n, leadName, mine) => ({
  id, date: day(n), name: 'Молодіжка', type: 'Молодіжка', lead: leadName ? [leadName] : [], leadIds: leadName ? ['p2'] : [], mine, isLead: false, canEdit: false,
  lineup: [{ role: 'Вокал', names: ['Аня', 'Наталя', 'Артур'], ids: ['p1', 'p2', 'p3'], lead: leadName ? [leadName] : [] }, { role: 'Барабани', names: ['Єгор'], lead: [] }, { role: 'Бас', names: ['Андрій'], lead: [] }, { role: 'Клавіші', names: ['Настя'], lead: [] }],
  vocalists: ['Наталя', 'Аня', 'Анна', 'Артур'],
  published: [{ t: 'mom', x: 'Біг інтро' }, { t: 'song', id: 'a1', k: 'D', v: 'Аня' }, { t: 'note', x: '(None like you під час привітання)' }, { t: 'song', id: 'a2', k: 'C', v: 'Наталя' }, { t: 'mom', x: 'Молитва' }, { t: 'note', x: '(продовжуємо трішки попередню пісню..)' }, { t: 'song', id: 'a4', k: 'D', v: 'Анна' }],
});
const state = { services: [svc('s1', 5, 'Наталя', true), svc('s2', 12, null, true), svc('s3', 19, null, false)] };
function forRole(role) {
  return state.services.map((s, i) => {
    const o = JSON.parse(JSON.stringify(s));
    if (role === 'none') { o.mine = false; delete o.lineup; delete o.published; return o; }
    if (i === 2) { o.mine = false; delete o.lineup; delete o.published; return o; }
    if (role === 'lead' && i === 0) { o.isLead = true; o.canEdit = true; o.draft = s.draft || s.published; o.hasChanges = JSON.stringify(o.draft) !== JSON.stringify(s.published); }
    return o;
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), role = url.searchParams.get('role') || globalThis.role || 'lead';
  if (url.searchParams.get('role')) globalThis.role = url.searchParams.get('role');
  if (url.searchParams.get('admin')) globalThis.admin = url.searchParams.get('admin');
  if (url.pathname === '/api/admin') { if (globalThis.admin !== '1') return send(res, 404, { error: 'not_found' }); if (req.method === 'POST') { globalThis.reqs = []; return send(res, 200, { ok: true }); } const h = (n) => new Date(Date.now() - n * 36e5).toISOString(); const reqs = globalThis.reqs || [{ id: 'a'.repeat(32), name: 'Марічка К.', tgId: '5550123', nick: 'marichka', attempts: 2, last: h(3) }]; return send(res, 200, { now: new Date().toISOString(), requests: reqs, people: [{ id: 'p1', name: 'Аня', active: true, registered: true, lastSeen: h(0.1) }, { id: 'p2', name: 'Наталя', active: true, registered: true, lastSeen: h(5) }, { id: 'p3', name: 'Артур', active: true, registered: true, lastSeen: h(72) }, { id: 'p4', name: 'Єгор', active: true, registered: true, lastSeen: null }], services: state.services.map((x, i) => ({ id: x.id, date: x.date, type: x.type, lead: x.lead, leadIds: x.leadIds || [], missing: i ? ['Бас', 'Клавіші'] : [], setlist: { state: ['published', 'empty', 'draft'][i] || 'empty', songs: i === 0 ? 3 : 0 } })), rep: { days: 90, services: 11, avgSongs: 4.3, top: songs.slice(0, 6).map((x, i) => ({ id: x.id, title: x.title, n: 12 - i * 2, last: '2026-10-04' })), old: songs.slice(5).map((x) => ({ id: x.id, title: x.title, last: '2026-07-20' })), never: [{ id: 'a7', title: 'Here in Your Presence' }] }, team: { days: 90, members: [{ id: 'p1', name: 'Аня', active: true, registered: true, served: 9, led: 3, sang: 14 }, { id: 'p2', name: 'Наталя', active: true, registered: true, served: 7, led: 5, sang: 11 }, { id: 'p3', name: 'Артур', active: true, registered: true, served: 2, led: 0, sang: 1 }, { id: 'p4', name: 'Єгор', active: true, registered: false, served: 0, led: 0, sang: 0 }] }, gaps: [{ key: 'chords', title: 'Без акордів', items: songs.filter((x) => !x.hasChords).map((x) => ({ id: x.id, title: x.title })) }, { key: 'dur', title: 'Без тривалості', items: songs.filter((x) => !x.dur).map((x) => ({ id: x.id, title: x.title })) }, { key: 'chat', title: 'Люди без chat_id', people: true, items: [{ id: 'z', title: 'Василь' }] }] }); }
  if (url.pathname === '/api/bootstrap') return send(res, 200, { me: { id: 'me', name: 'Тест', isAdmin: globalThis.admin === '1' }, songs: songs.map((x) => ({ ...x, n: 0 })), services: forRole(globalThis.role || 'lead') });
  if (url.pathname === '/api/avatar') { if (url.searchParams.get('id') === 'p3') { res.writeHead(404); return res.end('{}'); } res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#c26"/><circle cx="48" cy="38" r="18" fill="#fff"/></svg>'); }
  if (url.pathname === '/api/counts') return setTimeout(() => send(res, 200, { counts: Object.fromEntries(songs.map((x) => [x.id, x.n])) }), 300);
  if (url.pathname === '/api/ping') return send(res, 200, { ok: true });
  if (url.pathname === '/api/history') {
    const pastSvc = (id, n, lead, lid, songsArr) => ({ id, date: day(-n), type: 'Молодіжка', past: true, mine: false, isLead: false, canEdit: false, lead: [lead], leadIds: [lid], vocalists: [], lineup: [{ role: 'Вокал', names: [lead, 'Аня'], ids: [lid, 'p1'], lead: [lead] }, { role: 'Барабани', names: ['Єгор'], ids: ['p4'], lead: [] }], published: songsArr });
    const all = [pastSvc('h1', 7, 'Наталя', 'p2', [{ t: 'song', id: 'a1', k: 'D', v: 'Наталя' }, { t: 'song', id: 'a5', k: 'G', v: 'Аня' }]), pastSvc('h2', 14, 'Аня', 'p1', [{ t: 'mom', x: 'Молитва' }, { t: 'song', id: 'a2', k: 'C', v: 'Аня' }]), pastSvc('h3', 45, 'Наталя', 'p2', [{ t: 'song', id: 'a4', k: 'D', v: 'Наталя' }])];
    if (url.searchParams.get('id')) { const f = all.find((x) => x.id === url.searchParams.get('id')); return f ? send(res, 200, { service: f }) : send(res, 404, { error: 'not_found' }); }
    return send(res, 200, { services: all, total: all.length, hasMore: false });
  }
  if (url.pathname === '/api/song') return setTimeout(() => send(res, 200, songData[url.searchParams.get('id')] || { chords: '', lyrics: [], history: [{ service: 'h1', date: '2026-03-01', lead: 'Аня', key: 'D' }] }), 250);
  if (url.pathname === '/api/setlist' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const { serviceId, items, publish } = JSON.parse(b), s = state.services.find((x) => x.id === serviceId);
      s.draft = items; if (publish) s.published = items;
      const o = forRole('lead').find((x) => x.id === serviceId); send(res, 200, { service: o });
    }); return;
  }
  const file = path.join(__dirname, '..', 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8' }); res.end(data); });
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (?role=lead|member|none)`));
