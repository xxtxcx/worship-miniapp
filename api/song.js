'use strict';
const L = require('./_lib');

async function lyricsOf(pageId) {
  const blocks = [];
  let cursor;
  do {
    const r = await L.notion('GET', `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    blocks.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'paragraph') continue;
    const t = L.text(b.paragraph).trim();
    if (!t) continue;
    const [first, ...rest] = t.split('\n');
    if (rest.length && /^[^\n]{1,40}:\s*$/.test(first)) out.push({ h: first.replace(/:\s*$/, ''), t: rest.join('\n') });
    else out.push({ h: '', t });
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    const ctx = await L.currentPerson(req);
    if (ctx.error) return res.status(ctx.error[0]).json(ctx.error[1]);
    const id = L.nid(String(req.query.id || ''));
    if (!/^[0-9a-f]{32}$/.test(id)) return res.status(400).json({ error: 'bad_id' });
    const data = await L.cached(`song:${id}`, 5 * 60e3, async () => {
      const [page, lyrics, rows, services] = await Promise.all([
        L.notion('GET', `/pages/${id}`), lyricsOf(id), L.loadSetRows(), L.loadServicesLite(),
      ]);
      const history = rows.filter((r) => r.song === id && services.get(r.service))
        .map((r) => {
          const s = services.get(r.service);
          const lead = r.leads.map((i) => (ctx.people.get(i) || {}).name).filter(Boolean).join(', ');
          return { date: s.date, lead, key: r.key };
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
      return { chords: L.text(page.properties['Акорди']), lyrics, history };
    });
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server', message: String(e.message || e).slice(0, 300) });
  }
};
