'use strict';
const assert = require('assert'), crypto = require('crypto');
process.env.BOT_TOKEN = '123:TEST';
const L = require('../api/_lib');

// initData: правильний підпис проходить, підроблений ні, застарілий ні
function sign(fields) {
  const check = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const user = JSON.stringify({ id: 244629540, first_name: 'Тест' });
const fresh = sign({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q', user });
assert.strictEqual(L.verifyInitData(fresh).id, 244629540, 'valid initData');
assert.strictEqual(L.verifyInitData(fresh.replace('hash=', 'hash=0')), null, 'tampered hash');
assert.strictEqual(L.verifyInitData(fresh.replace('q', 'z')), null, 'tampered payload');
assert.strictEqual(L.verifyInitData(sign({ auth_date: '1000', user })), null, 'expired');
assert.strictEqual(L.verifyInitData(''), null, 'empty');

// Розбір тональностей з реальних значень бази
const cases = { 'C (original)': 'C', 'С': 'C', 'Аb': 'Ab', 'Hm': 'Bm', 'Am (not original)': 'Am', 'F-Ліда': 'F', 'D - Наталя': 'D', 'Eb ': 'Eb', 'E - Ілона, Аня/Gb - Ліда': 'E', '': '', 'none': '' };
for (const [i, o] of Object.entries(cases)) assert.strictEqual(L.noteKey(i), o, `noteKey(${i})`);

// toClient: приватність і права
const people = new Map([['p1', { id: 'p1', name: 'Наталя' }], ['p2', { id: 'p2', name: 'Аня' }], ['p3', { id: 'p3', name: 'Софія' }]]);
const svc = { id: 's', name: 'Молодіжка', date: '2026-10-11', type: 'Молодіжка', leadIds: ['p1'], roles: [{ role: 'Вокал', ids: ['p1', 'p2'] }], draft: [{ id: 'x', k: 'D' }], published: [{ id: 'y', k: 'C' }] };
const rows = new Map();
const lead = L.toClient(svc, { me: people.get('p1'), people, isAdmin: false }, rows);
assert(lead.canEdit && lead.isLead && lead.mine && lead.hasChanges && lead.draft[0].id === 'x');
const member = L.toClient(svc, { me: people.get('p2'), people, isAdmin: false }, rows);
assert(member.mine && !member.canEdit && !member.draft && member.published[0].id === 'y', 'member sees only published');
const outsider = L.toClient(svc, { me: people.get('p3'), people, isAdmin: false }, rows);
assert(!outsider.mine && !outsider.lineup && !outsider.published && !outsider.draft, 'outsider sees no details');
const admin = L.toClient(svc, { me: people.get('p3'), people, isAdmin: true }, rows);
assert(admin.canEdit && admin.draft, 'admin can edit');

// Тривалість і елементи сет-листа
assert.strictEqual(L.parseDur('4:35'), 275); assert.strictEqual(L.parseDur(' 6:05 '), 365); assert.strictEqual(L.parseDur('1:02:10'), 3730);
assert.strictEqual(L.parseDur(''), 0); assert.strictEqual(L.parseDur('4,5'), 0); assert.strictEqual(L.parseDur('4:5'), 0);
const known = new Set(['aaa']);
const ci = L.cleanItems([{ id: 'aaa', k: 'C' }, { t: 'song', id: 'aaa', k: 'Eb', v: ' Аня ' }, { id: 'zzz', k: 'D' }, { t: 'mom', x: ' Молитва ' }, { t: 'note', x: '' }, { t: 'note', x: '(коментар)' }, { t: 'bad', x: 'x' }, null], known);
assert.deepStrictEqual(ci, [{ t: 'song', id: 'aaa', k: 'C' }, { t: 'song', id: 'aaa', k: 'Eb', v: 'Аня' }, { t: 'mom', x: 'Молитва' }, { t: 'note', x: '(коментар)' }], 'cleanItems');
assert.deepStrictEqual(lead.vocalists, ['Наталя', 'Аня'], 'vocalists');
assert.strictEqual(lead.draft[0].t, 'song', 'legacy item normalized');
assert.strictEqual(L.ytUrl('https://www.youtube.com/watch?v=VV3gyslwzGo&t=982s'), 'https://youtu.be/VV3gyslwzGo?t=982');
assert.strictEqual(L.ytUrl('https://youtu.be/Jr6p1JImrZg?si=abc'), 'https://youtu.be/Jr6p1JImrZg');
assert.strictEqual(L.ytUrl('https://www.youtube.com/watch?v=x1&list=RDx1&start_radio=1'), 'https://youtu.be/x1');
assert.strictEqual(L.ytUrl('not a url'), 'not a url');

assert.strictEqual(L.photoOf({ files: [{ type: 'file', file: { url: 'https://s3/x.png' } }] }), 'https://s3/x.png');
assert.strictEqual(L.photoOf({ files: [{ type: 'external', external: { url: 'https://e/y.jpg' } }] }), 'https://e/y.jpg');
assert.strictEqual(L.photoOf({ files: [] }), ''); assert.strictEqual(L.photoOf(undefined), '');

// Матеріали: нове поле Notion стає матеріалом автоматично
{
  const rt = (s) => ({ type: 'rich_text', rich_text: s ? [{ plain_text: s }] : [] });
  const m = L.materialsOf({
    'Назва': { type: 'title', title: [{ plain_text: 'X' }] }, 'Виконавець': rt('Hillsong'), 'Обкладинка': { type: 'url', url: 'https://c/x.jpg' },
    'YouTube': { type: 'url', url: 'https://youtu.be/a' }, 'Multitracks': { type: 'url', url: null },
    'Клавіші партії': { type: 'url', url: 'https://drive/k' }, 'Гітарні партії': rt('Лід: https://drive/g, ритм: Am F'), 'Бас': rt('https://drive/b'),
    'Нотатки': rt('Грати тихо'), 'Інші лінки': rt(''), 'BPM': { type: 'number', number: 70 }, 'Хор': { type: 'files', files: [{ name: 'a.pdf', file: { url: 'https://s3/a.pdf' } }] },
  });
  assert.deepStrictEqual(m.map((x) => x.name), ['YouTube', 'Бас', 'Гітарні партії', 'Клавіші партії', 'Хор', 'Нотатки'], 'order and filtering');
  assert.deepStrictEqual(m.find((x) => x.name === 'Бас').links, [{ url: 'https://drive/b' }], 'url-only text becomes a link');
  assert(m.find((x) => x.name === 'Гітарні партії').text.includes('Am F'));
  assert.strictEqual(m.find((x) => x.name === 'Хор').links[0].label, 'a.pdf');
}

// Історія: toHistory показує склад і опублікований сет-лист усім, у тому числі зі старих рядків бази
{
  const people = new Map([['p1', { id: 'p1', name: 'Наталя' }], ['p2', { id: 'p2', name: 'Аня' }]]);
  const svc = { id: 's', name: 'Мол', date: '2026-09-27', type: 'Молодіжка', leadIds: ['p1'], roles: [{ role: 'Вокал', ids: ['p1', 'p2'] }, { role: 'Бас', ids: [] }], draft: [{ id: 'secret' }], published: null };
  const rows = [{ created: '2026-09-27T10:00:00Z', song: 'b', key: 'D', leads: ['p2'], link: 'https://youtu.be/b' }, { created: '2026-09-27T09:00:00Z', song: 'a', key: 'C', leads: ['p1'] }];
  const h = L.toHistory(svc, { people }, rows);
  assert(h.past && !h.canEdit && !h.draft, 'history is read-only and hides drafts');
  assert.deepStrictEqual(h.published.map((x) => [x.id, x.v]), [['a', 'Наталя'], ['b', 'Аня']], 'order by creation, vocalist from row');
  assert.deepStrictEqual(h.lineup.map((r) => r.role), ['Вокал']);
  assert.strictEqual(h.published.find((x) => x.id === 'b').link, 'https://youtu.be/b'); assert.strictEqual(h.published.find((x) => x.id === 'a').link, undefined, 'link only where present');
}

// Статистика
{
  const today = new Date('2026-10-08T12:00:00Z');
  const songs = [{ id: 'a', title: 'A', status: 'Зелені' }, { id: 'b', title: 'B', status: 'Зелені' }, { id: 'c', title: 'C', status: 'Зелені' }, { id: 'z', title: 'Z', status: 'Архів' }];
  const people = new Map([['p1', { id: 'p1', name: 'Аня', active: true, chatId: '1' }], ['p2', { id: 'p2', name: 'Бо', active: true, chatId: '2' }], ['p3', { id: 'p3', name: 'Ія', active: false, chatId: '' }]]);
  const services = new Map([['s1', { date: '2026-10-04', leadIds: ['p1'], peopleIds: ['p1', 'p2'] }], ['s2', { date: '2026-09-27', leadIds: ['p2'], peopleIds: ['p2'] }], ['s3', { date: '2026-06-01', leadIds: ['p1'], peopleIds: ['p1'] }], ['s4', { date: '2026-10-20', leadIds: ['p1'], peopleIds: ['p1'] }]]);
  const rows = [{ service: 's1', song: 'a', leads: ['p1'] }, { service: 's1', song: 'b', leads: ['p2'] }, { service: 's2', song: 'a', leads: ['p2'] }, { service: 's3', song: 'c', leads: ['p1'] }, { service: 's4', song: 'b', leads: ['p1'] }, { service: 's2', song: 'z', leads: [] }];
  const st = L.computeStats({ rows, services, songs, people, today });
  assert.deepStrictEqual(st.rep.top.map((x) => [x.id, x.n]), [['a', 2], ['b', 1], ['c', 1]], 'future services and archived songs ignored');
  assert.deepStrictEqual(st.rep.old.map((x) => x.id), ['c'], 'stale = not played for 8+ weeks');
  assert.strictEqual(st.rep.never.length, 0); assert.strictEqual(st.rep.services, 2); assert.strictEqual(st.rep.avgSongs, 2);
  const by = Object.fromEntries(st.team.members.map((m) => [m.id, m]));
  assert.deepStrictEqual([by.p1.served, by.p1.led, by.p1.sang], [1, 1, 1]); assert.deepStrictEqual([by.p2.served, by.p2.led, by.p2.sang], [2, 1, 2]);
  assert(!by.p3, 'inactive without activity is hidden');
}

// Аватар: фото з Notion має пріоритет над Telegram і працює без chat_id; завеликі файли ігноруються
(async () => {
  const avatar = require('../api/avatar');
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://s3/')) {
      const big = String(url).includes('big');
      return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => new Uint8Array(big ? 800 * 1024 : 10).buffer };
    }
    return { ok: true, json: async () => ({ ok: true, result: { photos: [] } }), headers: { get: () => '' } };
  };
  let seq = 0;
  const run = async (person) => {
    const pid = String(++seq).padStart(32, '0');
    L.currentPerson = async () => ({ me: { id: 'm' }, people: new Map([[pid, person]]), isAdmin: false });
    let out = {}; const res = { setHeader(k, v) { out[k] = v; }, status(c) { out.code = c; return { json(b) { out.body = b; }, send(b) { out.sent = b; } }; } };
    await avatar({ query: { id: pid } }, res); return out;
  };
  const manual = await run({ id: 'p', chatId: '', photo: 'https://s3/ok.png' });
  assert.strictEqual(manual.code, 200); assert.strictEqual(manual['Content-Type'], 'image/png'); assert(!calls.some((c) => c.includes('telegram')), 'manual photo does not call Telegram');
  const none = await run({ id: 'q', chatId: '', photo: '' });
  assert.strictEqual(none.code, 404);
  const big = await run({ id: 'r', chatId: '', photo: 'https://s3/big.png' });
  assert.strictEqual(big.code, 404, 'oversized photo is ignored');
  global.fetch = realFetch;
})();

