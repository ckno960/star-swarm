// 쓰레기 행성 — 우주로 보낸 쓰레기를 먹고 무거워진 행성이 지구로 끌려오는 방치형 게임. 화면과 분리된 순수 로직.

export const START_KM = 384400;     // 처음 거리(달까지 거리)
export const END_MASS = 1e11;       // 이 질량(톤)이 되면 충돌
export const COST_GROWTH = 1.15;    // 같은 발사대를 하나 더 살 때마다 값 ×1.15
export const MILESTONES = [25, 50, 100, 200];   // 이만큼 모으면 그 발사대 생산 ×2씩
export const OFFLINE_CAP = 8 * 3600;
export const TAP_BASE_COST = 50;
export const TAP_COST_GROWTH = 12;

// 회수 기간(값 ÷ 생산)이 모두 100초 안팎이라, 위 단계일수록 한 번에 크게 늘어난다
export const LAUNCHERS = [
  { id: 'bag', name: '봉투 던지기 부대', desc: '동네 사람들이 쓰레기 봉투를 하늘 높이 던져요', cost: 15, rate: 0.15 },
  { id: 'truck', name: '쓰레기 트럭 점프대', desc: '트럭이 점프대에서 쓰레기를 쏟아 올려요', cost: 100, rate: 1 },
  { id: 'sling', name: '거대 새총', desc: '빌딩 사이에 건 고무줄로 쓰레기를 쏘아요', cost: 1100, rate: 11 },
  { id: 'rocket', name: '쓰레기 로켓', desc: '폐플라스틱을 꽉 채운 로켓', cost: 12000, rate: 120 },
  { id: 'base', name: '우주 발사 기지', desc: '쓰레기 로켓을 줄지어 쏘아 올려요', cost: 1.3e5, rate: 1300 },
  { id: 'elevator', name: '우주 엘리베이터', desc: '쓰레기를 실은 승강기가 우주까지 올라가요', cost: 1.4e6, rate: 14000 },
  { id: 'landfill', name: '매립지 통째로 발사', desc: '산처럼 쌓인 매립지를 한꺼번에', cost: 2e7, rate: 2e5 },
  { id: 'ruins', name: '폐허 도시 발사', desc: '버려진 도시를 통째로 뜯어 보내요', cost: 3.3e8, rate: 3.3e6 },
  { id: 'island', name: '바다 쓰레기섬 견인', desc: '태평양 쓰레기섬을 끌어 올려요', cost: 5e9, rate: 5e7 },
  { id: 'cannon', name: '쓰레기 산맥 대포', desc: '쓰레기로 만든 산맥을 대포로 쏘아요', cost: 7.5e10, rate: 7.5e8 },
];

// 다가올수록 벌어지는 일(진행도 p 기준)
export const EVENTS = [
  { p: 0, news: '오늘도 쓰레기를 우주로! 쓰레기 걱정 끝?' },
  { p: 0.08, news: '천문대 "보낸 쓰레기를 먹고 작은 천체가 자라고 있다"' },
  { p: 0.16, news: '속보: 쓰레기를 먹은 천체, 달만큼 커졌다' },
  { p: 0.32, news: '수성보다 커진 천체… 학계 충격' },
  { p: 0.53, news: '속보: 붉은 화성급 행성으로 성장' },
  { p: 0.6, news: '두꺼운 구름에 덮인 금성급 행성, 낮에도 또렷하다' },
  { p: 0.64, news: '바닷물이 비정상적으로 차오른다, 해안 침수 주의' },
  { p: 0.67, news: '속보: 해왕성급 거대 얼음 행성으로' },
  { p: 0.76, news: '곳곳에서 지진, 건물이 무너지기 시작' },
  { p: 0.81, news: '하늘에 거대한 고리가… 토성급 행성' },
  { p: 0.86, news: '하늘에서 불덩이가 떨어진다! 대피하세요' },
  { p: 0.89, news: '목성급 가스 행성이 해를 가린다' },
  { p: 0.94, news: '긴급: 조석 마찰로 행성이 달아올라 붉게 빛난다' },
  { p: 0.98, news: '…안녕, 지구' },
];

// 쓰레기를 먹을수록 실제 천체 크기 순서대로 바뀐다(진행도 p 기준): 명왕성 1,188km → … → 목성 69,911km
export const PLANET_TYPES = [
  { id: 'pluto', name: '명왕성', from: 0 },
  { id: 'europa', name: '유로파', from: 0.08 },
  { id: 'moon', name: '달', from: 0.16 },
  { id: 'io', name: '이오', from: 0.24 },
  { id: 'mercury', name: '수성', from: 0.32 },
  { id: 'titan', name: '타이탄', from: 0.39 },
  { id: 'ganymede', name: '가니메데', from: 0.46 },
  { id: 'mars', name: '화성', from: 0.53 },
  { id: 'venus', name: '금성', from: 0.6 },
  { id: 'neptune', name: '해왕성', from: 0.67 },
  { id: 'uranus', name: '천왕성', from: 0.74 },
  { id: 'saturn', name: '토성', from: 0.81 },
  { id: 'jupiter', name: '목성', from: 0.89 },
];
export const BLEND = 0.025;   // 바뀌기 직전 이만큼 동안 서서히 섞인다
export function planetStage(p) {
  let i = 0;
  while (i + 1 < PLANET_TYPES.length && p >= PLANET_TYPES[i + 1].from) i++;
  const next = PLANET_TYPES[i + 1];
  const blend = next ? Math.max(0, Math.min(1, (p - (next.from - BLEND)) / BLEND)) : 0;
  return { type: PLANET_TYPES[i], next: next || null, blend };
}

