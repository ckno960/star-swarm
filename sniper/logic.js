// 스나이퍼: 탄도, 스테이지, 판정 (화면과 분리, node --test로 검사)
// 좌표는 "아트 픽셀"(가로 AW=360인 낮은 해상도 세계). 아트 픽셀 하나는 일정한 각도(THETA)라서
// 거리 d(m)에서 1m는 ppm(d) 픽셀로 보인다.

export const THETA = 0.000398;            // 아트 픽셀 하나의 각도(라디안): 200m의 175cm 사람이 22픽셀
export const ppm = (d) => 1 / (d * THETA);
export const V0 = 900;                    // 총구 속도 m/s
export const G = 9.81;
export const ZERO = 250;                  // 영점(이 거리에서 조준점 = 탄착점)
export const PERSON_M = 1.75;

// 비행 시간: 공기 저항으로 멀수록 조금씩 느려진다
export const flightTime = (d) => (d / V0) * (1 + d / 4000);
const rawDrop = (d) => 0.5 * G * flightTime(d) ** 2;
// 낙차(m, 아래가 +): 영점 거리에 맞춘 조준선 기준
export const dropM = (d) => rawDrop(d) - (rawDrop(ZERO) * d) / ZERO;
// 바람 편류(m, 바람 방향): 진공에서보다 늦어진 시간만큼 바람에 밀린다
export const driftM = (d, wind) => wind * (flightTime(d) - d / V0) * 2.2;
export const mil = (m, d) => (m / d) * 1000;
// 조준점에서 탄착점까지(아트 픽셀)
export function impactOffset(d, wind) { const k = ppm(d); return { dx: driftM(d, wind) * k, dy: dropM(d) * k }; }

// ---------- 흔들림과 숨 참기 ----------
export const BREATH_HOLD = 3.5, BREATH_REGEN = 4, EXHAUST = 2.5;
export function breathStep(b, dt, holding) {
  if (b.exhaust > 0) { b.exhaust = Math.max(0, b.exhaust - dt); b.holding = false; b.stamina = Math.min(1, b.stamina + dt / BREATH_REGEN); return b; }
  b.holding = holding && b.stamina > 0;
  if (b.holding) { b.stamina -= dt / BREATH_HOLD; if (b.stamina <= 0) { b.stamina = 0; b.exhaust = EXHAUST; b.holding = false; } }
  else b.stamina = Math.min(1, b.stamina + dt / BREATH_REGEN);
  return b;
}
export const newBreath = () => ({ stamina: 1, exhaust: 0, holding: false });
// 조준경 흔들림(아트 픽셀). 숨을 참으면 거의 멈추고, 숨이 차면 크게 흔들린다
export function sway(t, b) {
  const amp = 1.7 * (b.holding ? 0.1 : b.exhaust > 0 ? 2.3 : 1);
  return { x: amp * (Math.sin(t * 1.1) + 0.5 * Math.sin(t * 2.7 + 1)), y: amp * 0.8 * (Math.sin(t * 1.7 + 2) + 0.4 * Math.sin(t * 3.9)) };
}

