// 3D 스나이퍼(작업 중): 탄도, 스테이지, 배치, 움직임, 결과 (화면과 분리, node --test로 검사)
// 단위는 m. three.js 좌표: x 오른쪽, y 위, -z 앞. 저격수는 옥상(CAM)에서 -z 쪽 도시를 내려다본다.

export const CAM = { x: 0, y: 30, z: 0 };
export const V0 = 900;                    // 총구 속도 m/s
export const G = 9.81;
export const ZERO = 250;                  // 영점(이 거리에서 조준점 = 탄착점)
export const PERSON_M = 1.75;

// 비행 시간: 공기 저항으로 멀수록 조금씩 느려진다
export const flightTime = (d) => (d / V0) * (1 + d / 4000);
const rawDrop = (d) => 0.5 * G * flightTime(d) ** 2;
// 낙차(m, 아래가 +): 영점 거리에 맞춘 조준선 기준
export const dropM = (d) => rawDrop(d) - (rawDrop(ZERO) * d) / ZERO;
// 바람 편류(m, 바람 방향 +): 진공에서보다 늦어진 시간만큼 바람에 밀린다
export const driftM = (d, wind) => wind * (flightTime(d) - d / V0) * 2.2;
export const mil = (m, d) => (m / d) * 1000;

// ---------- 흔들림과 숨 참기 ----------
export const BREATH_HOLD = 3.5, BREATH_REGEN = 4, EXHAUST = 2.5;
export const newBreath = () => ({ stamina: 1, exhaust: 0, holding: false });
export function breathStep(b, dt, holding) {
  if (b.exhaust > 0) { b.exhaust = Math.max(0, b.exhaust - dt); b.holding = false; b.stamina = Math.min(1, b.stamina + dt / BREATH_REGEN); return b; }
  b.holding = holding && b.stamina > 0;
  if (b.holding) { b.stamina -= dt / BREATH_HOLD; if (b.stamina <= 0) { b.stamina = 0; b.exhaust = EXHAUST; b.holding = false; } }
  else b.stamina = Math.min(1, b.stamina + dt / BREATH_REGEN);
  return b;
}
// 조준 흔들림(라디안: 가로, 세로). 숨을 참으면 거의 멈추고, 숨이 차면 크게 흔들린다
export const SWAY_RAD = 0.00068;
export function sway(t, b) {
  const amp = SWAY_RAD * (b.holding ? 0.1 : b.exhaust > 0 ? 2.3 : 1);
  return { yaw: amp * (Math.sin(t * 1.1) + 0.5 * Math.sin(t * 2.7 + 1)), pitch: amp * 0.8 * (Math.sin(t * 1.7 + 2) + 0.4 * Math.sin(t * 3.9)) };
}

