'use strict';
/* Адмінка: завантажується лише адміну, коли він відкриває вкладку «Адмін». Решта команди цього файлу не отримує. */
(function(){var st=document.createElement('style');st.textContent=".bar{display:block;height:5px;border-radius:3px;background:var(--surface2);margin:6px 0 4px;overflow:hidden}\n.bar i{display:block;height:100%;background:var(--accent);border-radius:3px}\ndetails.gap summary{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;font-weight:600;cursor:pointer;list-style:none}\ndetails.gap summary::-webkit-details-marker{display:none}\ndetails.gap summary b{font-family:var(--font-mono);color:var(--ink2)}\n.gaplist{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 14px}\n.chip2{border:1px solid var(--line);background:var(--surface2);color:var(--ink);border-radius:99px;padding:5px 10px;font-size:13px}";document.head.appendChild(st)})();
function ago(iso,now){
  if(!iso)return 'ще не заходив(ла)';
  var ms=now-Date.parse(iso),m=Math.floor(ms/6e4),h=Math.floor(m/60),d=Math.floor(h/24);
  if(m<2)return 'щойно';if(m<60)return m+' хв тому';if(h<24)return h+' год тому';
  if(d<2)return 'вчора';if(d<31)return d+' дн тому';return 'понад місяць тому'}
function adminSvc(A){
  var now=Date.parse(A.now);
  if(!A.services.length)return '<div class="card"><div class="empty"><b>Служінь на 30 днів немає</b>Додайте їх у Notion.</div></div>';
  var sl={empty:['Сет-лист порожній','warn'],draft:['Лише чернетка','warn'],changed:['Є неопубліковані зміни','warn'],published:['Опубліковано','']};
  return '<div class="card"><h2>Найближчі служіння</h2><div class="list">'+A.services.map(function(u){
    var st=sl[u.setlist.state],lead=u.lead.length?'<span class="vline">'+avatar(u.leadIds[0],u.lead[0],'s')+esc(u.lead.join(', '))+'</span>':'<span class="pill warn" style="padding:2px 8px">ліда нема</span>';
    return '<button class="row" data-svc="'+u.id+'"><span class="rowmain"><span class="rowtitle">'+fmt(u.date).slice(0,5)+' · '+wds(u.date)+' <span class="voc">'+esc(u.type||'')+'</span></span><br><span class="rowsub rs">'+lead+'<span class="pill'+(st[1]?' '+st[1]:'')+'" style="padding:2px 8px">'+st[0]+(u.setlist.songs&&u.setlist.state!=='empty'?' · '+u.setlist.songs:'')+'</span></span>'+(u.missing.length?'<span class="rowsub" style="display:block;margin-top:4px">Немає: '+u.missing.map(esc).join(', ')+'</span>':'')+'</span><span class="chev">›</span></button>'}).join('')+'</div></div>'}
function adminReq(A){
  if(!A.requests.length)return '<div class="card"><div class="empty"><b>Нових запитів немає</b>Коли хтось відкриє застосунок, не маючи доступу, він з\'явиться тут.</div></div>';
  var now=Date.parse(A.now);
  return '<div class="card"><h2>Хочуть доступ</h2><div class="list">'+A.requests.map(function(r){
    return '<div class="row" style="flex-wrap:wrap"><span class="rowmain"><span class="rowtitle">'+esc(r.name)+'</span><br><span class="rowsub">'+(r.nick?'@'+esc(r.nick)+' · ':'')+'ID '+esc(r.tgId)+' · '+r.attempts+' '+(r.attempts===1?'спроба':'спроб')+' · '+esc(ago(r.last,now))+'</span></span><span class="btnrow" style="flex:0 0 100%;margin-left:0"><button class="btn" data-req="approve" data-id="'+r.id+'"'+(S.busy?' disabled':'')+'>Додати в базу</button><button class="btn ghost" data-req="reject" data-id="'+r.id+'"'+(S.busy?' disabled':'')+'>Відхилити</button></span></div>'}).join('')+'</div></div><div class="note">«Додати в базу» створює людину в «Люди» з її іменем з Telegram. Роль і справжнє ім\'я потім можна поправити в Notion.</div>'}
function adminGaps(A){
  if(!A.gaps.length)return '<div class="card"><div class="empty"><b>Усе заповнено</b>Бракуючих даних не знайдено.</div></div>';
  return A.gaps.map(function(g){
    return '<details class="card gap"><summary><span>'+esc(g.title)+'</span><b>'+g.items.length+'</b></summary><div class="gaplist">'+g.items.map(function(i){return g.people?'<span class="chip2">'+esc(i.title)+'</span>':'<button class="chip2" data-song="'+i.id+'">'+esc(i.title)+'</button>'}).join('')+'</div></details>'}).join('')
   +'<div class="note">Текст пісні тут не перевіряється, лише акорди. Архівні пісні не враховуються.</div>'}
function adminAct(A){
  var now=Date.parse(A.now);
  return '<div class="card"><h2>Хто й коли заходив</h2><div class="list">'+A.people.map(function(p){
    var fresh=p.lastSeen&&now-Date.parse(p.lastSeen)<864e5,week=p.lastSeen&&now-Date.parse(p.lastSeen)<7*864e5;
    var when=p.lastSeen?new Date(p.lastSeen).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    return '<div class="row" style="'+(p.active?'':'opacity:.55')+'"><span class="ava-wrap">'+avatar(p.id,p.name,'l')+'</span><span class="rowmain"><span class="rowtitle">'+esc(p.name)+(p.active?'':' <span class="voc">(неактивний)</span>')+'</span><br><span class="rowsub">'+(p.registered?esc(ago(p.lastSeen,now))+(when?' · '+when:''):'немає chat_id')+'</span></span><span class="dotc" style="border-color:'+(fresh?'var(--ok)':week?'var(--warn)':'var(--line)')+(fresh?';background:var(--ok)':'')+'"></span></div>'}).join('')+'</div></div><div class="note">Фіксується відкриття застосунку, не частіше за раз на 10 хвилин. Дані ведуться від моменту запуску цієї функції.</div>'}
