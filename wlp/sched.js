/* WLP 일일 스케줄 (종이 스케줄표 대신)
   - index.html (선생님 M → 스케줄): 내 하루 06~23시, 칸 누르고 넣기, 완료·노쇼·취소, 지난주 같은 요일 불러오기
   - center.html (센터 → 일일 스케줄): 선생님 전원 × 06~22시 한 장, 근무시간 음영, 시간별 동시 수업, 인쇄
   서버 테이블: wlp_schedule (wlp-schema-5.sql) */

const SCH_H0 = 6, SCH_H1 = 22;                       // 06시 ~ 22시 칸 (22:30 시작까지)
const SCH_KIND = ['PT', 'OT1', 'OT2', '상담', '개인운동', '기타'];
const SCH_KC = { PT: '#B45309', OT1: '#1D4ED8', OT2: '#1D4ED8', 상담: '#7C3AED', 개인운동: '#166534', 기타: '#57534E' };
const schEsc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const schToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const schNowMin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() };
const schHM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const schAdd = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
const schLabel = day => { const d = new Date(day + 'T00:00:00Z'); return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 (' + '일월화수목금토'[d.getUTCDay()] + ')' };
function schToast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600) }
function schErr(e) { return (e && (e.message || e.details)) || '저장하지 못했어요' }
const SC_ = () => (S.sc || (S.sc = { day: schToday(), items: [], staff: [], kf: '전체', loaded: null }));

/* ---------- 데이터 ---------- */
function schDemo(day) {
  const st = [{ user_id: 'demo-tr', name: '위성경', sheet_name: '성경', shift_from: 360, shift_to: 900, break_at: 780 }, { user_id: 't2', name: '노진용', shift_from: 360, shift_to: 900, break_at: 780 },
    { user_id: 't3', name: '김지원', shift_from: 780, shift_to: 1320, break_at: 780 }, { user_id: 't4', name: '김이규', shift_from: 780, shift_to: 1320, break_at: 780 },
    { user_id: 't5', name: '조범운', shift_from: 780, shift_to: 1320, break_at: 780 }, { user_id: 't6', name: '동주', shift_from: 720, shift_to: 1260, break_at: 780 }];
  const N = ['김OO', '이OO', '박OO', '최OO', '정OO', '윤OO', '한OO'], it = []; let id = 1;
  st.forEach((s, k) => { for (let m = s.shift_from; m < s.shift_to; m += 60) { if (m === s.break_at) continue; const r = (m / 60 + k * 3 + day.charCodeAt(9)) % 5; if (r < 2) continue;
    it.push({ id: id++, staff_id: s.user_id, day, start_min: m + (r === 4 ? 30 : 0), kind: r === 3 ? 'OT1' : 'PT', member_name: N[(m / 60 + k) % N.length], status: m < schNowMin() - 60 && day <= schToday() ? (r === 4 ? '노쇼' : '완료') : '예정' }) } });
  return { staff: st, items: it };
}
async function schLoad(all) {
  const sc = SC_();
  if (DEMO || !sb) { const d = schDemo(sc.day); sc.staff = d.staff; sc.items = all ? d.items : d.items.filter(x => x.staff_id === 'demo-tr'); sc.loaded = sc.day; render(); return }
  const q = sb.from('wlp_schedule').select('*').eq('day', sc.day).order('start_min');
  const [r, s] = await Promise.all([all ? q : q.eq('staff_id', schMe()), sb.rpc('wlp_sched_staff')]);
  if (r.error) { schToast(schErr(r.error)); return }
  sc.items = r.data || []; sc.staff = s.error ? [] : (s.data || []); sc.loaded = sc.day; render();
}
function schLater(all) { const sc = SC_(); if (sc.loading === sc.day) return; sc.loading = sc.day; setTimeout(() => schLoad(all).finally(() => { sc.loading = null }), 0) }
function schMe() { return DEMO ? 'demo-tr' : (S.uid || (S.me && S.me.uid)) }
function schGo(day, all) { const sc = SC_(); sc.day = day; sc.open = null; sc.add = null; schLoad(all) }
// 다른 앱에 갔다 오거나 자정이 지나면 오늘로
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' || typeof S === 'undefined' || !S.sc) return; if (S.sc.wasToday && S.sc.day !== schToday()) { S.sc.day = schToday() } if (schOn()) schLoad(schAll()) });
setInterval(() => { if (typeof S !== 'undefined' && S.sc && schOn()) { if (S.sc.day === schToday() || S.sc.wasToday) { S.sc.day = schToday() } if (schAll()) schLoad(true); else render() } }, 60000);
function schOn() { return (S.scr === 'trainer' && S.tr && S.tr.tab === 'sched') || (S.tab === 'sched') }
function schAll() { return S.tab === 'sched' }