export const prestigeMult = (save) => 2 ** (save.earths || 0);
export function milestoneMult(owned) {
  return 2 ** MILESTONES.filter((m) => owned >= m).length;
}
export function launcherCost(i, owned) {
  return Math.ceil(LAUNCHERS[i].cost * COST_GROWTH ** owned);
}
export function launcherRate(save, i) {
  const n = save.owned[i] || 0;
  return LAUNCHERS[i].rate * n * milestoneMult(n) * prestigeMult(save);
}
export function totalRate(save) {
  return LAUNCHERS.reduce((s, _, i) => s + launcherRate(save, i), 0);
}
export const tapPower = (save) => 2 ** (save.tapLv || 0) * prestigeMult(save);
export const tapCost = (lv) => Math.ceil(TAP_BASE_COST * TAP_COST_GROWTH ** lv);

// 하나 살 때마다 늘어나는 생산(다음 이정표 보너스 포함)
export function nextGain(save, i) {
  const n = save.owned[i] || 0;
  return LAUNCHERS[i].rate * prestigeMult(save) * ((n + 1) * milestoneMult(n + 1) - n * milestoneMult(n));
}

export function buyLauncher(save, i) {
  const c = launcherCost(i, save.owned[i] || 0);
  if (save.money < c) return false;
  save.money -= c;
  save.owned[i] = (save.owned[i] || 0) + 1;
  return true;
}
export function buyTap(save) {
  const c = tapCost(save.tapLv || 0);
  if (save.money < c) return false;
  save.money -= c;
  save.tapLv = (save.tapLv || 0) + 1;
  return true;
}
// 보이는 발사대: 가진 것 + 다음 하나(살 돈의 절반을 모으면 공개)
export function visibleLaunchers(save) {
  let n = 0;
  while (n < LAUNCHERS.length && (save.owned[n] || 0) > 0) n++;
  if (n < LAUNCHERS.length && (n === 0 || save.money >= LAUNCHERS[n].cost * 0.5 || save.seen > n)) n++;
  save.seen = Math.max(save.seen || 0, n);
  return Math.max(n, save.seen);
}

// 쓰레기를 보내면: 질량이 늘고, 보낸 만큼 처리비(원)를 받는다
export function addTrash(save, tons) {
  const t = Math.max(0, tons);
  save.mass = Math.min(END_MASS, save.mass + t);
  save.money += t;
  save.sent += t;
}

// 진행도 0~1: 질량의 자릿수로 정해서, 처음 몇 톤에도 눈에 띄게 다가오고 끝으로 갈수록 무겁다
export function progress(mass) {
  return Math.max(0, Math.min(1, Math.log10(1 + mass) / Math.log10(1 + END_MASS)));
}
export function distanceKm(p) {
  return START_KM * (1 - p) ** 1.5;
}
// 화면에 보이는 반지름(px): 처음엔 낮달처럼 작은 점, 끝에는 화면 폭만큼
export function apparentRadius(p, maxR, minR = 3) {
  return minR * (maxR / minR) ** (p ** 0.95);
}
export function currentNews(p) {
  let n = EVENTS[0];
  for (const e of EVENTS) if (p >= e.p) n = e;
  return n.news;
}

// 자리를 비운 동안: 지금 생산으로 계속 보낸다(최대 8시간, 충돌 직전까지)
export function offlineProgress(save, seconds) {
  const s = Math.min(OFFLINE_CAP, Math.max(0, seconds));
  const before = save.mass;
  const tons = totalRate(save) * s;
  addTrash(save, tons);
  return { seconds: s, tons: save.mass - before, money: tons };
}

// 지구를 부수면: 처음부터 다시, 대신 모든 생산 영구 ×2
export function prestige(save) {
  const keep = { earths: (save.earths || 0) + 1, best: save.best, sound: save.sound, vibrate: save.vibrate };
  const time = save.time;
  if (!save.best || time < save.best) keep.best = time;
  Object.assign(save, defaultSave(), keep);
  return save;
}

export function formatNumber(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const units = [[1e20, '해'], [1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      return (x < 10 ? (Math.floor(x * 10) / 10).toString() : Math.floor(x).toLocaleString('en-US')) + s;
    }
  }
  return String(n);
}
export function formatRate(r) {
  if (r < 10) return (Math.floor(r * 10) / 10).toString();
  return formatNumber(r);
}

export const SAVE_KEY = 'trashMoon.save';
export function defaultSave() {
  return { mass: 0, money: 0, sent: 0, owned: LAUNCHERS.map(() => 0), tapLv: 0, seen: 1, earths: 0, best: 0, time: 0, lastSeen: 0, sound: true, vibrate: true };
}
export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = { ...defaultSave(), ...JSON.parse(raw) };
    const owned = Array.isArray(s.owned) ? s.owned : [];
    s.owned = LAUNCHERS.map((_, i) => Math.max(0, owned[i] | 0));
    for (const k of ['mass', 'money', 'sent', 'time']) s[k] = Math.max(0, +s[k] || 0);
    s.mass = Math.min(END_MASS, s.mass);
    return s;
  } catch {
    return defaultSave();
  }
}
export function storeSave(storage, save) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 */ }
}