// ---------- 배치 ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, k) => a + (b - a) * k;
// 세로 화면을 띠로 나눈다: 하늘, 먼 옥상(약 700m), 맞은편 건물(약 400m), 거리(150~235m)
export function layout(AW, AH, seed = 1) {
  const r = rng(seed);
  const L = { AW, AH, farBase: Math.round(AH * 0.33), midBase: Math.round(AH * 0.7), farSide: Math.round(AH * 0.7), road0: Math.round(AH * 0.765), road1: Math.round(AH * 0.875), street1: AH };
  // 먼 빌딩들
  L.far = [];
  for (let x = -4; x < AW;) {
    const w = 22 + Math.floor(r() * 30), top = Math.round(AH * (0.13 + r() * 0.13));
    L.far.push({ x, w, top, d: Math.round(640 + r() * 160) });
    x += w + Math.floor(r() * 3);
  }
  // 맞은편 건물 3채(사이 틈으로 먼 빌딩이 보인다)
  L.mid = [];
  const widths = [118, 104, 112], gaps = [10, 8];
  let x = Math.round((AW - widths.reduce((a, b) => a + b) - gaps.reduce((a, b) => a + b)) / 2);
  for (let i = 0; i < 3; i++) {
    const w = widths[i], top = Math.round(AH * (0.25 + r() * 0.07)), d = [430, 380, 460][i];
    const cols = i === 1 ? 5 : 4, floors = Math.floor((L.midBase - top - 30) / 30);
    const winW = Math.floor((w - 16) / cols) - 6, winH = 17, wins = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      wins.push({ x: x + 8 + c * (winW + 6) + 3, y: top + 14 + f * 30, w: winW, h: winH, floor: f, col: c, lit: r() < 0.55 });
    }
    L.mid.push({ i, x, w, top, d, cols, floors, wins });
    x += w + (gaps[i] || 0);
  }
  return L;
}
// 거리의 깊이: 위(먼 인도)는 235m, 맨 아래(가까운 인도)는 150m
export function streetDepth(L, y) { return lerp(235, 150, Math.max(0, Math.min(1, (y - L.midBase) / (L.AH - L.midBase)))); }
export const personH = (d) => Math.max(5, Math.round(PERSON_M * ppm(d)));

// 조준점의 거리(거리 측정기): 사람 > 건물 벽 > 먼 빌딩 > 하늘
export function depthAt(L, x, y) {
  if (y >= L.midBase) return streetDepth(L, y);
  for (const b of L.mid) if (x >= b.x && x < b.x + b.w && y >= b.top) return b.d;
  for (const b of L.far) if (x >= b.x && x < b.x + b.w && y >= b.top && y < L.farBase + 40) return b.d;
  return Infinity;
}

// ---------- 사람과 인상착의 ----------
export const HATS = [
  { id: 'none', name: '모자 없음' }, { id: 'red', name: '빨간 모자', c: '#d0302a' }, { id: 'blue', name: '파란 모자', c: '#2a5ad0' },
  { id: 'black', name: '검은 중절모', c: '#1c1c22' }, { id: 'white', name: '흰 모자', c: '#eeeae0' },
];
export const SHIRTS = [
  { id: 'red', name: '빨간 옷', c: '#c23a32' }, { id: 'blue', name: '파란 옷', c: '#3a62b8' }, { id: 'green', name: '초록 옷', c: '#3e8a4a' },
  { id: 'yellow', name: '노란 옷', c: '#e0b83a' }, { id: 'white', name: '흰 옷', c: '#e6e2d8' }, { id: 'black', name: '검은 옷', c: '#2a2a30' },
  { id: 'purple', name: '보라 옷', c: '#7a4aa8' }, { id: 'orange', name: '주황 옷', c: '#e07a2a' },
];
export const ACCS = [
  { id: 'none', name: '' }, { id: 'case', name: '서류가방' }, { id: 'umbrella', name: '우산' }, { id: 'bag', name: '배낭' }, { id: 'glasses', name: '선글라스' },
];
const PANTS = ['#2a3348', '#4a4038', '#1e1e22', '#6a6a70', '#3a4a6a'];
const SKIN = ['#f0c8a0', '#d8a878', '#b07850', '#7a5038'];
const HAIR = ['#2a1a10', '#6a3a1a', '#c89a4a', '#1a1a1a', '#8a8a8a'];

export const traitText = (t, keys) => keys.map((k) => (k === 'hat' ? HATS.find((h) => h.id === t.hat).name : k === 'shirt' ? SHIRTS.find((s) => s.id === t.shirt).name : ACCS.find((a) => a.id === t.acc).name)).filter(Boolean).join(' · ');
const matches = (a, b, keys) => keys.every((k) => a[k] === b[k]);