// ---------- 난수 ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 도시 배치 ----------
// 거리(가까운 인도·도로·먼 인도) → 강변 공원 → 맞은편 사무실 건물 3채 → 먼 빌딩들
export const STREET = { near0: -150, near1: -157, road0: -157, road1: -175, far0: -175, far1: -182, x0: -150, x1: 150 };
export const PARK = { z0: -182, z1: -292 };
export const FLOOR_H = 3.6, WIN_W = 2.2, WIN_SILL = 0.9, WIN_H = 2.0, COL_W = 4.2;
export function cityLayout(seed = 1) {
  const r = rng(seed);
  const mid = [];
  const specs = [{ x: -112, w: 76, h: 46 }, { x: -12, w: 88, h: 58 }, { x: 96, w: 72, h: 42 }];
  specs.forEach((s, i) => {
    const z = -300 - i % 2 * 6, cols = Math.floor((s.w - 6) / COL_W), floors = Math.floor((s.h - 6) / FLOOR_H), wins = [];
    const x0 = s.x - s.w / 2 + (s.w - cols * COL_W) / 2;
    for (let f = 1; f < floors; f++) for (let c = 0; c < cols; c++) {
      const cx = x0 + c * COL_W + COL_W / 2, y = f * FLOOR_H;
      wins.push({ x0: cx - WIN_W / 2, x1: cx + WIN_W / 2, y0: y + WIN_SILL, y1: y + WIN_SILL + WIN_H, floor: f, col: c, lit: r() < 0.55, cx });
    }
    mid.push({ i, x: s.x, w: s.w, h: s.h, z, depth: 28, cols, floors, wins, color: i });
  });
  const far = [];
  for (let x = -330; x < 330;) {
    const w = 22 + r() * 30, z = -480 - r() * 160, h = 45 + r() * 70;
    far.push({ x: x + w / 2, w, z, depth: 20 + r() * 20, h });
    x += w + 2 + r() * 10;
  }
  const trees = [];
  for (let x = -140; x <= 140; x += 22 + r() * 8) trees.push({ x, z: STREET.far1 - 4 });
  for (let i = 0; i < 40; i++) trees.push({ x: -150 + r() * 300, z: PARK.z0 - 12 - r() * (PARK.z0 - PARK.z1 - 30) });
  const lamps = [];
  for (let x = -130; x <= 130; x += 52) lamps.push({ x, z: STREET.near1 + 0.5 });
  return { mid, far, trees, lamps };
}
export const dist = (p) => Math.hypot(p.x - CAM.x, p.y - CAM.y, p.z - CAM.z);

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
export const PANTS = ['#2a3348', '#4a4038', '#1e1e22', '#6a6a70', '#3a4a6a'];
export const SKIN = ['#f0c8a0', '#d8a878', '#b07850', '#7a5038'];
export const HAIR = ['#2a1a10', '#6a3a1a', '#c89a4a', '#1a1a1a', '#8a8a8a'];
export const traitText = (t, keys) => keys.map((k) => (k === 'hat' ? HATS.find((h) => h.id === t.hat).name : k === 'shirt' ? SHIRTS.find((s) => s.id === t.shirt).name : ACCS.find((a) => a.id === t.acc).name)).filter(Boolean).join(' · ');
const matches = (a, b, keys) => keys.every((k) => a[k] === b[k]);

