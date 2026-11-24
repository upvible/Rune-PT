/* WLP 운동 기록 (단계별 블록 조립)
   - 단계마다 기본 블록 목록(DEF)이 있고, 트레이너가 회원 폰에서 특별 코드(config.js LAYOUT_CODE)를 넣으면
     블록을 켜고 끄고 순서를 바꿀 수 있음. 화면 구성은 그 기기에만 저장(서버 저장 안 함)
   - 기록 모양은 룬 PT 와 같음: {nm, sets:[{t,w,r,done,rpe,flow,sl}]}
   - index.html 보다 먼저 불러오지만, 안의 함수는 index.html 의 S·esc·addFb 등을 실행 시점에 씀 */

const REC_DEF = {
  3: ['week', 'routine', 'sets', 'flow', 'compare', 'check', 'note'],
  4: ['routine', 'bundle', 'sets', 'rpe', 'zones', 'compare', 'mission', 'dex', 'share'],
  5: ['cycle', 'cond', 'sets', 'rpe', 'slayer', 'warn', 'volume', 'cheer']
};
// 블록 이름표 (트레이너 화면 구성에서 씀)
const REC_BLOCKS = {
  week: '이번 주 달력', routine: '오늘 할 운동 고르기', bundle: '장소별 루틴 묶음 · 15분 버전', sets: '세트 기록',
  flow: '★ 몰입 세트 표시', rpe: '세트별 RPE', zones: '4색 강도 구간', compare: '지난번 → 오늘', check: '운동 끝 세 질문(어려움·자신감·통증)',
  note: '한 줄 일지', mission: '승급 미션(길 직접 고르기)', dex: '운동도감 추세 · 또래 비교', share: '이번 달 성적표 공유',
  cycle: '12주 주기 설계', cond: '오늘 몸 상태', slayer: '도전 세트(슬레이어)', warn: '회복 신호 알림', volume: '주간 볼륨 8주', cheer: '처음 시작한 회원 응원'
};
const REC_BUNDLE0 = { '헬스장': ['스쿼트', '랫풀다운', '플랭크'], '집': ['맨몸 스쿼트', '푸쉬업', '브릿지'], '출장': ['밴드 로우', '스플릿 스쿼트', '푸쉬업'] };

function recStage() { return Math.min(5, Math.max(3, S.view || S.stage || 3)) }
const LAYOUT_KEY = 'wlp-layout';
function devLayouts() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {} } catch (e) { return {} } }
function recLayout() { const st = recStage(); const L = devLayouts()[st]; return Array.isArray(L) && L.length ? L.filter(k => REC_BLOCKS[k]) : REC_DEF[st] }
const recOn = k => recLayout().includes(k);
function recPrefs() { return S.prefs || (S.prefs = {}) }
async function recSavePrefs(p) {
  S.prefs = Object.assign({}, recPrefs(), p); render();
  if (DEMO || !sb) return;
  const r = await sb.rpc('wlp_set_prefs', { p: p }); if (r.error) toast(sbErr(r.error));
}

/* ----- 기록 데이터 ----- */
function allSessions() { return S.sessions || [] } // loadMemberData 에서 WLP 기록 + 룬 PT 기록을 합쳐 둠
function lastItem(nm, beforeDate) {
  for (const s of allSessions()) { if (beforeDate && s.session_date >= beforeDate) continue; const it = (s.items || []).find(x => x && exName(x) === nm); if (it) return it }
  return null;
}
function tmplSets(nm) {
  const it = lastItem(nm, today());
  if (it && (it.sets || []).length) return it.sets.map(s => ({ t: s.t === 'W' ? 'W' : 'M', w: +s.w || 0, r: +s.r || 0, rpe: s.rpe || null, done: false, edited: false }));
  return [{ t: 'M', w: 0, r: 10, done: false, edited: false }, { t: 'M', w: 0, r: 10, done: false, edited: false }, { t: 'M', w: 0, r: 10, done: false, edited: false }];
}
const e1rm = s => (s.w || 0) * (1 + (s.r || 0) / 30);
function recNew(names) { return { items: names.filter(Boolean).map(nm => ({ nm, sets: tmplSets(nm), pd: null, se: null, vas: 0 })), cur: 0, cond: {}, note: '', alertSent: false } }
function recOpen() {
  const st = recStage(), p = recPrefs();
  const todayRow = (S.wk || []).find(w => w.session_date === today() && w.source === 'wlp');
  if (todayRow) { S.rec = { items: (todayRow.items || []).map(it => Object.assign({ pd: null, se: null, vas: 0 }, it, { sets: (it.sets || []).map(s => Object.assign({ edited: true }, s)) })), cur: 0, cond: (todayRow.extra || {}).cond || {}, note: '', id: todayRow.id, alertSent: !!(todayRow.extra || {}).alert }; S.rec.bundle = (todayRow.extra || {}).bundle; S.rec.short = !!(todayRow.extra || {}).short }
  else {
    let names = giftSlots().map(exName);
    if (st === 4 && recOn('bundle')) { const b = Object.assign({}, REC_BUNDLE0, p.bundles || {}); names = b['헬스장'] }
    if (!names.length) names = ((allSessions()[0] || {}).items || []).map(exName);
    S.rec = recNew(names.slice(0, 6)); S.rec.bundle = st === 4 ? '헬스장' : null;
  }
  S.scr = 'rec'; render(); window.scrollTo(0, 0);
}

