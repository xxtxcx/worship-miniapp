'use strict';
const crypto = require('crypto');

const NOTION_API = 'https://api.notion.com/v1';
const DB = {
  people: '35dedeb894a14092a79e4de805a88b16',
  songs: '5deee4489145405e969b35e69d99e8ba',
  services: '2b4d670f72f0491abc75b5a53da048ed',
  sets: 'e7f712cfe6d5430bbcf3d9cd90168942',
};
const ROLES = ['Барабани', 'Бас', 'Клавіші', 'Електрогітара', 'Акустична гітара', 'Вокал', 'Звук'];
const WINDOW_DAYS = 30;

/* ---------- Notion ---------- */
async function notion(method, path, body, attempt = 0) {
  const res = await fetch(NOTION_API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 4) {
    const wait = (Number(res.headers.get('retry-after')) || 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return notion(method, path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function queryAll(dbId, filter, sorts) {
  const out = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;
    const r = await notion('POST', `/databases/${dbId}/query`, body);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

const text = (p) => ((p && (p.rich_text || p.title)) || []).map((t) => t.plain_text).join('');
const rel = (p) => ((p && p.relation) || []).map((r) => r.id.replace(/-/g, ''));
const nid = (id) => String(id).replace(/-/g, '');
const richText = (str) => {
  const chunks = [];
  for (let i = 0; i < str.length; i += 1900) chunks.push({ type: 'text', text: { content: str.slice(i, i + 1900) } });
  return chunks;
};
function parseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/* ---------- Кеш у пам'яті інстансу ---------- */
const store = new Map();
function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.p;
  const p = fn().catch((e) => { store.delete(key); throw e; });
  store.set(key, { t: Date.now(), p });
  return p;
}
const invalidate = (...keys) => keys.forEach((k) => store.delete(k));

/* ---------- Telegram ---------- */
function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN || '').digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  if (age > 24 * 3600) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

function authUser(req) {
  const init = req.headers['x-init-data'];
  const user = verifyInitData(init);
  if (user) return user;
  if (!init && process.env.DEV_CHAT_ID) return { id: Number(process.env.DEV_CHAT_ID) };
  return null;
}

const adminIds = () => (process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

/* ---------- Дані ---------- */
function loadPeople() {
  return cached('people', 5 * 60e3, async () => {
    const pages = await queryAll(DB.people);
    const map = new Map();
    for (const pg of pages) {
      const p = pg.properties;
      map.set(nid(pg.id), {
        id: nid(pg.id), name: text(p["Ім'я"]), chatId: text(p.chat_id).trim(),
        active: !!(p['Активний'] && p['Активний'].checkbox),
        lastSeen: (p['Остання активність'] && p['Остання активність'].date && p['Остання активність'].date.start) || '',
      });
    }
    return map;
  });
}

// Фіксуємо, що людина відкрила застосунок. Пишемо в Notion не частіше, ніж раз на 10 хвилин.
async function touchVisit(me) {
  const prev = me.lastSeen;
  if (prev && Date.now() - Date.parse(prev) < 10 * 60e3) return;
  me.lastSeen = new Date().toISOString();
  try {
    await notion('PATCH', `/pages/${me.id}`, { properties: { 'Остання активність': { date: { start: me.lastSeen } } } });
  } catch (e) {
    me.lastSeen = prev;
    console.error('touchVisit', e.message);
  }
}

function noteKey(s) {
  s = (s || '').trim();
  if (/^Hm/.test(s)) s = 'Bm' + s.slice(2);
  s = s.replace(/^С/, 'C').replace(/^А/, 'A').replace(/^Е/, 'E').replace(/^В/, 'B').replace(/^Н/, 'B');
  const m = /^([A-G])([#b]?)(m?)/.exec(s);
  return m ? m[1] + m[2] + m[3] : '';
}

// «4:35» або «1:02:10» → секунди; порожнє чи незрозуміле → 0
function parseDur(str) {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(str || '');
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Елементи сет-листа: пісня {t:'song',id,k,v}, пункт {t:'mom',x}, коментар {t:'note',x}.
// Старий формат {id,k} читається як пісня. З known (Set id пісень) невідомі пісні відкидаються.
function cleanItems(items, known) {
  const out = [];
  for (const x of Array.isArray(items) ? items : []) {
    if (!x || typeof x !== 'object') continue;
    if (x.t === 'mom' || x.t === 'note') {
      const t = String(x.x || '').trim().slice(0, 200);
      if (t) out.push({ t: x.t, x: t });
      continue;
    }
    const id = nid(String(x.id || ''));
    if (known ? !known.has(id) : !id) continue;
    const it = { t: 'song', id, k: String(x.k || '').slice(0, 4) };
    const v = String(x.v || '').trim().slice(0, 60);
    if (v) it.v = v;
    out.push(it);
  }
  return out;
}

// Чисте посилання на відео: без службових параметрів, але з позначкою часу, якщо була
function ytUrl(u) {
  try {
    const x = new URL(u);
    const id = x.hostname === 'youtu.be' ? x.pathname.slice(1) : x.searchParams.get('v');
    if (!id) return u;
    const t = (x.searchParams.get('t') || '').replace(/s$/, '');
    return `https://youtu.be/${id}${/^\d+$/.test(t) && t !== '0' ? `?t=${t}` : ''}`;
  } catch { return u; }
}

function loadSongs() {
  return cached('songs', 2 * 60e3, async () => {
    const pages = await queryAll(DB.songs);
    return pages.map((pg) => {
      const p = pg.properties;
      const origRaw = text(p['Оригінальна тональність']), ourRaw = text(p['Наша тональність']);
      const orig = noteKey(origRaw) || noteKey(ourRaw);
      const our = noteKey(ourRaw) || noteKey(origRaw);
      return {
        id: nid(pg.id),
        title: text(p['Назва']),
        type: p['Тип'].select ? p['Тип'].select.name : '',
        status: p['Статус'].select ? p['Статус'].select.name : '',
        orig, our,
        keysBy: text(p['Тональності вокалістів']),
        origRaw, ourRaw,
        mt: p.Multitracks.url || '',
        yt: p.YouTube.url || '',
        reh: p['Rehearsal mix'].url || '',
        gtr: text(p['Гітарні партії']),
        vit: text(p['Партії Віталік']),
        links: text(p['Інші лінки']),
        related: text(p["Зв'язки"]),
        notes: text(p['Нотатки']),
        dur: parseDur(text(p['Тривалість'])),
        bpm: (p.BPM && p.BPM.number) || 0,
        meter: text(p['Розмір']).trim(),
        hasChords: text(p['Акорди']).trim().length > 0,
      };
    });
  });
}

function loadSetRows() {
  return cached('rows', 10 * 60e3, async () => {
    const pages = await queryAll(DB.sets);
    return pages.map((pg) => {
      const p = pg.properties;
      return {
        id: nid(pg.id),
        created: pg.created_time,
        song: rel(p['Пісня'])[0],
        service: rel(p['Служіння'])[0],
        leads: rel(p['Лід-вокал']),
        key: text(p['Тональність']),
      };
    });
  });
}

function parseService(pg) {
  const p = pg.properties;
  return {
    id: nid(pg.id),
    name: text(p['Назва']),
    date: p['Дата'].date ? p['Дата'].date.start.slice(0, 10) : null,
    type: p['Тип'].select ? p['Тип'].select.name : '',
    leadIds: rel(p['Лід-вокал']),
    roles: ROLES.map((r) => ({ role: r, ids: rel(p[r]) })),
    draft: parseJson(text(p['Сет-лист (чернетка)'])),
    published: parseJson(text(p['Сет-лист (опублікований)'])),
  };
}

const isoDay = (d) => d.toISOString().slice(0, 10);
function loadWindow() {
  return cached('window', 15e3, async () => {
    const today = new Date();
    const end = new Date(today.getTime() + WINDOW_DAYS * 86400e3);
    const pages = await queryAll(
      DB.services,
      { and: [
        { property: 'Дата', date: { on_or_after: isoDay(today) } },
        { property: 'Дата', date: { on_or_before: isoDay(end) } },
      ] },
      [{ property: 'Дата', direction: 'ascending' }],
    );
    return pages.map(parseService);
  });
}

function loadServicesLite() {
  return cached('servicesLite', 10 * 60e3, async () => {
    const pages = await queryAll(DB.services);
    return new Map(pages.map((pg) => {
      const s = parseService(pg);
      return [s.id, { date: s.date, name: s.name, leadIds: s.leadIds }];
    }));
  });
}

/* ---------- Відповіді ---------- */
async function currentPerson(req) {
  const user = authUser(req);
  if (!user) return { error: [401, { error: 'unauthorized' }] };
  const people = await loadPeople();
  const me = [...people.values()].find((p) => p.chatId === String(user.id));
  if (!me) return { error: [403, { error: 'not_registered', chatId: String(user.id) }] };
  return { me, people, isAdmin: adminIds().includes(String(user.id)) };
}

function toClient(svc, ctx, rowsByService) {
  const { me, people, isAdmin } = ctx;
  const mine = svc.leadIds.includes(me.id) || svc.roles.some((r) => r.ids.includes(me.id));
  const isLead = svc.leadIds.includes(me.id);
  const canEdit = isLead || isAdmin;
  const names = (ids) => ids.map((i) => (people.get(i) || {}).name).filter(Boolean);
  const out = {
    id: svc.id, date: svc.date, name: svc.name, type: svc.type,
    lead: names(svc.leadIds), leadIds: svc.leadIds.filter((i) => people.get(i) && people.get(i).name), mine, isLead, canEdit,
  };
  if (!mine && !isAdmin) return out;
  const known = (ids) => ids.filter((i) => people.get(i) && people.get(i).name);
  out.lineup = svc.roles.map((r) => ({ role: r.role, names: names(r.ids), ids: known(r.ids), lead: r.role === 'Вокал' ? names(r.ids.filter((i) => svc.leadIds.includes(i))) : [] }))
    .filter((r) => r.names.length);
  let published = svc.published;
  if (!published) {
    const rows = (rowsByService.get(svc.id) || []).slice().sort((a, b) => a.created.localeCompare(b.created));
    published = rows.length ? rows.map((r) => ({ t: 'song', id: r.song, k: r.key, v: names(r.leads)[0] || '' })) : null;
  }
  out.vocalists = [...new Set([...names(svc.leadIds), ...names((svc.roles.find((r) => r.role === 'Вокал') || { ids: [] }).ids)])];
  out.published = cleanItems(published);
  if (canEdit) {
    out.draft = svc.draft ? cleanItems(svc.draft) : out.published;
    out.hasChanges = JSON.stringify(out.draft) !== JSON.stringify(out.published);
  }
  return out;
}

const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};

module.exports = {
  DB, ROLES, notion, queryAll, text, rel, nid, richText, parseJson, cached, invalidate,
  verifyInitData, authUser, adminIds, loadPeople, loadSongs, loadSetRows, loadWindow, loadServicesLite,
  currentPerson, toClient, groupBy, noteKey, parseDur, cleanItems, ytUrl, touchVisit,
};