/* ---------- 선생님: 내 하루 ---------- */
function vTrSched() {
  const sc = SC_(); if (sc.loaded !== sc.day) { schLater(false); return '<div class="wrap"><p class="sub">불러오는 중…</p></div>' }
  sc.wasToday = sc.day === schToday();
  const me = sc.staff.find(s => s.user_id === schMe()) || {}, its = sc.items.filter(x => x.staff_id === schMe()), today = sc.day === schToday(), now = schNowMin();
  const cnt = k => its.filter(x => x.status === k).length, live = its.filter(x => x.status !== '취소');
  const rows = []; for (let h = SCH_H0; h <= SCH_H1; h++) {
    const m0 = h * 60, inShift = me.shift_from == null || (m0 >= me.shift_from && m0 < me.shift_to), brk = me.break_at === m0, cur = today && now >= m0 && now < m0 + 60;
    const here = its.filter(x => x.start_min >= m0 && x.start_min < m0 + 60);
    rows.push(`<div class="schr${cur ? ' now' : ''}" style="${inShift ? '' : 'opacity:.55'}"><span class="scht">${String(h).padStart(2, '0')}시</span><div class="schc">${brk && !here.length ? '<span class="sub">휴게</span>' : ''}
      ${here.map(x => `<button class="schi ${x.status}" data-a="schOpen" data-v="${x.id}"><b style="color:${SCH_KC[x.kind]}">${x.kind}</b> ${schEsc(x.member_name || '')}${x.start_min % 60 ? ' <span class="sub">:30</span>' : ''}${x.status !== '예정' ? ' · ' + x.status : ''}</button>`).join('')}
      <button class="schadd" data-a="schAdd" data-v="${m0}" aria-label="${h}시에 넣기">+</button></div></div>`);
  }
  let sheet = '';
  if (sc.add) sheet = schSheet(sc.add);
  else if (sc.open) { const x = its.find(i => i.id === sc.open); if (x) sheet = schSheet(x) }
  return `<div class="wrap" style="gap:10px">
  <div class="row" style="justify-content:space-between"><button class="btn ghost sm" data-a="schDay" data-v="-1">◀</button><div style="text-align:center"><b style="font-size:16px">${schLabel(sc.day)}</b>${today ? '<br><span class="sub">오늘</span>' : `<br><button class="link" data-a="schToday">오늘로</button>`}</div><button class="btn ghost sm" data-a="schDay" data-v="1">▶</button></div>
  <div class="row" style="gap:6px;flex-wrap:wrap"><span class="sub" style="flex:1">${me.shift_from != null ? '근무 ' + schHM(me.shift_from) + '~' + schHM(me.shift_to) + (me.break_at != null ? ' · 휴게 ' + schHM(me.break_at) : '') : '근무시간 미설정'}</span><button class="link" data-a="schShiftMe">근무시간</button><input type="date" data-ch="schDate" value="${sc.day}" style="width:auto;min-height:34px"></div>
  ${sc.shiftEdit ? schShiftForm(me, false) : ''}
  <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">${[['수업', live.length], ['완료', cnt('완료')], ['노쇼', cnt('노쇼')], ['취소', cnt('취소')]].map(k => `<div class="card" style="padding:8px;align-items:center;gap:0"><b style="font-size:18px">${k[1]}</b><span class="sub">${k[0]}</span></div>`).join('')}</div>
  ${sheet}
  <div class="card" style="padding:6px 8px;gap:0">${rows.join('')}</div>
  <button class="btn ghost" data-a="schCopy">지난주 ${'일월화수목금토'[new Date(sc.day + 'T00:00:00Z').getUTCDay()]}요일 PT 불러오기</button></div>`;
}
function schSheet(x) {
  const isNew = !x.id, sc = SC_(), m0 = Math.floor(x.start_min / 60) * 60;
  const otc = schOtCands(), ots = otc.slice(0, 4);
  const names = [...new Set(((S.tr && S.tr.list) || []).map(m => m.name).concat(otc.map(c => c.name)).filter(Boolean))];
  const f = sc.form || (sc.form = { start: x.start_min, kind: x.kind || 'PT', name: x.member_name || '', ot: x.ot_id || null, memo: x.memo || '' });
  return `<div class="card warm" style="gap:8px"><div class="row" style="justify-content:space-between"><p class="h">${isNew ? '새 일정' : '일정'} · ${schHM(f.start)}</p><button class="link" data-a="schClose">닫기</button></div>
  <div class="row wrapx">${[m0, m0 + 30].map(m => `<button class="chip${f.start === m ? ' on' : ''}" data-a="schStart" data-v="${m}">${schHM(m)}</button>`).join('')}</div>
  <div class="row wrapx">${SCH_KIND.map(k => `<button class="chip${f.kind === k ? ' on' : ''}" data-a="schKind" data-v="${k}">${k}</button>`).join('')}</div>
  ${/OT/.test(f.kind) && otc.length ? `<p class="sub">${f.kind === 'OT1' ? '첫 OT 기다리는 분' : 'OT1 끝난 분'} · 최근 2달</p><div class="row wrapx">${ots.map(c => `<button class="chip${f.ot === c.id ? ' on' : ''}" data-a="schOt" data-v="${c.id}">${schEsc(c.name)}${c.status === '조율 완료' ? ' · 조율됨' : ''}</button>`).join('')}</div>${otc.length > 4 ? `<p class="sub" style="font-size:11px">그 밖에 ${otc.length - 4}명은 아래 이름 칸에 치면 나와요.</p>` : ''}` : ''}
  <input id="schName" type="text" list="schNames" placeholder="회원 이름" value="${schEsc(f.name)}"><datalist id="schNames">${names.map(n => `<option value="${schEsc(n)}">`).join('')}</datalist>
  <input id="schMemo" type="text" placeholder="메모 (선택)" value="${schEsc(f.memo)}">
  ${isNew ? '' : `<div class="row wrapx">${['예정', '완료', '노쇼', '취소'].map(s => `<button class="chip${x.status === s ? ' on' : ''}" data-a="schStatus" data-v="${s}">${s}</button>`).join('')}</div>`}
  <div class="row"><button class="btn" style="flex:2" data-a="schSave">${isNew ? '넣기' : '고쳐 저장'}</button>${isNew ? '' : '<button class="btn ghost" style="flex:1;color:#B91C1C" data-a="schDel">지우기</button>'}</div>
  ${!isNew && x.ot_id ? '<p class="sub" style="font-size:11px">OT 연결: 완료를 누르면 OT 현황의 진행도 같이 바뀌어요.</p>' : ''}</div>`;
}
// OT1: 아직 첫 OT 전(응답 대기·연락 중·조율 완료) / OT2: OT1 끝난 분. 최근 2달 등록만, 조율된 분 먼저
function schOtCands() {
  const f = SC_().form || {}, now = new Date(Date.now() + 9 * 3600e3), cur = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const want = f.kind === 'OT2' ? ['OT1 완료'] : ['조율 완료', '연락 중', '응답 대기'];
  return ((S.tr && S.tr.cases) || []).filter(c => want.includes(c.status) && (!c.reg_y || c.reg_y * 12 + c.reg_m >= cur - 1))
    .sort((a, b) => want.indexOf(a.status) - want.indexOf(b.status) || (b.id - a.id));
}
function schShiftForm(s, center) {
  const opt = (sel, from, to, step, none) => (none ? `<option value=""${sel == null ? ' selected' : ''}>없음</option>` : '') + Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step).map(m => `<option value="${m}"${sel === m ? ' selected' : ''}>${schHM(m)}</option>`).join('');
  return `<div class="card" style="gap:6px;padding:10px"><p class="h" style="font-size:13px">${schEsc(s.name || '')} 근무시간</p><div class="row" style="gap:4px;flex-wrap:wrap;align-items:center">
    <select id="shF" style="width:auto">${opt(s.shift_from == null ? 360 : s.shift_from, 360, 1380, 30)}</select>~<select id="shT" style="width:auto">${opt(s.shift_to == null ? 900 : s.shift_to, 420, 1440, 30)}</select>
    휴게 <select id="shB" style="width:auto">${opt(s.break_at, 360, 1380, 60, true)}</select>${center ? ` 순서 <input id="shO" type="number" value="${s.sched_order || ''}" style="width:60px;min-height:34px">` : ''}
    <button class="btn sm" data-a="schShiftSave" data-v="${s.user_id}">저장</button></div></div>`;
}