function weeksAgo(d,now){var w=Math.floor((now-Date.parse(d))/6048e5);return w<1?'цього тижня':w+' тиж тому'}
function adminSongs(A){
  var r=A.rep,now=Date.parse(A.now),max=r.top.length?r.top[0].n:1;
  var sum='<div><span class="pill"><span class="dot"></span>За '+r.days+' днів: '+r.services+' служінь · у середньому '+r.avgSongs+' пісні</span></div>';
  var top=r.top.length?'<div class="card"><h2>Найчастіше грали</h2><div class="list">'+r.top.map(function(x,i){return '<button class="row" data-song="'+x.id+'"><span class="num">'+(i+1)+'</span><span class="rowmain"><span class="rowtitle">'+esc(x.title)+'</span><br><span class="bar"><i style="width:'+Math.round(x.n/max*100)+'%"></i></span></span><span class="key">'+x.n+'×</span></button>'}).join('')+'</div></div>':'';
  var old=r.old.length?'<div class="card"><h2>Давно не грали</h2><div class="list">'+r.old.map(function(x){return '<button class="row" data-song="'+x.id+'"><span class="rowmain"><span class="rowtitle">'+esc(x.title)+'</span></span><span class="rowsub">'+weeksAgo(x.last,now)+'</span><span class="chev">›</span></button>'}).join('')+'</div></div>':'';
  var nv=r.never.length?'<details class="card gap"><summary><span>Жодного разу не грали</span><b>'+r.never.length+'</b></summary><div class="gaplist">'+r.never.map(function(x){return '<button class="chip2" data-song="'+x.id+'">'+esc(x.title)+'</button>'}).join('')+'</div></details>':'';
  return sum+top+old+nv+'<div class="note">Рахуються минулі служіння за збереженими сет-лістами. «Давно» означає понад 8 тижнів. Архівні пісні не враховуються.</div>'}
function adminTeam(A){
  var m=A.team.members,max=m.reduce(function(n,p){return Math.max(n,p.served)},1);
  return '<div class="card"><h2>За '+A.team.days+' днів</h2><div class="list">'+m.map(function(p){
    return '<div class="row" style="'+(p.active?'':'opacity:.55')+'"><span class="ava-wrap">'+avatar(p.id,p.name,'l')+'</span><span class="rowmain"><span class="rowtitle">'+esc(p.name)+'</span><br><span class="bar"><i style="width:'+Math.round(p.served/max*100)+'%"></i></span><span class="rowsub">служив(ла) '+p.served+' · вів '+p.led+' · співав(ла) '+p.sang+' '+(p.sang===1?'пісню':'пісень')+'</span></span></div>'}).join('')+'</div></div><div class="note">Служив(ла) — був(ла) у складі на служінні. Вів — лід. Співав(ла) — вокаліст пісні в сет-листі. Старі сет-лісти не містять вокалістів окремих пісень, тому там рахується лід служіння.</div>'}
function viewAdminReal(){
  var A=S.admin;
  if(!A)return '<div class="center"><div><div class="spin"></div>Завантаження…</div></div>';
  if(A.err)return '<div class="pad"><div class="card"><div class="empty"><b>Не вдалося завантажити</b>'+esc(A.err)+'</div></div></div>';
  var now=Date.parse(A.now),wk=A.people.filter(function(p){return p.lastSeen&&now-Date.parse(p.lastSeen)<7*864e5}).length;
  var t=S.adminTab||'svc',bad=A.services.filter(function(u){return!u.lead.length||u.setlist.state!=='published'}).length;
  var tabs=[['svc','Служіння',bad],['req','Доступ',A.requests.length],['gap','Дані',A.gaps.reduce(function(n,g){return n+g.items.length},0)],['songs','Репертуар',0],['team','Команда',0],['act','Активність',0]];
  return '<div class="chips" role="tablist">'+tabs.map(function(x){return '<button data-atab="'+x[0]+'" aria-pressed="'+(t===x[0])+'">'+x[1]+(x[2]?' · '+x[2]:'')+'</button>'}).join('')+'</div><div class="pad">'
   +(t==='svc'?adminSvc(A):t==='req'?adminReq(A):t==='gap'?adminGaps(A):t==='songs'?adminSongs(A):t==='team'?adminTeam(A):'<div><span class="pill"><span class="dot"></span>За 7 днів заходили: '+wk+' з '+A.people.length+'</span></div>'+adminAct(A))+'</div>'}
function loadAdmin(keep){if(!keep)S.admin=null;api('/api/admin').then(function(r){S.admin=r;render()}).catch(function(e){S.admin={err:(e.data&&e.data.message)||'Спробуйте ще раз'};render()})}
document.addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;var d=b.dataset;
  if(d.atab){S.adminTab=d.atab;render();return}
  if(d.req){S.busy=true;render();api('/api/admin',{method:'POST',body:{action:d.req,id:d.id}}).then(function(){S.busy=false;toast(d.req==='approve'?'Додано в базу':'Відхилено');loadAdmin(true)}).catch(function(e){S.busy=false;toast('Не вдалося: '+((e.data&&e.data.message)||e.message))});return}
});