// ---------- 스테이지 ----------
// zone: street(거리) | window(맞은편 창가) | roof(먼 옥상), motion: stand | walk | hop(창문 사이를 오감)
const PLAN = [
  { time: 'day', zone: 'street', motion: 'stand', crowd: 4, wind: 0, guide: true, keys: ['shirt'] },
  { time: 'day', zone: 'window', motion: 'stand', crowd: 5, wind: 1, guide: true, keys: ['shirt'] },
  { time: 'day', zone: 'street', motion: 'walk', crowd: 7, wind: 0, guide: true, keys: ['hat'] },
  { time: 'day', zone: 'street', motion: 'stand', crowd: 12, wind: 2, keys: ['hat', 'acc'] },
  { time: 'day', zone: 'window', motion: 'hop', crowd: 10, wind: 2, keys: ['shirt', 'hat'] },
  { time: 'day', zone: 'roof', motion: 'stand', crowd: 6, wind: 3, keys: ['shirt'] },
  { time: 'dusk', zone: 'street', motion: 'walk', crowd: 16, wind: 2, keys: ['acc', 'shirt'] },
  { time: 'night', zone: 'window', motion: 'stand', crowd: 10, wind: 3, keys: ['hat', 'shirt'] },
  { time: 'day', zone: 'street', motion: 'walk', crowd: 18, wind: 4, keys: ['hat', 'shirt'], limit: 40 },
  { time: 'dusk', zone: 'roof', motion: 'walk', crowd: 8, wind: 5, keys: ['acc', 'shirt'] },
  { time: 'night', zone: 'street', motion: 'walk', crowd: 18, wind: 3, keys: ['hat', 'acc', 'shirt'], limit: 45 },
  { time: 'day', zone: 'window', motion: 'hop', crowd: 16, wind: 4, keys: ['hat', 'acc', 'shirt'], limit: 40 },
  { time: 'night', zone: 'roof', motion: 'walk', crowd: 10, wind: 6, keys: ['hat', 'shirt'] },
  { time: 'dusk', zone: 'street', motion: 'walk', crowd: 24, wind: 5, keys: ['hat', 'acc', 'shirt'], limit: 35 },
  { time: 'night', zone: 'window', motion: 'hop', crowd: 18, wind: 6, keys: ['hat', 'acc', 'shirt'], limit: 35 },
];
export const STAGE_COUNT = PLAN.length;
export function stageConfig(n) {
  if (n <= PLAN.length) return { n, ...PLAN[n - 1], wind: PLAN[n - 1].wind * (n % 2 ? 1 : -1) };
  const zones = ['street', 'window', 'roof'], times = ['day', 'dusk', 'night'];
  return { n, time: times[n % 3], zone: zones[n % 3], motion: n % 3 === 1 ? 'hop' : 'walk', crowd: Math.min(30, 16 + n - 15), wind: Math.min(9, 4 + (n - 15) * 0.4) * (n % 2 ? 1 : -1), keys: ['hat', 'acc', 'shirt'], limit: Math.max(20, 40 - (n - 15)) };
}
function randomTraits(r) {
  return {
    hat: HATS[Math.floor(r() * HATS.length)].id, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)].id, acc: r() < 0.55 ? 'none' : ACCS[1 + Math.floor(r() * 4)].id,
    pants: PANTS[Math.floor(r() * PANTS.length)], skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)],
  };
}
// 표적이 있을 만한 범위(조준경으로 찾을 수 있게 가운데 쪽)
const SPREAD = { street: 70, window: 999, roof: 999 };
function place(C, r, zone, motion, idx, central) {
  const p = { id: idx, zone, state: 'idle', panic: 0, fall: 0, phase: r() * 6, dir: r() < 0.5 ? -1 : 1 };
  if (zone === 'street') {
    const far = r() < 0.45, s = STREET;
    p.z = far ? s.far0 - 1 - r() * (s.far0 - s.far1 - 2) : s.near0 - 1 - r() * (s.near0 - s.near1 - 2);
    p.y = 0; p.x = (r() * 2 - 1) * (central ? SPREAD.street : 135);
    p.speed = motion === 'walk' ? 1.1 + r() * 0.6 : 0; p.x0 = s.x0; p.x1 = s.x1;
  } else if (zone === 'window') {
    const b = C.mid[Math.floor(r() * C.mid.length)], w = b.wins[Math.floor(r() * b.wins.length)];
    p.b = b.i; p.floor = w.floor; p.x = w.cx; p.y = w.floor * FLOOR_H; p.z = b.z - 1.2;
    p.speed = motion === 'hop' ? 0.9 : 0; p.x0 = b.x - b.w / 2 + 2; p.x1 = b.x + b.w / 2 - 2;
  } else {
    const fb = C.far.filter((f) => Math.abs(f.x) < 160), f = fb[Math.floor(r() * fb.length)];
    p.roof = C.far.indexOf(f); p.y = f.h; p.z = f.z + f.depth / 2 - 1.5 - r() * 3; p.x = f.x + (r() - 0.5) * (f.w - 4);
    p.x0 = f.x - f.w / 2 + 1.5; p.x1 = f.x + f.w / 2 - 1.5; p.speed = motion === 'walk' ? 0.8 : 0;
  }
  return p;
}
// 스테이지 만들기: 표적 1명 + 군중(일부는 표적과 특징을 나눠 가진 "닮은 사람")
export function buildStage(n, C, seed = n * 7919) {
  const cfg = stageConfig(n), r = rng(seed);
  const target = randomTraits(r);
  if (cfg.keys.includes('acc') && target.acc === 'none') target.acc = ACCS[1 + Math.floor(r() * 4)].id;
  if (cfg.keys.includes('hat') && target.hat === 'none') target.hat = HATS[1 + Math.floor(r() * 4)].id;   // '모자 없음'은 단서로 쓰지 않는다
  const people = [], tp = place(C, r, cfg.zone, cfg.motion, 0, true);
  tp.traits = target; tp.target = true; people.push(tp);
  for (let i = 1; i <= cfg.crowd; i++) {
    let t;
    for (let tries = 0; tries < 30; tries++) {
      t = randomTraits(r);
      if (r() < 0.5) { const k = cfg.keys[Math.floor(r() * cfg.keys.length)]; t[k] = target[k]; }   // 닮은 사람
      if (!matches(t, target, cfg.keys)) break;
    }
    const zone = r() < 0.65 ? cfg.zone : ['street', 'window', 'roof'][Math.floor(r() * 3)];
    const p = place(C, r, zone, zone === cfg.zone ? cfg.motion : (zone === 'window' ? 'stand' : 'walk'), i, r() < 0.6);
    p.traits = t; people.push(p);
  }
  const cars = [];
  for (let i = 0; i < 5; i++) {
    const lane = i % 2;
    cars.push({ x: -150 + r() * 300, z: lane ? STREET.road0 - 4.5 : STREET.road1 + 4.5, dir: lane ? 1 : -1, speed: 8 + r() * 5, color: ['#b83a32', '#3a5ab8', '#e0c040', '#e6e6e6', '#2a2a2a', '#3a8a4a'][Math.floor(r() * 6)] });
  }
  return { cfg, people, cars, target: tp, desc: traitText(target, cfg.keys), shots: 3, time: 0, over: null, panic: false };
}