// ---------- 스테이지 ----------
// zone: street(거리) | window(맞은편 창문) | roof(먼 옥상), motion: stand | walk | hop(창문 사이를 오감)
const PLAN = [
  { time: 'day', zone: 'street', motion: 'stand', crowd: 3, wind: 0, guide: true, keys: ['shirt'] },
  { time: 'day', zone: 'window', motion: 'stand', crowd: 4, wind: 1, guide: true, keys: ['shirt'] },
  { time: 'day', zone: 'street', motion: 'walk', crowd: 5, wind: 0, guide: true, keys: ['hat'] },
  { time: 'day', zone: 'street', motion: 'stand', crowd: 9, wind: 2, keys: ['hat', 'acc'] },
  { time: 'day', zone: 'window', motion: 'hop', crowd: 7, wind: 2, keys: ['shirt', 'hat'] },
  { time: 'day', zone: 'roof', motion: 'stand', crowd: 4, wind: 3, keys: ['shirt'] },
  { time: 'dusk', zone: 'street', motion: 'walk', crowd: 12, wind: 2, keys: ['acc', 'shirt'] },
  { time: 'night', zone: 'window', motion: 'stand', crowd: 8, wind: 3, keys: ['hat', 'shirt'] },
  { time: 'day', zone: 'street', motion: 'walk', crowd: 14, wind: 4, keys: ['hat', 'shirt'], limit: 30 },
  { time: 'dusk', zone: 'roof', motion: 'walk', crowd: 6, wind: 5, keys: ['acc', 'shirt'] },
  { time: 'night', zone: 'street', motion: 'walk', crowd: 14, wind: 3, keys: ['hat', 'acc', 'shirt'], limit: 35 },
  { time: 'day', zone: 'window', motion: 'hop', crowd: 12, wind: 4, keys: ['hat', 'acc', 'shirt'], limit: 30 },
  { time: 'night', zone: 'roof', motion: 'walk', crowd: 8, wind: 6, keys: ['hat', 'shirt'] },
  { time: 'dusk', zone: 'street', motion: 'walk', crowd: 18, wind: 5, keys: ['hat', 'acc', 'shirt'], limit: 25 },
  { time: 'night', zone: 'window', motion: 'hop', crowd: 14, wind: 6, keys: ['hat', 'acc', 'shirt'], limit: 25 },
];
export const STAGE_COUNT = PLAN.length;
export function stageConfig(n) {
  if (n <= PLAN.length) return { n, ...PLAN[n - 1], wind: PLAN[n - 1].wind * (n % 2 ? 1 : -1) };
  const zones = ['street', 'window', 'roof'], times = ['day', 'dusk', 'night'];
  return { n, time: times[n % 3], zone: zones[n % 3], motion: n % 3 === 1 ? 'hop' : 'walk', crowd: Math.min(24, 12 + n - 15), wind: Math.min(9, 4 + (n - 15) * 0.4) * (n % 2 ? 1 : -1), keys: ['hat', 'acc', 'shirt'], limit: Math.max(15, 30 - (n - 15)) };
}