/* ---------- 센터: 한 장 ---------- */
function vCenterSched() {
  const sc = SC_(); if (sc.loaded !== sc.day) { schLater(true); return '<p class="sub">불러오는 중…</p>' }
  sc.wasToday = sc.day === schToday();
  const today = sc.day === schToday(), now = schNowMin(), H = []; for (let h = SCH_H0; h <= SCH_H1; h++) H.push(h);
  const KF = { '전체': () => true, 'PT': x => x.kind === 'PT', 'OT': x => /OT/.test(x.kind), '상담·기타': x => !['PT', 'OT1', 'OT2'].includes(x.kind) };
  // 센터 관리자 계정(서버관리자 등)은 근무시간을 정하지 않았으면 한 장에서 뺌 (그 계정 일정도 숫자에서 뺌)
  const hide = new Set(sc.staff.filter(s => s.role === 'center' && s.shift_from == null).map(s => s.user_id));
  const staff = sc.staff.filter(s => !hide.has(s.user_id));
  const items = sc.items.filter(x => !hide.has(x.staff_id)).filter(KF[sc.kf]), live = items.filter(x => x.status !== '취소');
  const ids = new Set(sc.staff.map(s => s.user_id)); items.forEach(x => { if (!ids.has(x.staff_id)) { ids.add(x.staff_id); const s = { user_id: x.staff_id, name: '(직원)' }; sc.staff.push(s); staff.push(s) } });
  const rows = staff.filter(s => s.shift_from != null || items.some(x => x.staff_id === s.user_id) || sc.showAll).map(s => {
    const mine = items.filter(x => x.staff_id === s.user_id);
    return `<tr><th class="nm"><button class="link" data-a="schShiftOf" data-v="${s.user_id}" style="text-align:left">${schEsc(s.name)}</button><span>${s.shift_from != null ? (s.shift_from < 720 ? '오전 ' : '오후 ') + schHM(s.shift_from).slice(0, 2) + '~' + schHM(s.shift_to).slice(0, 2) : '근무 미설정'}</span><span>${mine.filter(x => x.status !== '취소').length}건</span></th>${H.map(h => {
      const m0 = h * 60, on = s.shift_from != null && m0 >= s.shift_from && m0 < s.shift_to, brk = s.break_at === m0, here = mine.filter(x => x.start_min >= m0 && x.start_min < m0 + 60);
      return `<td class="${on ? 'on' : ''}${brk ? ' brk' : ''}${today && now >= m0 && now < m0 + 60 ? ' cur' : ''}">${here.map(x => `<div class="ci ${x.status}"><b style="color:${SCH_KC[x.kind]}">${x.kind === 'PT' ? '' : x.kind + ' '}</b>${schEsc(x.member_name || x.kind)}${x.start_min % 60 ? '<i>:30</i>' : ''}${x.status === '노쇼' ? ' NS' : x.status === '완료' ? ' ✓' : ''}</div>`).join('')}</td>`
    }).join('')}</tr>`
  }).join('');
  const per = H.map(h => live.filter(x => x.start_min >= h * 60 && x.start_min < h * 60 + 60).length), mx = Math.max(0, ...per);
  const on = staff.filter(s => s.shift_from != null), none = on.filter(s => !sc.items.some(x => x.staff_id === s.user_id));
  const cnt = k => items.filter(x => x.status === k).length;
  const shiftOf = sc.shiftOf && sc.staff.find(s => s.user_id === sc.shiftOf);
  return `<div class="schbar noprint"><button class="ch" data-a="schDay" data-v="-1">◀</button><b style="font-size:16px;min-width:150px;text-align:center">${schLabel(sc.day)}</b><button class="ch" data-a="schDay" data-v="1">▶</button>
    ${today ? '<span class="sub">오늘</span>' : '<button class="ch" data-a="schToday">오늘로</button>'}<input type="date" data-ch="schDate" value="${sc.day}" style="width:auto;min-height:36px">
    <span style="flex:1"></span>${Object.keys(KF).map(k => `<button class="ch${sc.kf === k ? ' on' : ''}" data-a="schKf" data-v="${k}">${k}</button>`).join('')}
    <button class="ch" data-a="schRefresh">새로고침</button><button class="btn" data-a="schPrint">인쇄 (A4 가로)</button></div>
  <div class="kk schk noprint">${[['수업', live.length, ''], ['완료', cnt('완료'), 'color:#1F6F5C'], ['노쇼', cnt('노쇼'), 'color:#B91C1C'], ['취소', cnt('취소'), 'color:#6B6155'],
    ['가장 붐비는 시간', mx ? H.filter((h, i) => per[i] === mx).map(h => h + '시').join('·') + ' · ' + mx + '건' : '-', 'font-size:15px'], ['스케줄 안 쓴 선생님', none.length ? none.map(s => s.name).join(', ') : '없음', 'font-size:13px;' + (none.length ? 'color:#B45309' : '')]]
    .map(k => `<div class="kb"><b style="${k[2]}">${schEsc(k[1])}</b><span>${k[0]}</span></div>`).join('')}</div>
  ${shiftOf ? `<div class="noprint">${schShiftForm(shiftOf, true)}</div>` : ''}
  <div class="schsheet"><p class="schtitle">${sc.day.slice(0, 4)}년 ${schLabel(sc.day)} · 일일 스케줄</p><div style="overflow:auto"><table class="schg"><tr><th class="nm">선생님</th>${H.map(h => `<th>${String(h).padStart(2, '0')}시</th>`).join('')}</tr>${rows || `<tr><td colspan="${H.length + 1}" style="padding:20px">근무시간을 정한 선생님이 없어요. 아래 '전체 직원 보기'를 누르고 이름을 눌러 근무시간을 정해 주세요.</td></tr>`}
  <tr class="sum"><th class="nm">동시 수업</th>${per.map(n => `<td style="${n && n === mx ? 'background:#B45309;color:#fff' : ''}">${n || ''}</td>`).join('')}</tr></table></div>
  <p class="sub" style="font-size:11px">음영 = 근무시간 · 빗금 = 휴게 · ✓ 완료 · NS 노쇼 · 줄 그은 칸 = 취소 · :30 = 30분 시작</p></div>
  <div class="noprint" style="display:flex;gap:8px"><button class="ch" data-a="schShowAll">${sc.showAll ? '근무 중인 선생님만 보기' : '전체 직원 보기'}</button><span class="sub">선생님 이름을 누르면 근무시간·휴게·순서를 정해요. 스케줄은 선생님이 WLP 앱 M → 스케줄에서 써요(여기는 보기 전용).</span></div>`;
}

