/* Структура пісні (як у MultiTracks): розбір, зіставлення із секціями тексту й акордів. Працює в браузері й у Node (тести). */
(function (root) {
  const CODES = [
    ['Intro', 'I'], ['Verse', 'V'], ['Pre Chorus', 'Pc'], ['Post Chorus', 'Po'], ['Chorus', 'C'], ['Refrain', 'Rf'], ['Bridge', 'B'],
    ['Breakdown', 'Bd'], ['Instrumental', 'Is'], ['Interlude', 'It'], ['Outro', 'O'], ['Ending', 'E'], ['Turnaround', 'Ta'],
    ['Tag', 'Tg'], ['Vamp', 'Vp'], ['Solo', 'S'], ['Rap', 'Rp'],
  ];
  const LABEL = { I: 'Інтро', V: 'Куплет', Pc: 'Перед приспівом', Po: 'Після приспіву', C: 'Приспів', Rf: 'Рефрен', B: 'Бридж', Bd: 'Брейкдаун', Is: 'Інструментал', It: 'Програш', O: 'Аутро', E: 'Фінал', Ta: 'Перехід', Tg: 'Тег', Vp: 'Вамп', S: 'Соло', Rp: 'Реп' };
  const INSTR = new Set(['I', 'Is', 'It', 'E', 'Ta', 'Bd', 'S', 'Vp']);
  const TOKEN = /^(Pc|Po|Rf|Rp|Bd|Is|It|Ta|Tg|Vp|I|V|C|B|O|E|S)(\d*)(?:\*(\d+))?$/;

  // Назва секції MultiTracks («Verse 2», «Pre Chorus») → канонічний код («V2», «Pc»)
  function fromMT(name) {
    const m = /^(Intro|Verse|Pre Chorus|Post Chorus|Chorus|Refrain|Bridge|Breakdown|Instrumental|Interlude|Outro|Ending|Turnaround|Tag|Vamp|Solo|Rap)\s*(\d+)?\s*$/i.exec(String(name).trim());
    if (!m) return null;
    const hit = CODES.find((c) => c[0].toLowerCase() === m[1].toLowerCase());
    return hit[1] + (m[2] || '');
  }
  // [['I','Intro'],['Is','Instrumental'],['Is','Instrumental'],…] → «I Is*2 V1 …»: однакові підряд стискаються
  function fromMap(map) {
    const codes = map.map(([, name]) => fromMT(name)).filter(Boolean), out = [];
    for (const c of codes) { const last = out[out.length - 1]; if (last && last.c === c) last.n++; else out.push({ c, n: 1 }); }
    return out.map((x) => (x.n > 1 ? `${x.c}*${x.n}` : x.c)).join(' ');
  }
  // «I Is*2 V1» → плаский список кроків [{code,type,n}]
  function parse(str) {
    const out = [];
    for (const w of String(str || '').split(/[\s,;]+/).filter(Boolean)) {
      const m = TOKEN.exec(w); if (!m) continue;
      for (let i = 0; i < (+m[3] || 1); i++) out.push({ code: m[1] + m[2], type: m[1], n: +m[2] || 0 });
    }
    return out;
  }
  // Кружечки: однакові підряд зводяться в один з лічильником
  function chips(steps) {
    const out = [];
    steps.forEach((s, k) => { const l = out[out.length - 1]; if (l && l.code === s.code) l.count++; else out.push({ code: s.code, type: s.type, n: s.n, count: 1, from: k }); });
    return out;
  }
  const label = (s) => LABEL[s.type] + (s.n ? ' ' + s.n : '');

  // Тип і номер із заголовка секції тексту/акордів: «Куплет 2:», «Перед приспів», «Pre-chorus», «Бридж»
  function headType(h) {
    let t = String(h || '').toLowerCase().replace(/[:.\-–—_()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const lead = /^(\d+)\s+/.exec(t);                      // «1 куплет»
    if (lead) t = t.slice(lead[0].length);
    const num = lead ? lead[1] : (/(\d+)\s*$/.exec(t) || [])[1];
    const has = (re) => re.test(t);
    let type = null;
    if (has(/^(перед ?приспів|пре ?приспів|попередн\w* приспів|pre ?chorus)/)) type = 'Pc';
    else if (has(/^(після ?приспів|пост ?приспів|post ?chorus)/)) type = 'Po';
    else if (has(/^(приспів|chorus|прип)/)) type = 'C';
    else if (has(/^(рефрен|refrain)/)) type = 'Rf';
    else if (has(/^(куплет|вірш|verse)/)) type = 'V';
    else if (has(/^(бридж|міст|bridge)/)) type = 'B';
    else if (has(/^(аутро|outro|кода|завершення)/)) type = 'O';
    else if (has(/^(інтро|intro|вступ)/)) type = 'I';
    else if (has(/^(інструментал|instrumental)/)) type = 'Is';
    else if (has(/^(програш|interlude|інтерлюдія)/)) type = 'It';
    else if (has(/^(брейкдаун|breakdown)/)) type = 'Bd';
    else if (has(/^(тег|tag)/)) type = 'Tg';
    else if (has(/^(фінал|ending|закінчення)/)) type = 'E';
    else if (has(/^(вамп|vamp)/)) type = 'Vp';
    else if (has(/^(соло|solo)/)) type = 'S';
    else if (has(/^(перехід|turnaround)/)) type = 'Ta';
    else if (has(/^(реп|rap)/)) type = 'Rp';
    return type ? { type, n: +num || 0 } : null;
  }

  // Зіставляє кроки структури із секціями (масив заголовків). Повертає [{step,label,sec,repeat,instr}]; sec = -1, якщо тексту немає
  function plan(steps, headings) {
    const info = headings.map(headType), seen = new Set(), occ = {};
    const out = steps.map((st) => {
      const same = info.map((x, i) => (x && x.type === st.type ? i : -1)).filter((i) => i >= 0);
      let sec = -1;
      if (same.length) {
        if (st.n) { sec = same.find((i) => info[i].n === st.n); if (sec === undefined) sec = same.find((i) => !info[i].n); }
        else {
          const unnum = same.find((i) => !info[i].n);
          if (unnum !== undefined && same.length === 1) sec = unnum;
          else { const idx = (occ[st.type + '#'] = (occ[st.type + '#'] || 0)); sec = same[Math.min(idx, same.length - 1)]; occ[st.type + '#']++; }
        }
        if (sec === undefined) sec = -1;
      }
      const repeat = sec >= 0 && seen.has(sec);
      if (sec >= 0) seen.add(sec);
      return { step: st, label: label(st), sec, repeat, instr: INSTR.has(st.type) };
    });
    const unused = headings.map((_, i) => i).filter((i) => !seen.has(i));
    return { items: out, unused };
  }

  const api = { fromMT, fromMap, parse, chips, label, headType, plan, LABEL, INSTR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Struct = api;
})(typeof window !== 'undefined' ? window : globalThis);