function randomTraits(r) {
  return {
    hat: HATS[Math.floor(r() * HATS.length)].id, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)].id, acc: r() < 0.55 ? 'none' : ACCS[1 + Math.floor(r() * 4)].id,
    pants: PANTS[Math.floor(r() * PANTS.length)], skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)],
  };
}
// 한 명을 놓는다: zone에 맞는 자리, 깊이, 크기, 움직임
function place(L, r, zone, motion, idx) {
  const p = { id: idx, zone, state: 'idle', panic: 0, fall: 0, frame: r() * 4, dir: r() < 0.5 ? -1 : 1 };
  if (zone === 'street') {
    const far = r() < 0.45;
    p.y = far ? L.farSide + 2 + Math.floor(r() * (L.road0 - L.farSide - 4)) : L.road1 + 4 + Math.floor(r() * (L.AH - L.road1 - 26));
    p.d = streetDepth(L, p.y); p.x = 16 + r() * (L.AW - 32);
    p.speed = motion === 'walk' ? (1.1 + r() * 0.6) * ppm(p.d) : 0;
    p.x0 = 6; p.x1 = L.AW - 6;
  } else if (zone === 'window') {
    const b = L.mid[Math.floor(r() * 3)], w = b.wins[Math.floor(r() * b.wins.length)];
    p.b = b.i; p.floor = w.floor; p.d = b.d; p.x = w.x + w.w / 2; p.y = w.y + w.h + Math.round(personH(b.d) * 0.45);
    p.speed = motion === 'hop' ? 0.9 * ppm(p.d) : 0; p.x0 = b.x + 6; p.x1 = b.x + b.w - 6;
  } else {
    const fb = L.far.filter((f) => f.x > 10 && f.x + f.w < L.AW - 10);
    const f = fb[Math.floor(r() * fb.length)];
    p.d = f.d; p.y = f.top; p.x = f.x + 3 + r() * (f.w - 6); p.x0 = f.x + 2; p.x1 = f.x + f.w - 2;
    p.speed = motion === 'walk' ? 0.8 * ppm(p.d) : 0;
  }
  p.h = personH(p.d);
  return p;
}
// 스테이지 만들기: 표적 1명 + 군중(일부는 표적과 특징을 나눠 가진 "닮은 사람")
export function buildStage(n, L, seed = n * 7919) {
  const cfg = stageConfig(n), r = rng(seed);
  const target = { ...randomTraits(r) };
  if (cfg.keys.includes('acc') && target.acc === 'none') target.acc = ACCS[1 + Math.floor(r() * 4)].id;
  if (cfg.keys.includes('hat') && target.hat === 'none') target.hat = HATS[1 + Math.floor(r() * 4)].id;   // '모자 없음'은 단서로 쓰지 않는다
  const people = [], tp = place(L, r, cfg.zone, cfg.motion, 0);
  tp.traits = target; tp.target = true; people.push(tp);
  for (let i = 1; i <= cfg.crowd; i++) {
    let t;
    for (let tries = 0; tries < 30; tries++) {
      t = randomTraits(r);
      if (r() < 0.5) { const k = cfg.keys[Math.floor(r() * cfg.keys.length)]; t[k] = target[k]; }   // 닮은 사람
      if (!matches(t, target, cfg.keys)) break;
    }
    const zone = r() < 0.6 ? cfg.zone : ['street', 'window', 'roof'][Math.floor(r() * 3)];
    const p = place(L, r, zone, zone === cfg.zone ? cfg.motion : (zone === 'window' ? 'stand' : 'walk'), i);
    p.traits = t; people.push(p);
  }
  // 차
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const lane = i % 2, y = lane ? L.road1 - 4 : Math.round((L.road0 + L.road1) / 2) - 2, d = streetDepth(L, y);
    cars.push({ x: r() * L.AW, y, d, dir: lane ? 1 : -1, speed: (9 + r() * 5) * ppm(d) * 0.5, color: ['#b83a32', '#3a5ab8', '#e0c040', '#e6e6e6', '#2a2a2a', '#3a8a4a'][Math.floor(r() * 6)], len: 0 });
  }
  return { cfg, people, cars, target: tp, desc: traitText(target, cfg.keys), shots: 3, time: 0, over: null, panic: false };
}

// ---------- 움직임 ----------
export function stepPeople(st, L, dt) {
  for (const p of st.people) {
    if (p.state === 'down') { p.fall = Math.min(1, p.fall + dt * 3); continue; }
    if (p.state === 'hidden') { p.hideT -= dt; if (p.hideT <= 0) reappear(p, L); continue; }
    const sp = p.speed * (p.panic ? 2.6 : 1);
    if (sp > 0) {
      p.x += sp * p.dir * dt; p.frame += dt * (p.panic ? 9 : 5);
      if (p.panic && p.target && p.zone === 'street' && (p.x < -10 || p.x > L.AW + 10)) p.state = 'gone';
      else if (!p.panic || p.zone !== 'street' || !p.target) { if (p.x < p.x0) { p.x = p.x0; p.dir = 1; } if (p.x > p.x1) { p.x = p.x1; p.dir = -1; } }
    }
  }
  for (const c of st.cars) { c.x += c.speed * c.dir * dt; if (c.x > L.AW + 40) c.x = -40; if (c.x < -40) c.x = L.AW + 40; }
}
function reappear(p, L) {
  // 창문 표적은 숨었다가 같은 건물의 다른 창문에 나타난다
  const b = L.mid[p.b], w = b.wins[Math.floor(Math.random() * b.wins.length)];
  p.x = w.x + w.w / 2; p.y = w.y + w.h + Math.round(p.h * 0.45); p.floor = w.floor; p.state = 'idle';
}
// 놓치면: 거리 사람들은 달아나고, 창문 사람들은 숨는다
export function startPanic(st) {
  if (st.panic) return; st.panic = true;
  for (const p of st.people) {
    if (p.state === 'down') continue;
    p.panic = 1;
    if (p.zone === 'street') { if (!p.speed) p.speed = 1.3 * ppm(p.d); if (p.target) p.dir = p.x < 180 ? -1 : 1; }
    else if (p.zone === 'window') { p.state = 'hidden'; p.hideT = p.target ? 2.5 : 999; }
    else if (!p.speed) p.speed = 0.9 * ppm(p.d);
  }
}