/* ---------- 동작 (index: RA, center: SA) ---------- */
const SCH_A = {
  schDay: (b, v) => schGo(schAdd(SC_().day, +v), schAll()),
  schToday: () => schGo(schToday(), schAll()),
  schRefresh: () => schLoad(true),
  schKf: (b, v) => { SC_().kf = v; render() },
  schShowAll: () => { SC_().showAll = !SC_().showAll; render() },
  schPrint: () => window.print(),
  schShiftOf: (b, v) => { const sc = SC_(); sc.shiftOf = sc.shiftOf === v ? null : v; render() },
  schShiftMe: () => { const sc = SC_(); sc.shiftEdit = !sc.shiftEdit; render() },
  schShiftSave: async (b, v) => {
    const g = id => (document.getElementById(id) || {}).value, f = +g('shF'), t = +g('shT'), br = g('shB') === '' ? null : +g('shB'), o = g('shO') ? +g('shO') : null, sc = SC_();
    if (t <= f) { schToast('끝나는 시간이 더 늦어야 해요'); return }
    const s = sc.staff.find(x => x.user_id === v);
    if (DEMO || !sb) { Object.assign(s, { shift_from: f, shift_to: t, break_at: br, sched_order: o }); sc.shiftOf = null; sc.shiftEdit = false; render(); return }
    const r = await sb.rpc('wlp_set_shift', { p_staff: v, p_from: f, p_to: t, p_break: br, p_order: o });
    if (r.error || (r.data && r.data.ok === false)) { schToast(r.error ? schErr(r.error) : '저장하지 못했어요'); return }
    sc.shiftOf = null; sc.shiftEdit = false; schToast('근무시간을 저장했어요'); schLoad(schAll());
  },
  schAdd: (b, v) => { const sc = SC_(); sc.open = null; sc.form = null; sc.add = { start_min: +v, kind: 'PT' }; render(); window.scrollTo(0, 0) },
  schOpen: (b, v) => { const sc = SC_(); sc.add = null; sc.form = null; sc.open = +v; render(); window.scrollTo(0, 0) },
  schClose: () => { const sc = SC_(); sc.add = null; sc.open = null; sc.form = null; render() },
  schStart: (b, v) => { schKeep(); SC_().form.start = +v; render() },
  schKind: (b, v) => { schKeep(); SC_().form.kind = v; render() },
  schOt: (b, v) => { schKeep(); const f = SC_().form, c = (S.tr.cases || []).find(x => x.id === +v); f.ot = +v; if (c) f.name = c.name; if (c && f.kind === 'PT') f.kind = 'OT1'; render() },
  schStatus: async (b, v) => { const sc = SC_(), x = sc.items.find(i => i.id === sc.open); if (!x) return; await schWrite({ id: x.id, status: v }, x); if (v === '완료' && x.ot_id && /OT/.test(x.kind)) schOtDone(x) },
  schSave: async () => {
    schKeep(); const sc = SC_(), f = sc.form;
    if (!f.name.trim() && ['PT', 'OT1', 'OT2'].includes(f.kind)) { schToast('회원 이름을 넣어 주세요'); return }
    if (/OT/.test(f.kind) && !f.ot && f.name.trim()) { const m = schOtCands().filter(c => c.name === f.name.trim()); if (m.length === 1) f.ot = m[0].id }
    const row = { start_min: f.start, kind: f.kind, member_name: f.name.trim() || null, ot_id: /OT/.test(f.kind) ? f.ot : null, memo: f.memo.trim() || null };
    if (sc.add) { row.staff_id = schMe(); row.day = sc.day; await schWrite(row, null) } else await schWrite(Object.assign({ id: sc.open }, row), sc.items.find(i => i.id === sc.open));
  },
  schDel: async () => {
    const sc = SC_(); if (!confirm('이 일정을 지울까요?')) return;
    if (DEMO || !sb) { sc.items = sc.items.filter(i => i.id !== sc.open) } else { const r = await sb.from('wlp_schedule').delete().eq('id', sc.open); if (r.error) { schToast(schErr(r.error)); return } sc.items = sc.items.filter(i => i.id !== sc.open) }
    sc.open = null; sc.form = null; render();
  },
  schCopy: async () => {
    const sc = SC_(); if (DEMO || !sb) { schToast('시험 모드: 지난주 불러오기는 서버에서만 돼요'); return }
    const r = await sb.rpc('wlp_sched_copy_week', { p_day: sc.day }); if (r.error) { schToast(schErr(r.error)); return }
    schToast('지난주에서 ' + ((r.data || {}).count || 0) + '건을 불러왔어요'); schLoad(false);
  }
};
function schKeep() { const sc = SC_(); if (!sc.form) return; const n = document.getElementById('schName'), m = document.getElementById('schMemo'); if (n) sc.form.name = n.value; if (m) sc.form.memo = m.value }
async function schWrite(row, old) {
  const sc = SC_(); row.updated_at = new Date().toISOString();
  if (DEMO || !sb) { if (old) Object.assign(old, row); else { row.id = Date.now(); row.status = '예정'; sc.items.push(row) } }
  else if (old) { const r = await sb.from('wlp_schedule').update(row).eq('id', old.id).select('*').single(); if (r.error) { schToast(schErr(r.error)); return } Object.assign(old, r.data) }
  else { const r = await sb.from('wlp_schedule').insert(row).select('*').single(); if (r.error) { schToast(schErr(r.error)); return } sc.items.push(r.data) }
  sc.items.sort((a, b) => a.start_min - b.start_min);
  if (!row.status) { sc.add = null; sc.open = null; sc.form = null }
  render();
}
async function schOtDone(x) {
  const st = x.kind === 'OT2' ? 'OT2 완료' : 'OT1 완료', d = SC_().day, md = +d.slice(5, 7) + '/' + +d.slice(8, 10);
  if (DEMO || !sb) return;
  const r = await sb.rpc('wlp_set_progress', { p_case: x.ot_id, p_status: st, p_date: md });
  if (!r.error) schToast('OT 현황도 ' + st + '로 바꿨어요');
}
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.ch === 'schDate' && e.target.value) schGo(e.target.value, schAll()) });
