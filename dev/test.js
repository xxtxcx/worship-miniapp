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

// Адмінка доступна лише адмінам
(async () => {
  const admin = require('../api/admin');
  const approved = [];
  L.loadPeople = async () => new Map([['p1', { id: 'p1', name: 'Наталя', chatId: '1', active: true, lastSeen: '2026-10-08T10:00:00.000Z' }], ['p2', { id: 'p2', name: 'Без чату', chatId: '', active: true, lastSeen: '' }]]);
  L.loadSongs = async () => [{ id: 's1', title: 'Wake', status: 'Зелені', our: 'G', hasChords: false, dur: 0, bpm: 0, meter: '', yt: '', mt: '', reh: '' }, { id: 's2', title: 'Old', status: 'Архів', our: '', hasChords: false }];
  L.loadWindow = async () => [{ id: 'v1', date: '2026-10-11', type: 'Молодіжка', leadIds: [], roles: [{ role: 'Вокал', ids: ['p1'] }], draft: null, published: null }];
  L.loadSetRows = async () => [];
  L.loadRequests = async () => [{ id: 'r1', name: 'Хтось', tgId: '5', nick: 'x', attempts: 2, last: '2026-10-08T09:00:00.000Z' }];
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