/* ----- 블록 그리기 ----- */
const B = {};
B.week = () => {
  const d = new Date(Date.now() + 9 * 3600e3), dow = (d.getUTCDay() + 6) % 7, mon = new Date(d.getTime() - dow * 864e5), goal = recPrefs().weekGoal || 2;
  let cnt = 0;
  const days = ['월', '화', '수', '목', '금', '토', '일'].map((l, i) => { const ds = new Date(mon.getTime() + i * 864e5).toISOString().slice(0, 10), on = allSessions().some(x => x.session_date === ds); if (on) cnt++; return `<span class="day${on ? ' hl' : ''}"${ds === today() && !on ? ' style="outline:1.5px dashed var(--ac)"' : ''}>${l}</span>` }).join('');
  return `<div class="card" style="padding:12px"><div class="row" style="justify-content:space-between"><p class="h" style="font-size:13px">이번 주</p><span class="sub">목표 주 ${goal}회 · ${cnt}번 했어요${cnt >= goal ? ' ✓' : ''}</span></div><div class="row" style="gap:4px">${days}</div></div>`;
};
B.routine = () => {
  const R = S.rec, g = giftSlots().map(exName), last = ((allSessions().find(s => s.session_date < today()) || {}).items || []).map(exName);
  const src = [g.length ? ['gift', '선생님이 보낸 루틴'] : null, last.length ? ['last', '지난번 그대로'] : null].filter(Boolean);
  return `<div class="card" style="padding:12px"><p class="h" style="font-size:13px">오늘 할 운동</p>
  ${src.length ? `<div class="row wrapx">${src.map(([k, l]) => `<button class="chip" data-a="recSrc" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
  <div class="row wrapx">${R.items.map((it, i) => `<button class="chip${i === R.cur ? ' on' : ''}" data-a="recCur" data-v="${i}">${esc(it.nm)}${it.sets.some(s => s.done) ? ' ✓' : ''}</button>`).join('')}</div>
  <div class="row"><input id="recAdd" type="text" placeholder="운동 이름 추가 (예: 레그 프레스)"><button class="btn sm ghost" style="flex:none;white-space:nowrap" data-a="recAdd">추가</button></div></div>`;
};
B.bundle = () => {
  const R = S.rec, bs = Object.assign({}, REC_BUNDLE0, recPrefs().bundles || {});
  return `<div class="card" style="padding:12px"><p class="h" style="font-size:13px">오늘은 어디서 하나요?</p>
  <div class="row wrapx">${Object.keys(bs).map(k => `<button class="chip${R.bundle === k ? ' on' : ''}" data-a="recBundle" data-v="${esc(k)}">${esc(k)} 루틴</button>`).join('')}</div>
  <div class="row" style="justify-content:space-between;background:#F4F2EE;border-radius:10px;padding:8px 10px"><div><p class="h" style="font-size:13px">15분 버전</p><p class="sub" style="font-size:11px">바쁜 날도 끊기지 않게 · 앞의 2개만</p></div><button class="chip${R.short ? ' on' : ''}" data-a="recShort">${R.short ? '켜짐' : '꺼짐'}</button></div>
  ${R.bundle ? `<button class="link" style="align-self:flex-start" data-a="recSaveBundle">지금 목록을 '${esc(R.bundle)}' 루틴으로 저장</button>` : ''}</div>`;
};
function rpeZone(r) { return r == null ? null : r <= 6 ? ['회복 구간 · 몸 풀기 좋아요', '#166534'] : r <= 8 ? ['성장 구간 · 오늘의 메인', '#92400E'] : r === 9 ? ['한계 근처 · 자세 무너지면 멈춤', '#C2410C'] : ['최대 · 이번 주엔 이걸로 끝', '#B91C1C'] }
B.sets = () => {
  const R = S.rec, it = R.items[R.cur];
  if (!it) return `<div class="card"><p class="sub">위에서 운동을 고르거나 추가해 주세요.</p></div>`;
  const ex = recOn('rpe') ? 'RPE' : recOn('flow') ? '몰입' : '', st = recStage();
  const hd = `<div class="srow hd"><span>세트</span><span>무게 kg</span><span>횟수</span><span>${ex}</span><span>완료</span></div>`;
  const rows = it.sets.map((s, i) => {
    const val = (k) => s.edited || s.done ? `value="${s[k]}"` : `placeholder="${s[k]}"`;
    let x = '<span></span>';
    if (recOn('rpe')) x = `<button class="mini${s.rpe ? ' on' : ''}" data-a="recRpe" data-v="${i}">${s.rpe ? s.rpe : '–'}</button>`;
    else if (recOn('flow')) x = `<button class="mini${s.flow ? ' on' : ''}" data-a="recFlow" data-v="${i}" aria-label="몰입 세트">${s.flow ? '★' : '☆'}</button>`;
    const z = recOn('zones') && rpeZone(s.rpe);
    return `<div class="srow"><button class="tb ${s.sl ? 'SL' : s.t}" data-a="recType" data-v="${i}">${s.sl ? '도전' : s.t}</button>
      <input class="sin" type="number" inputmode="decimal" step="0.5" data-rec="w" data-i="${i}" ${val('w')}>
      <input class="sin" type="number" inputmode="numeric" data-rec="r" data-i="${i}" ${val('r')}>
      ${x}<button class="ckb${s.done ? ' on' : ''}" data-a="recDone" data-v="${i}" aria-label="세트 완료">✓</button></div>${z ? `<p class="zone" style="color:${z[1]}">${z[0]}</p>` : ''}`;
  }).join('');
  const cue = st === 3 ? `<p class="cue">회색 숫자는 지난번 기록이에요. 그대로 했으면 ✓만 누르면 돼요.</p>` : '';
  const legend = recOn('zones') ? `<div class="row wrapx" style="gap:4px;font-size:10px;font-weight:800"><span class="zl" style="background:#DCFCE7;color:#166534">~6 회복</span><span class="zl" style="background:#FEF3C7;color:#92400E">7~8 성장</span><span class="zl" style="background:#FFEDD5;color:#C2410C">9 한계 근처</span><span class="zl" style="background:#FEE2E2;color:#B91C1C">10 주 1회만</span></div>` : '';
  const sl = recOn('slayer') ? `<div class="row" style="justify-content:space-between;border-top:1px solid #F3EEE6;padding-top:8px"><div><p class="h" style="font-size:13px">도전 세트 (슬레이어)</p><p class="sub" style="font-size:11px">원할 때만 · 실패해도 기록은 남아요</p></div><button class="chip${it.sets.some(s => s.sl) ? ' on' : ''}" data-a="recSlayer">${it.sets.some(s => s.sl) ? '켜짐' : '꺼짐'}</button></div>` : '';
  return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline"><p class="h">${esc(it.nm)}</p><button class="link" data-a="recDel">이 운동 빼기</button></div>${cue}${hd}${rows}
  <div class="row"><button class="add" data-a="recAddSet">+ 세트 추가</button><button class="add" data-a="recRmSet">− 마지막 세트</button></div>${legend}${sl}
  ${recOn('rpe') ? '<p class="sub" style="font-size:11px">RPE 칸을 누를 때마다 6→10 순서로 바뀌어요. W는 준비 세트, 눌러서 바꿔요.</p>' : ''}</div>`;
};
B.compare = () => {
  const it = S.rec.items[S.rec.cur]; if (!it) return '';
  const prev = lastItem(it.nm, today()), p = prev && topSet(prev), t = topSet({ sets: it.sets.filter(s => s.done) }), up = p && t && e1rm(t) > e1rm(p);
  return `<div class="row" style="justify-content:space-between;background:#F4F2EE;border-radius:12px;padding:10px 12px"><span class="sub">지난번 ${p ? fmtSet(p) : '기록 없음'}</span><b style="font-size:13px;color:${up ? 'var(--ok)' : 'var(--tx)'}">→ 오늘 ${t ? fmtSet(t) : '—'}${up ? ' ▲' : ''}</b></div>`;
};
B.check = () => {
  const it = S.rec.items[S.rec.cur]; if (!it) return '';
  const M = it.sets.filter(s => s.t === 'M' && !s.sl); if (!M.length || M.some(s => !s.done)) return '';
  const row = k => `<div class="n6">${STEPS.map(v => `<button class="n${it[k] === v ? (k === 'vas' && v >= 4 ? ' red' : ' on') : ''}" data-a="recQ" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div>`;
  let fb = '', bg = '';
  if ((it.vas || 0) >= 4) { fb = '아팠군요. 저장하면 선생님께 바로 전달돼요. 다음엔 무게를 낮추거나 동작을 바꿔 볼게요.'; bg = 'background:#FDECEC;color:#B91C1C' }
  else if (it.pd != null && it.se != null) fb = it.pd >= 6 && it.se >= 6 ? '딱 좋은 도전이었어요. 어렵지만 해낼 것 같은 그 느낌, 다음에도 이 정도로 가요.' : it.pd >= 6 ? '오늘은 조금 버거웠어요. 괜찮아요, 다음엔 한 단계 쉽게 맞춰 둘게요.' : it.se >= 6 && it.pd <= 4 ? '여유 있게 해냈어요. 다음엔 조금만 더 올려 봐도 돼요.' : it.pd <= 4 && it.se <= 4 ? '오늘은 별 느낌이 없었나 봐요. 선생님이 재미있게 바꿔 볼게요.' : '적당했어요. 이 기록이 다음 루틴의 기준이 돼요.';
  return `<div class="card"><p class="h">${esc(it.nm)} 끝! 세 가지만 알려 주세요</p>
  <p class="sub">얼마나 어려웠어요? (자세 잡기 포함)</p>${row('pd')}<p class="sub">지금 한 세트 더 해낼 자신 있어요?</p>${row('se')}<p class="sub">아픈 곳 있었어요? (0 = 전혀 없음)</p>${row('vas')}
  ${fb ? `<p class="cue" style="${bg}">${fb}</p>` : ''}</div>`;
};
B.note = () => {
  const N = ['개운해요', '힘들었지만 해냈어요', '무릎이 조금 신경 쓰였어요', '자세가 잡히는 느낌'];
  return `<div class="card"><p class="h">한 줄 일지</p><div class="row wrapx">${N.map(l => `<button class="chip${S.rec.note === l ? ' on' : ''}" data-a="recNote" data-v="${l}">${l}</button>`).join('')}</div>
  <input id="recNoteT" type="text" placeholder="직접 쓰기" value="${N.includes(S.rec.note) ? '' : esc(S.rec.note)}"><p class="sub" style="font-size:11px">선생님이 다음 수업 전에 읽어요.</p></div>`;
};
function weekRange(back) { const d = new Date(Date.now() + 9 * 3600e3), dow = (d.getUTCDay() + 6) % 7, st = new Date(d.getTime() - (dow + back * 7) * 864e5); return [st.toISOString().slice(0, 10), new Date(st.getTime() + 7 * 864e5).toISOString().slice(0, 10)] }
B.mission = () => {
  const p = recPrefs(), m = p.mission == null ? 0 : p.mission, tgt = p.mtarget || 0, lift = p.mlift || '스쿼트';
  let weeks = 0; for (let k = 0; k < 4; k++) { const [a, b] = weekRange(k); if (allSessions().filter(s => s.session_date >= a && s.session_date < b).length >= 3) weeks++ }
  let best = 0; allSessions().forEach(s => (s.items || []).forEach(it => { if (exName(it).includes(lift)) (it.sets || []).forEach(x => { if (x.done !== false && x.t !== 'W') best = Math.max(best, e1rm(x)) }) }));
  const skill = S.fb.some(f => f.kind === 'skillok');
  const L = [['꾸준함으로', '주 3회 × 4주', weeks + ' / 4주'], ['기록으로', lift + ' 추정 최대 ' + (tgt || '?') + 'kg', Math.round(best) + (tgt ? ' / ' + tgt : '') + 'kg'], ['기술으로', '자세 영상 선생님 확인', skill ? '통과 ✓' : '확인 대기']];
  return `<div class="card"><div class="row" style="justify-content:space-between"><p class="h">다음 단계 미션</p><span class="sub">${L[m][2]}</span></div><p class="sub">어떤 길로 갈지 직접 골라요.</p>
  ${L.map((x, i) => `<button class="chip${m === i ? ' on' : ''}" style="text-align:left;border-radius:12px;min-height:44px" data-a="recMission" data-v="${i}">${m === i ? '● ' : '○ '}${x[0]} · ${esc(x[1])}</button>`).join('')}
  ${m === 1 ? `<div class="row"><input id="mlift" type="text" value="${esc(lift)}" placeholder="종목"><input id="mtgt" type="number" value="${tgt || ''}" placeholder="목표 kg"><button class="btn sm ghost" style="flex:none;white-space:nowrap" data-a="recMtgt">저장</button></div>` : ''}</div>`;
};
B.dex = () => {
  const p = recPrefs(), names = []; allSessions().forEach(s => (s.items || []).forEach(it => { const n = exName(it); if (!names.includes(n)) names.push(n) }));
  const nm = p.dex && names.includes(p.dex) ? p.dex : names[0]; if (!nm) return '';
  const bars = []; for (let k = 5; k >= 0; k--) { const [a, b] = weekRange(k); let v = 0; allSessions().forEach(s => { if (s.session_date >= a && s.session_date < b) (s.items || []).forEach(it => { if (exName(it) === nm) (it.sets || []).forEach(x => { if (x.done !== false && x.t !== 'W') v = Math.max(v, e1rm(x)) }) }) }); bars.push(Math.round(v)) }
  const mx = Math.max(1, ...bars), mn = Math.min(...bars.filter(x => x > 0), mx);
  return `<div class="card"><div class="row" style="justify-content:space-between"><p class="h">운동도감</p><select id="dexSel" style="width:auto;min-height:36px">${names.map(n => `<option${n === nm ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
  <p class="sub" style="font-size:11px">6주 추정 최대치 (무게 × (1 + 횟수/30))</p>
  <div class="row" style="align-items:flex-end;height:80px;gap:8px">${bars.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:10px;color:var(--mu)">${v || ''}</span><div style="width:100%;border-radius:6px 6px 0 0;height:${v ? Math.max(6, Math.round(8 + (v - mn * 0.9) / (mx - mn * 0.9 || 1) * 50)) : 2}px;background:${i === 5 ? 'var(--ac)' : '#F5D9A8'}"></div></div>`).join('')}</div>
  <div class="row" style="justify-content:space-between;border-top:1px solid #F3EEE6;padding-top:8px"><div><p class="h" style="font-size:13px">또래 비교</p><p class="sub" style="font-size:11px">${p.peer ? '켜 둠 · 센터 기록이 충분히 모이면 보여 드려요' : '꺼 둠 · 내 지난 기록과만 비교해요'}</p></div><button class="chip${p.peer ? ' on' : ''}" data-a="recPeer">${p.peer ? '켜짐' : '꺼짐'}</button></div></div>`;
};
function monthStats(off) {
  const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - off); const ym = d.toISOString().slice(0, 7);
  let n = 0, vol = 0; allSessions().forEach(s => { if (s.session_date.slice(0, 7) === ym) { n++; (s.items || []).forEach(it => (it.sets || []).forEach(x => { if (x.done !== false && x.t !== 'W') vol += (x.w || 0) * (x.r || 0) })) } });
  return { ym, n, vol };
}
B.share = () => {
  const a = monthStats(0), b = monthStats(1), ch = b.vol ? Math.round((a.vol - b.vol) / b.vol * 100) : null;
  return `<div class="card warm"><p class="h">${+a.ym.slice(5)}월 성적표</p><p class="sub">${a.n}회 운동 · 볼륨 ${Math.round(a.vol).toLocaleString()}kg${ch != null ? ' (' + (ch >= 0 ? '+' : '') + ch + '%)' : ''}</p>
  <button class="btn" data-a="recShare">가족·친구에게 보내기</button></div>`;
};
B.cycle = () => {
  const p = recPrefs(), c = p.cycle, pat = (c && c.pat) || '4-1-4-1';
  if (!c || !c.start) return `<div class="card warm"><p class="h">12주 주기를 직접 짜요</p><p class="sub">집중하는 주와 쉬는 주를 미리 정해 두면, 쉬는 것도 계획이 돼요.</p>
    <div class="row wrapx">${['4-1-4-1', '3-1-3-1-3-1'].map(x => `<button class="chip${pat === x ? ' on' : ''}" data-a="recCyclePat" data-v="${x}">${x === '4-1-4-1' ? '집중4·회복1' : '집중3·회복1'}</button>`).join('')}</div><button class="btn" data-a="recCycleStart">이번 주부터 시작</button></div>`;
  const seq = []; const parts = pat.split('-').map(Number); parts.forEach((n, i) => { for (let k = 0; k < n; k++) seq.push(i % 2 ? '회' : '집') }); while (seq.length < 11) seq.push('집'); seq.length = 11; seq.push('쉼');
  const wk = Math.floor((new Date(today()) - new Date(c.start)) / (7 * 864e5)), cur = Math.min(11, Math.max(0, wk)), restIn = seq.indexOf('쉼', cur);
  const col = { 집: 'background:#F5D9A8;color:#7C3D06', 회: 'background:#DCFCE7;color:#166534', 쉼: 'background:#E0E7FF;color:#3730A3' };
  return `<div class="card" style="padding:12px"><div class="row" style="justify-content:space-between"><p class="h" style="font-size:13px">12주 주기 · ${wk > 11 ? '끝났어요' : (cur + 1) + '주차 · ' + ({ 집: '집중', 회: '회복', 쉼: '쉬는 주' })[seq[cur]]}</p><span class="sub">${restIn > cur ? '쉬는 주까지 ' + (restIn - cur) + '주' : ''}</span></div>
  <div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px">${seq.map((l, i) => `<div style="height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;${i === cur && wk <= 11 ? 'background:var(--ac);color:#fff' : col[l]}">${l}</div>`).join('')}</div>
  <button class="link" style="align-self:flex-start" data-a="recCycleReset">새 12주 다시 짜기</button></div>`;
};
function recLow() { const v = Object.values(S.rec.cond || {}), bad = v.filter(x => x === 2).length; return bad >= 2 || (bad >= 1 && v.filter(x => x === 1).length >= 2) }
B.cond = () => {
  const C = S.rec.cond || {}, LV = ['좋음', '보통', '나쁨'];
  return `<div class="card" style="padding:12px"><p class="h" style="font-size:13px">오늘 몸 상태</p>
  ${['수면', '피로', '근육통'].map(k => `<div class="row" style="gap:6px"><span class="sub" style="width:48px">${k}</span>${LV.map((l, v) => `<button class="n${C[k] === v ? (v === 2 ? ' red' : ' on') : ''}" style="flex:1;min-height:36px" data-a="recCond" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`).join('')}
  ${recLow() ? `<p class="cue" style="background:#DCFCE7;color:#166534">오늘은 회복 구간(RPE 6 이하)을 권해요. 계획대로 하되 무게만 한 단계 낮춰요.</p>` : ''}</div>`;
};
function recHot() { return recLow() && S.rec.items.some(it => it.sets.some(s => s.done && (s.rpe || 0) >= 9)) }
B.warn = () => recHot() ? `<div class="card" style="background:#FDECEC;border-color:#F5C2C2"><p class="h" style="color:var(--bad)">회복 신호</p><p class="sub" style="color:#7F1D1D">컨디션이 낮은 날 고강도(RPE 9 이상)를 했어요. 저장하면 선생님께 알림이 가요. 다음 이틀은 회복 구간으로 가 봐요.</p></div>` : '';
B.volume = () => {
  const v = []; for (let k = 7; k >= 0; k--) { const [a, b] = weekRange(k); let t = 0; allSessions().forEach(s => { if (s.session_date >= a && s.session_date < b) (s.items || []).forEach(it => (it.sets || []).forEach(x => { if (x.done !== false && x.t !== 'W') t += (x.w || 0) * (x.r || 0) })) }); v.push(t / 1000) }
  const mx = Math.max(0.1, ...v);
  return `<div class="card"><div class="row" style="justify-content:space-between"><p class="h">주간 볼륨 · 8주</p><span class="sub">톤</span></div>
  <div class="row" style="align-items:flex-end;height:80px;gap:6px">${v.map((t, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:9px;color:var(--mu)">${t ? t.toFixed(1) : ''}</span><div style="width:100%;border-radius:5px 5px 0 0;height:${Math.max(2, Math.round(t / mx * 58))}px;background:${i === 7 ? 'var(--ac)' : '#F5D9A8'}"></div></div>`).join('')}</div>
  <p class="sub" style="font-size:11px">회복 주에 낮아지는 건 정상이에요.</p></div>`;
};
B.cheer = () => {
  const done = S.fb.some(f => f.kind === 'cheer' && f.session_date >= weekRange(0)[0]);
  return `<div class="card warm"><p class="h">처음 시작한 회원에게 한 줄</p><p class="sub">첫 달을 보내는 회원들에게 내 경험을 이름 없이 남겨요. 선생님이 골라서 전해요.</p>
  ${done ? '<p class="sub" style="font-weight:800;color:var(--ac2)">이번 주 응원 남겼어요 ✓</p>' : '<input id="cheerT" type="text" placeholder="예: 처음 3주가 제일 힘들어요. 그다음부터 진짜 재밌어요"><button class="btn" data-a="recCheer">남기기</button>'}</div>`;
};
B.flow = B.rpe = B.zones = B.slayer = () => ''; // 세트 기록 안에서 쓰는 스위치

function vRec() {
  const st = recStage(), L = recLayout();
  return `<div style="display:flex;flex-direction:column"><div class="top"><button class="link" data-a="recBack">◀ 여정 ${st}</button><span class="brand">WLP · 오늘 운동</span></div>
  <div class="wrap" style="gap:10px">${L.map(k => (B[k] ? B[k]() : '')).join('')}
  <button class="btn" data-a="recSave">${S.rec.id ? '다시 저장' : '저장하기'}</button>
  ${LEGACY && st >= 3 ? `<button class="link" data-a="recImport" style="align-self:center">룬 PT 기록 가져오기 (원본은 그대로)</button>` : ''}
  <button class="link" data-a="recEditAsk" style="align-self:center">⚙ 화면 구성 (트레이너)</button></div></div>`;
}
// 트레이너 화면 구성: 켜기·끄기·순서 바꾸기 (이 기기에만 저장)
const recOrg = k => k === 'sets' ? 3 : [3, 4, 5].find(n => REC_DEF[n].includes(k));
function vRecEdit() {
  const st = recStage(), E = S.recEdit, on = E.list, off = Object.keys(REC_BLOCKS).filter(k => !on.includes(k)), SN = ['', '', '', '③', '④', '⑤'];
  const org = k => k === 'sets' ? st : recOrg(k);
  const tag = k => org(k) > st ? ' <span class="tag" style="background:#E9F0FA;color:#1D4ED8">다음 단계</span>' : org(k) < st ? ' <span class="tag" style="background:#F3E8E3;color:#7A3418">이전 단계</span>' : '';
  const row = (k, i) => `<div class="mrow" style="padding:8px 10px"><span style="font-size:13px"><b style="color:var(--ac)">${i + 1}</b> ${REC_BLOCKS[k]}${tag(k)}</span>
    <span class="row" style="gap:4px"><button class="mini" data-a="leUp" data-v="${i}" aria-label="위로" ${i ? '' : 'disabled'}>↑</button><button class="mini" data-a="leDn" data-v="${i}" aria-label="아래로" ${i < on.length - 1 ? '' : 'disabled'}>↓</button><button class="mini" data-a="leOff" data-v="${k}">빼기</button></span></div>`;
  const grp = (h, d, f) => { const ks = off.filter(f); return ks.length ? `<div class="card" style="gap:6px"><p class="h">${h}</p><p class="sub" style="font-size:11px">${d}</p>${ks.map(k => `<div class="mrow" style="padding:8px 10px"><span style="font-size:13px;color:var(--mu)">${REC_BLOCKS[k]}${org(k) !== st ? ' (' + SN[org(k)] + ')' : ''}</span><button class="mini on" data-a="leOn" data-v="${k}">넣기</button></div>`).join('')}</div>` : '' };
  return `<div style="display:flex;flex-direction:column"><div class="top"><button class="link" data-a="leCancel">◀ 취소</button><span class="brand">화면 구성 · 여정 ${st}</span></div>
  <div class="wrap" style="gap:10px"><div class="card warm" style="padding:12px"><p class="sub">이 회원 폰에만 저장돼요. 서버에는 안 올라가요. 폰을 바꾸거나 앱 데이터를 지우면 단계 기본으로 돌아가요.</p></div>
  <div class="card" style="gap:6px"><p class="h">켜진 기능 · 위에서부터 보여요</p>${on.map(row).join('') || '<p class="sub">하나 이상 켜 주세요.</p>'}</div>
  ${grp('이 단계 추천 기능', '빼 둔 기본 기능', k => org(k) === st)}
  ${grp('다음 단계 기능 · 미리 넣어 주기', '준비된 회원에게 한 칸 먼저 열어 줘요', k => org(k) > st)}
  ${grp('이전 단계 기능 · 좋아하셨던 것', '단계가 올라가도 좋아하던 건 계속', k => org(k) < st)}
  <div class="row"><button class="btn ghost" style="flex:1" data-a="leReset">단계 기본으로</button><button class="btn" style="flex:2" data-a="leSave" ${on.length ? '' : 'disabled'}>저장</button></div></div></div>`;
}

/* ----- 저장 ----- */
async function recSave() {
  const R = S.rec, st = recStage();
  const note = (document.getElementById('recNoteT') || {}).value; if (note && note.trim()) R.note = note.trim();
  const items = R.items.map(it => ({ nm: it.nm, sets: it.sets.filter(s => s.done || s.edited).map(s => { const o = { t: s.t, w: +s.w || 0, r: +s.r || 0, done: !!s.done }; if (s.rpe) o.rpe = s.rpe; if (s.flow) o.flow = true; if (s.sl) o.sl = true; return o }) })).filter(it => it.sets.length);
  if (!items.length) { toast('완료한 세트가 없어요. ✓를 눌러 주세요'); return }
  const hot = recOn('warn') && recHot() && !R.alertSent;
  const extra = { cond: R.cond, bundle: R.bundle || null, short: !!R.short, alert: R.alertSent || hot };
  const row = { member_id: S.uid, session_date: today(), session_no: 1, stage: st, items, extra, source: 'wlp', entered_by: 'member', updated_at: new Date().toISOString() };
  if (DEMO) { row.id = R.id || Date.now(); S.wk = (S.wk || []).filter(w => !(w.session_date === row.session_date && w.source === 'wlp')); S.wk.unshift(row); mergeSessions(); R.id = row.id }
  else {
    const r = await sb.from('wlp_workouts').upsert(row, { onConflict: 'member_id,session_date,session_no,source' }).select('*').single();
    if (r.error) { toast(sbErr(r.error)); return }
    R.id = r.data.id; S.wk = (S.wk || []).filter(w => w.id !== r.data.id); S.wk.unshift(r.data); mergeSessions();
  }
  // 운동 끝 세 질문 → 트레이너 기록지(기존 PD·SE·VAS 와 같은 자리)
  for (const it of R.items) if (it.pd != null && it.se != null && !it.fbSaved) { await addFbQuiet({ kind: 'pdse', exercise: it.nm, pd: it.pd, se: it.se, vas: it.vas || 0 }); it.fbSaved = true }
  if (R.note && R.note !== R.noteSaved) { await addFbQuiet({ kind: 'line', data: { text: R.note } }); R.noteSaved = R.note }
  if (R.short) await addFbQuiet({ kind: 'mini15' });
  if (hot) { await addFbQuiet({ kind: 'alert', data: { why: '컨디션 낮은 날 RPE 9 이상', cond: R.cond } }); R.alertSent = true }
  toast(DEMO ? '시험 모드: 화면에만 저장했어요' : '저장했어요'); render();
}
async function addFbQuiet(row) {
  const r0 = Object.assign({ member_id: S.uid, entered_by: 'member', session_date: today(), data: {} }, row);
  if (DEMO) { r0.id = Date.now() + Math.random(); r0.created_at = new Date().toISOString(); S.fb.unshift(r0); return }
  const r = await sb.from('wlp_feedback').insert(r0).select('*').single(); if (!r.error) S.fb.unshift(r.data);
}
// WLP 기록 + 룬 PT 기록(시범 기간 읽기 전용) 합치기. 같은 날짜·회차는 WLP 우선
const cleanItems = items => (Array.isArray(items) ? items : []).filter(it => it && typeof it === 'object').map(it => Object.assign({}, it, { sets: (Array.isArray(it.sets) ? it.sets : []).filter(s => s && typeof s === 'object') }));
function mergeSessions() {
  const wl = (S.wk || []).map(w => ({ session_date: w.session_date, session_no: w.session_no, items: cleanItems(w.items), src: w.source }));
  const key = s => s.session_date + '#' + (s.session_no || 1), seen = new Set(wl.map(key));
  const legacy = (S.runeSessions || []).filter(s => s && s.session_date && !seen.has(key(s))).map(s => Object.assign({}, s, { items: cleanItems(s.items) }));
  S.sessions = wl.concat(legacy).sort((a, b) => a.session_date < b.session_date ? 1 : -1);
}
async function loadRec() {
  if (DEMO || !sb) return;
  const [w, m] = await Promise.all([
    sb.from('wlp_workouts').select('*').eq('member_id', S.uid).order('session_date', { ascending: false }).limit(200),
    sb.from('wlp_members').select('prefs').eq('user_id', S.uid).maybeSingle()]);
  if (!w.error) S.wk = w.data || [];
  if (!m.error && m.data) S.prefs = m.data.prefs || {};
}

/* ----- 동작 ----- */
function recSet(i, p) { const it = S.rec.items[S.rec.cur]; it.sets[i] = Object.assign({}, it.sets[i], p) }
const RA = {
  openRec: recOpen,
  recBack: () => { S.scr = 'home'; render(); window.scrollTo(0, 0) },
  recCur: (b, v) => { S.rec.cur = +v; render() },
  recSrc: (b, v) => { const names = v === 'gift' ? giftSlots().map(exName) : ((allSessions().find(s => s.session_date < today()) || {}).items || []).map(exName); const keep = S.rec.items.filter(it => it.sets.some(s => s.done)); names.forEach(n => { if (!keep.some(k => k.nm === n)) keep.push({ nm: n, sets: tmplSets(n), pd: null, se: null, vas: 0 }) }); S.rec.items = keep; S.rec.cur = 0; render() },
  recAdd: () => { const el = document.getElementById('recAdd'), n = (el && el.value || '').trim(); if (!n) return; S.rec.items.push({ nm: n, sets: tmplSets(n), pd: null, se: null, vas: 0 }); S.rec.cur = S.rec.items.length - 1; render() },
  recDel: () => { const it = S.rec.items[S.rec.cur]; if (it && it.sets.some(s => s.done) && !confirmLite('완료한 세트가 있어요. 그래도 뺄까요?')) return; S.rec.items.splice(S.rec.cur, 1); S.rec.cur = 0; render() },
  recBundle: (b, v) => { const bs = Object.assign({}, REC_BUNDLE0, recPrefs().bundles || {}); S.rec.bundle = v; const keep = S.rec.items.filter(it => it.sets.some(s => s.done)); let names = bs[v] || []; if (S.rec.short) names = names.slice(0, 2); names.forEach(n => { if (!keep.some(k => k.nm === n)) keep.push({ nm: n, sets: tmplSets(n), pd: null, se: null, vas: 0 }) }); S.rec.items = keep; S.rec.cur = 0; render() },
  recShort: () => { S.rec.short = !S.rec.short; if (S.rec.short) S.rec.items = S.rec.items.filter((it, i) => i < 2 || it.sets.some(s => s.done)); else if (S.rec.bundle) return RA.recBundle(null, S.rec.bundle); render() },
  recSaveBundle: () => { const bs = Object.assign({}, recPrefs().bundles || {}); bs[S.rec.bundle] = S.rec.items.map(it => it.nm); recSavePrefs({ bundles: bs }); toast(S.rec.bundle + ' 루틴으로 저장했어요') },
  recRpe: (b, v) => { const s = S.rec.items[S.rec.cur].sets[+v], o = [null, 6, 7, 8, 9, 10], n = o[(o.indexOf(s.rpe || null) + 1) % o.length]; recSet(+v, { rpe: n }); render() },
  recFlow: (b, v) => { const s = S.rec.items[S.rec.cur].sets[+v]; recSet(+v, { flow: !s.flow }); render() },
  recType: (b, v) => { const s = S.rec.items[S.rec.cur].sets[+v]; if (s.sl) return; recSet(+v, { t: s.t === 'W' ? 'M' : 'W' }); render() },
  recDone: (b, v) => { const s = S.rec.items[S.rec.cur].sets[+v]; recSet(+v, { done: !s.done, edited: true }); render() },
  recAddSet: () => { const it = S.rec.items[S.rec.cur]; if (!it) return; const base = it.sets.filter(s => !s.sl).slice(-1)[0] || { t: 'M', w: 0, r: 10 }; const ns = { t: 'M', w: base.w, r: base.r, done: false, edited: false }; const k = it.sets.findIndex(s => s.sl); if (k >= 0) it.sets.splice(k, 0, ns); else it.sets.push(ns); render() },
  recRmSet: () => { const it = S.rec.items[S.rec.cur]; if (it && it.sets.length > 1) { it.sets.pop(); render() } },
  recSlayer: () => { const it = S.rec.items[S.rec.cur], has = it.sets.some(s => s.sl); if (has) it.sets = it.sets.filter(s => !s.sl); else { const t = topSet(it) || { w: 0, r: 1 }; it.sets.push({ t: 'M', w: (t.w || 0) + 2.5, r: 1, rpe: 10, sl: true, done: false, edited: false }) } render() },
  recQ: (b, v) => { const it = S.rec.items[S.rec.cur]; it[b.dataset.k] = +v; it.fbSaved = false; render() },
  recNote: (b, v) => { S.rec.note = S.rec.note === v ? '' : v; render() },
  recMission: (b, v) => recSavePrefs({ mission: +v }),
  recMtgt: () => recSavePrefs({ mlift: (document.getElementById('mlift') || {}).value || '스쿼트', mtarget: +((document.getElementById('mtgt') || {}).value || 0) }),
  recPeer: () => recSavePrefs({ peer: !recPrefs().peer }),
  recShare: async () => { const a = monthStats(0), t = `[WLP] ${+a.ym.slice(5)}월 운동 성적표\n${a.n}회 운동 · 볼륨 ${Math.round(a.vol).toLocaleString()}kg`; try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toast('복사했어요. 카톡에 붙여 넣어 보내 주세요') } } catch (e) { } },
  recCyclePat: (b, v) => recSavePrefs({ cycle: Object.assign({}, recPrefs().cycle || {}, { pat: v, start: null }) }),
  recCycleStart: () => { const [a] = weekRange(0); recSavePrefs({ cycle: { pat: (recPrefs().cycle || {}).pat || '4-1-4-1', start: a } }) },
  recCycleReset: () => recSavePrefs({ cycle: { pat: (recPrefs().cycle || {}).pat || '4-1-4-1', start: null } }),
  recCond: (b, v) => { S.rec.cond = Object.assign({}, S.rec.cond, { [b.dataset.k]: +v }); render() },
  recCheer: async () => { const t = ((document.getElementById('cheerT') || {}).value || '').trim(); if (!t) return; await addFbQuiet({ kind: 'cheer', data: { text: t } }); toast('남겼어요'); render() },
  recSave: recSave,
  recEditAsk: () => { const c = window.prompt('트레이너 코드를 입력해 주세요'); if (c == null) return; if (String(c).trim() !== String((window.WLP_CFG || {}).LAYOUT_CODE || '9999')) { toast('코드가 맞지 않아요'); return } S.recEdit = { list: recLayout().slice() }; S.scr = 'recEdit'; render(); window.scrollTo(0, 0) },
  leUp: (b, v) => { const L = S.recEdit.list, i = +v; [L[i - 1], L[i]] = [L[i], L[i - 1]]; render() },
  leDn: (b, v) => { const L = S.recEdit.list, i = +v; [L[i + 1], L[i]] = [L[i], L[i + 1]]; render() },
  leOff: (b, v) => { S.recEdit.list = S.recEdit.list.filter(k => k !== v); render() },
  leOn: (b, v) => { S.recEdit.list.push(v); render() },
  leReset: () => { S.recEdit.list = REC_DEF[recStage()].slice(); render() },
  leCancel: () => { S.scr = 'rec'; render() },
  leSave: () => { const all = devLayouts(), st = recStage(), L = S.recEdit.list; if (L.join() === REC_DEF[st].join()) delete all[st]; else all[st] = L; try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(all)) } catch (e) { toast('이 기기에 저장하지 못했어요'); return } S.scr = 'rec'; toast('이 기기에 화면 구성을 저장했어요'); render() },
  recImport: async () => {
    if (DEMO) { toast('시험 모드에서는 가져오지 않아요'); return }
    const r = await sb.rpc('wlp_import_rune'); if (r.error) { toast(sbErr(r.error)); return }
    toast('룬 PT 기록 ' + ((r.data || {}).count || 0) + '건을 가져왔어요'); await loadRec(); mergeSessions(); render();
  }
};
function confirmLite(msg) { return window.confirm(msg) }
// 숫자 칸: 입력 중엔 다시 그리지 않고, 칸을 벗어날 때 저장
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.rec || !S.rec) return;
  const v = parseFloat(t.value); if (isNaN(v)) return; recSet(+t.dataset.i, { [t.dataset.rec]: v, edited: true });
});
document.addEventListener('change', e => { if (e.target.id === 'dexSel') recSavePrefs({ dex: e.target.value }) });