// ---------- 판정 ----------
// 사람의 몸통·머리 상자(발이 x,y). 창문 사람은 창 안쪽만 보인다
export function boxes(p, L) {
  const h = p.h, w = Math.max(3, Math.round(h * 0.36));
  const body = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y }, hr = Math.max(1.5, h * 0.11);
  const head = { x0: p.x - hr, x1: p.x + hr, y0: p.y - h, y1: p.y - h + hr * 2.1 };
  let clip = null;
  if (p.zone === 'window') { const b = L.mid[p.b]; clip = b.wins.filter((wn) => wn.floor === p.floor && p.x > wn.x - 2 && p.x < wn.x + wn.w + 2)[0] || { x: -99, y: -99, w: 0, h: 0 }; }
  return { body, head, clip };
}
const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
// 탄착점에 있는 사람(가장 가까운 사람 우선). 머리면 headshot
export function hitAt(st, L, x, y) {
  let best = null;
  for (const p of st.people) {
    if (p.state === 'down' || p.state === 'hidden' || p.state === 'gone') continue;
    const bx = boxes(p, L);
    if (bx.clip && !(x >= bx.clip.x && x <= bx.clip.x + bx.clip.w && y >= bx.clip.y && y <= bx.clip.y + bx.clip.h)) continue;
    if (!inBox(bx.body, x, y)) continue;
    if (!best || p.d < best.p.d) best = { p, head: inBox(bx.head, x, y) };
  }
  return best;
}
// 조준점 → 거리, 탄착점, 비행 시간
export function aimSolution(st, L, ax, ay) {
  const p = hitAt(st, L, ax, ay);
  const d = p ? p.p.d : depthAt(L, ax, ay);
  if (!isFinite(d)) return { d: Infinity, x: ax, y: ay, t: 0.8 };
  const off = impactOffset(d, st.cfg.wind);
  return { d, x: ax + off.dx, y: ay + off.dy, t: flightTime(d), dropM: dropM(d), driftM: driftM(d, st.cfg.wind) };
}
// 한 발 쏜 결과를 반영한다
export function resolveShot(st, L, x, y) {
  st.shots--;
  const h = hitAt(st, L, x, y);
  if (h && h.p.target) { h.p.state = 'down'; st.over = { win: true, head: h.head, shotsUsed: 3 - st.shots }; return { kind: 'target', head: h.head }; }
  if (h) { h.p.state = 'down'; st.over = { win: false, why: 'civilian' }; return { kind: 'civilian' }; }
  startPanic(st);
  if (st.shots <= 0) st.over = { win: false, why: 'ammo' };
  return { kind: 'miss' };
}
export function checkOver(st, dt) {
  if (st.over) return st.over;
  st.time += dt;
  if (st.target.state === 'gone') st.over = { win: false, why: 'escaped' };
  else if (st.cfg.limit && st.time >= st.cfg.limit) st.over = { win: false, why: 'time' };
  return st.over;
}
// 별: 성공 1, 첫 발 또는 머리 2, 첫 발 머리 3
export function stars(over) { if (!over || !over.win) return 0; return 1 + (over.head || over.shotsUsed === 1 ? 1 : 0) + (over.head && over.shotsUsed === 1 ? 1 : 0); }

// ---------- 저장 ----------
export const SAVE_KEY = 'sniper.save';
export const defaultSave = () => ({ stars: {}, sound: true, vibrate: true });
export const unlocked = (s, n) => n === 1 || (s.stars[n - 1] || 0) > 0;
export function loadSave(storage) { try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) return { ...defaultSave(), ...d, stars: { ...(d.stars || {}) } }; } catch { /* 새로 */ } return defaultSave(); }
export function storeSave(storage, s) { try { storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
