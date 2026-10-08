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

// Журнал активності доступний лише адмінам
(async () => {
  const admin = require('../api/admin');
  const call = async (ctx) => {
    L.currentPerson = async () => ctx;
    L.loadPeople = async () => new Map([['p1', { id: 'p1', name: 'Наталя', chatId: '1', active: true, lastSeen: '2026-10-08T10:00:00.000Z' }]]);
    let out; const res = { status(c) { out = { code: c }; return { json(b) { out.body = b; } }; } };
    await admin({}, res); return out;
  };
  const denied = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: false });
  assert.strictEqual(denied.code, 404); assert(!JSON.stringify(denied.body).includes('Наталя'), 'non-admin gets no data');
  const ok = await call({ me: { id: 'p1' }, people: new Map(), isAdmin: true });
  assert.strictEqual(ok.code, 200); assert.strictEqual(ok.body.people[0].lastSeen, '2026-10-08T10:00:00.000Z');
  console.log('all tests passed');
})();