// ---------- 움직임 ----------
export function stepPeople(st, C, dt) {
  for (const p of st.people) {
    if (p.state === 'down') { p.fall = Math.min(1, p.fall + dt * 2.5); continue; }
    if (p.state === 'hidden') { p.hideT -= dt; if (p.hideT <= 0) reappear(p, C); continue; }
    const sp = p.speed * (p.panic ? 2.6 : 1);
    if (sp > 0) {
      p.x += sp * p.dir * dt; p.phase += dt * sp * 3.2;
      if (p.panic && p.target && p.zone === 'street') { if (p.x < STREET.x0 - 10 || p.x > STREET.x1 + 10) p.state = 'gone'; }
      else { if (p.x < p.x0) { p.x = p.x0; p.dir = 1; } if (p.x > p.x1) { p.x = p.x1; p.dir = -1; } }
    }
  }
  for (const c of st.cars) { c.x += c.speed * c.dir * dt; if (c.x > 170) c.x = -170; if (c.x < -170) c.x = 170; }
}
// 창가 표적은 숨었다가 같은 건물의 다른 창문에 나타난다
function reappear(p, C, r = Math.random) {
  const b = C.mid[p.b], w = b.wins[Math.floor(r() * b.wins.length)];
  p.x = w.cx; p.floor = w.floor; p.y = w.floor * FLOOR_H; p.state = 'idle';
}
// 놓치면: 거리 사람들은 달아나고, 창가 사람들은 숨는다
export function startPanic(st) {
  if (st.panic) return; st.panic = true;
  for (const p of st.people) {
    if (p.state === 'down') continue;
    p.panic = 1;
    if (p.zone === 'street') { if (!p.speed) p.speed = 1.3; if (p.target) p.dir = p.x < 0 ? -1 : 1; }
    else if (p.zone === 'window') { p.state = 'hidden'; p.hideT = p.target ? 2.5 : 999; }
    else if (!p.speed) p.speed = 0.9;
  }
}

// ---------- 결과 ----------
// 한 발의 결과. hit = { person, head } | null (화면이 레이캐스트로 찾아 넘긴다)
export function resolveShot(st, hit) {
  st.shots--;
  if (hit && hit.person.target) { hit.person.state = 'down'; st.over = { win: true, head: !!hit.head, shotsUsed: 3 - st.shots }; return { kind: 'target', head: !!hit.head }; }
  if (hit) { hit.person.state = 'down'; st.over = { win: false, why: 'civilian' }; return { kind: 'civilian' }; }
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
export const SAVE_KEY = 'sniper3d.save';
export const defaultSave = () => ({ stars: {}, sound: true, vibrate: true });
export const unlocked = (s, n) => n === 1 || (s.stars[n - 1] || 0) > 0;
export function loadSave(storage) { try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) return { ...defaultSave(), ...d, stars: { ...(d.stars || {}) } }; } catch { /* 새로 */ } return defaultSave(); }
export function storeSave(storage, s) { try { storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