// Адмінка доступна лише адмінам
(async () => {
  const admin = require('../api/admin');
  const approved = [];
  L.loadPeople = async () => new Map([['p1', { id: 'p1', name: 'Наталя', chatId: '1', active: true, lastSeen: '2026-10-08T10:00:00.000Z' }], ['p2', { id: 'p2', name: 'Без чату', chatId: '', active: true, lastSeen: '' }]]);
  L.loadSongs = async () => [{ id: 's1', title: 'Wake', status: 'Зелені', our: 'G', hasChords: false, dur: 0, bpm: 0, meter: '', yt: '', mt: '', reh: '' }, { id: 's2', title: 'Old', status: 'Архів', our: '', hasChords: false }];
  L.loadWindow = async () => [{ id: 'v1', date: '2026-10-11', type: 'Молодіжка', leadIds: [], roles: [{ role: 'Вокал', ids: ['p1'] }], draft: null, published: null }];
  L.loadSetRows = async () => [];
  L.loadRequests = async () => [{ id: 'r1', name: 'Хтось', tgId: '5', nick: 'x', attempts: 2, last: '2026-10-08T09:00:00.000Z' }];
  L.loadServicesLite = async () => new Map();
  L.resolveRequest = async (id, ok) => approved.push([id, ok]);
  const call = async (ctx, method = 'GET', body) => {
    L.currentPerson = async () => ctx;
    let out; const res = { status(c) { out = { code: c }; return { json(b) { out.body = b; } }; } };
    await admin({ method, body }, res); return out;
  };
  const denied = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: false });
  assert.strictEqual(denied.code, 404); assert(!JSON.stringify(denied.body).includes('Наталя'), 'non-admin gets no data');
  const deniedPost = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: false }, 'POST', { action: 'approve', id: 'a'.repeat(32) });
  assert.strictEqual(deniedPost.code, 404); assert.strictEqual(approved.length, 0, 'non-admin cannot approve');
  const ok = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: true });
  assert.strictEqual(ok.code, 200);
  assert.strictEqual(ok.body.people[0].lastSeen, '2026-10-08T10:00:00.000Z');
  assert.strictEqual(ok.body.requests[0].name, 'Хтось');
  assert.strictEqual(ok.body.services[0].setlist.state, 'empty'); assert.deepStrictEqual(ok.body.services[0].missing, ['Барабани', 'Бас', 'Клавіші']);
  assert(ok.body.gaps.some((g) => g.key === 'chords' && g.items.length === 1), 'archived songs are not in gaps');
  assert(!ok.body.gaps.some((g) => g.items.some((i) => i.title === 'Old')));
  assert(ok.body.gaps.some((g) => g.key === 'chat' && g.items[0].title === 'Без чату'));
  const appr = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: true }, 'POST', { action: 'approve', id: 'a'.repeat(32) });
  assert.strictEqual(appr.code, 200); assert.deepStrictEqual(approved[0], ['a'.repeat(32), true]);
  assert.strictEqual((await call({ me: { id: 'p1' }, people: new Map(), isAdmin: true }, 'POST', { action: 'x', id: 'bad' })).code, 400);
  assert.strictEqual(L.setlistState({ published: [{ id: 'a', k: 'C' }], draft: [{ id: 'a', k: 'D' }] }, []).state, 'changed');
  assert.strictEqual(L.setlistState({ published: null, draft: [{ id: 'a', k: 'C' }] }, []).state, 'draft');
  assert.strictEqual(L.setlistState({ published: [{ id: 'a', k: 'C' }], draft: null }, []).state, 'published');
  console.log('all tests passed');
})();
