// 좀비 열차: 생존 관리 로직 (화면과 분리, node --test로 검사)
// 현실 1초 = 게임 5분. 하루 = 약 4.8분. 열차는 연료로 달리고, 난로도 같은 연료를 쓴다.

export const MIN_PER_SEC = 5;
export const START_HOUR = 8;
export const STATION_KM = 50;
export const SAVE_KEY = 'zombieTrain.save';

// 노선: 도시에서 도시로. 목록을 다 돌면 "북쪽 피난처 N"
const CITIES = ['서울', '대전', '대구', '부산', '목포', '광주', '전주', '강릉', '춘천'];
const STATION_NAMES = ['수원', '평택', '천안', '오송', '조치원', '신탄진', '옥천', '영동', '김천', '구미', '왜관', '경산', '청도', '밀양', '삼랑진', '구포', '익산', '정읍', '나주', '함평', '여수', '순천', '남원', '진부', '평창', '횡성', '가평', '청평', '양평', '원주'];
export const STATION_TYPES = [
  { id: 'store', name: '편의점', food: 2.2, fuel: 0.6, scrap: 0.8, meds: 0.15, line: '진열대에 통조림이 남아 있을지도 몰라요.' },
  { id: 'depot', name: '연료 창고', food: 0.4, fuel: 2.4, scrap: 1, meds: 0.05, line: '석탄 자루와 기름통이 보여요.' },
  { id: 'garage', name: '정비소', food: 0.3, fuel: 1, scrap: 2.4, meds: 0.05, line: '고철과 공구가 굴러다녀요.' },
  { id: 'clinic', name: '약국', food: 0.6, fuel: 0.4, scrap: 0.6, meds: 0.7, line: '깨진 유리문 너머로 약상자가 보여요.' },
  { id: 'plain', name: '빈 역', food: 1, fuel: 1, scrap: 1, meds: 0.12, line: '조용하네요. 너무 조용해요.' },
];

export function routeConfig(r) {
  const from = r <= CITIES.length - 1 ? CITIES[r - 1] : `북쪽 피난처 ${r - CITIES.length + 1}`;
  const to = r < CITIES.length ? CITIES[r] : `북쪽 피난처 ${r - CITIES.length + 2}`;
  return { route: r, from, to, length: Math.round(400 * 1.35 ** (r - 1) / 50) * 50, danger: 1 + 0.4 * (r - 1) };
}

// 개조: 고철로 산다
export const UPGRADES = [
  { id: 'weapon', name: '무기', icon: '🔧', max: 4, cost: [5, 12, 25, 45], tiers: ['맨손', '렌치', '야구 방망이', '소방 도끼', '네일건'], desc: '창문의 좀비를 한 번 칠 때 피해' },
  { id: 'plate', name: '창문 철판', icon: '🛡️', max: 5, cost: [4, 8, 14, 22, 34], desc: '창문 내구도 +25' },
  { id: 'wire', name: '전기 철조망', icon: '⚡', max: 4, cost: [10, 20, 35, 60], desc: '창문에 붙은 좀비를 저절로 지짐' },
  { id: 'stove', name: '난로 개조', icon: '🔥', max: 3, cost: [6, 14, 28], desc: '더 따뜻하고 연료를 덜 씀' },
  { id: 'blanket', name: '두꺼운 담요', icon: '🛏️', max: 2, cost: [4, 10], desc: '체온 +6, 잘 때 체력 회복 +1' },
  { id: 'garden', name: '창가 텃밭', icon: '🌱', max: 3, cost: [8, 16, 30], desc: '하루에 식량 +1.2, 기분 +' },
  { id: 'engine', name: '엔진 정비', icon: '⚙️', max: 4, cost: [8, 16, 30, 50], desc: '열차 속도 +20%' },
  { id: 'radio', name: '라디오', icon: '📻', max: 1, cost: [6], desc: '음악으로 기분 +, 좀비 떼 경보와 다음 역 정보' },
  { id: 'feeder', name: '자동 급식기', icon: '🥣', max: 1, cost: [12], desc: '배고프면 통조림을 알아서 줌' },
  { id: 'medkit', name: '구급상자', icon: '🩹', max: 1, cost: [15], desc: '체력이 30 아래면 약을 알아서 먹임' },
];
export const upgrade = (id) => UPGRADES.find((u) => u.id === id);
export const upgradeCost = (s, id) => { const u = upgrade(id), lv = s.up[id] || 0; return lv >= u.max ? Infinity : u.cost[lv]; };
export function buyUpgrade(s, id) {
  const c = upgradeCost(s, id);
  if (!(s.scrap >= c)) return false;
  s.scrap -= c; s.up[id] = (s.up[id] || 0) + 1;
  if (id === 'plate') s.barricade = Math.min(barricadeMax(s), s.barricade + 25);
  return true;
}

export const WEAPON_DMG = [1, 2, 3, 5, 7];
export const weaponDmg = (s) => WEAPON_DMG[s.up.weapon || 0];
export const barricadeMax = (s) => 40 + 25 * (s.up.plate || 0);
export const speedKmh = (s) => 18 * (1 + 0.2 * (s.up.engine || 0));
export const ENGINE_FUEL = 0.5;            // 시간당
export const stoveFuel = (s) => 0.35 * (1 - 0.12 * (s.up.stove || 0));

// ---------- 시간 ----------
export const hourOf = (s) => ((s.minutes / 60) % 24 + 24) % 24;
export const dayOf = (s) => Math.floor(s.minutes / 1440) + 1;
export const isNight = (h) => h >= 20 || h < 6;
export function clock(s) {
  const m = Math.floor(s.minutes % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
// 4일에 한 번 밤에 좀비 떼
export const hordeNight = (s) => dayOf(s) % 4 === 0;
// 바깥 밝기 0(밤)~1(낮), 새벽·저녁은 부드럽게
export function daylight(h) {
  if (h >= 7 && h < 17) return 1;
  if (h >= 5 && h < 7) return (h - 5) / 2;
  if (h >= 17 && h < 20) return 1 - (h - 17) / 3;
  return 0;
}

export function defaultSave() {
  const s = {
    v: 1, route: 1, km: 0, minutes: START_HOUR * 60, nextStation: STATION_KM,
    hunger: 80, warmth: 60, health: 100, mood: 70,
    food: 4, fuel: 10, scrap: 4, meds: 1,
    barricade: 40, stoveOn: true,
    up: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    zombie: null, station: null, arrived: false, dead: null,
    kills: 0, runDays: 0, best: { days: 0, route: 1 }, cleared: 0,
    sound: true, vibrate: true, lastSeen: Date.now(),
  };
  return s;
}

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

// 생존 수치가 h시간 동안 변한다(열차가 달리는지와 관계없이)
export function survive(s, h, { moving = false } = {}) {
  const hr = hourOf(s), night = isNight(hr);
  // 연료
  let burn = (moving ? ENGINE_FUEL : 0) + (s.stoveOn ? stoveFuel(s) : 0);
  s.fuel = Math.max(0, s.fuel - burn * h);
  const lit = s.stoveOn && s.fuel > 0;
  // 배고픔
  s.hunger = clamp(s.hunger - 6 * h);
  if (s.up.feeder && s.hunger < 35 && s.food >= 1) feed(s);
  // 텃밭
  if (s.up.garden) s.food += (1.2 / 24) * s.up.garden * h;
  // 체온: 바깥(밤엔 더 춥다) 또는 난로 쪽으로 다가간다
  const outside = (night ? 6 : 22) + 6 * (s.up.blanket || 0);
  const target = lit ? Math.min(100, 62 + 10 * (s.up.stove || 0) + 6 * (s.up.blanket || 0)) : outside;
  s.warmth = clamp(s.warmth + (target - s.warmth) * (1 - Math.exp(-h / 2.5)));
  // 기분
  const cozy = 50 + 10 * (s.up.radio || 0) + 5 * (s.up.garden || 0) + (lit ? 8 : -6) - (s.hunger < 25 ? 15 : 0) - (s.warmth < 30 ? 12 : 0);
  s.mood = clamp(s.mood + (cozy - s.mood) * (1 - Math.exp(-h / 6)));
  // 체력
  let dh = 0;
  if (s.hunger <= 0) dh -= 8;
  if (s.warmth < 20) dh -= (20 - s.warmth) * 0.4;
  if (s.hunger > 40 && s.warmth > 45 && s.mood > 30) dh += (2 + (s.up.blanket || 0)) * (night ? 1.5 : 1);
  s.health = clamp(s.health + dh * h);
  if (s.up.medkit && s.health < 30 && s.meds >= 1) heal(s);
  s.minutes += h * 60;
  if (s.health <= 0 && !s.dead) s.dead = s.hunger <= 0 ? 'hunger' : s.warmth < 20 ? 'cold' : 'zombie';
}

// 좀비 출현 빈도(게임 시간당)
export function zombieRate(s) {
  const cfg = routeConfig(s.route), night = isNight(hourOf(s));
  let r = (night ? 0.9 : 0.25) * cfg.danger * (0.7 + 0.6 * Math.min(1, s.km / cfg.length));
  if (night && hordeNight(s)) r *= 2.2;
  if (s.fuel <= 0) r *= 1.5;   // 멈춘 열차는 표적이 된다
  return r;
}
export function spawnZombie(s) {
  const cfg = routeConfig(s.route);
  const hp = Math.round(3 + 2.5 * cfg.danger + Math.random() * 2);
  s.zombie = { hp, max: hp, t: 0 };
}
export const zombieDps = (s) => 1.5 + 0.9 * routeConfig(s.route).danger;   // 현실 초당
export const ZOMBIE_APPROACH = 1.4;   // 창문에 붙기까지(현실 초)

// 한 프레임 진행. dt는 현실 초. 역에 서 있거나 끝났으면 멈춘다.
export function step(s, dt, rnd = Math.random) {
  if (s.station || s.arrived || s.dead) return [];
  const ev = [];
  const h = (dt * MIN_PER_SEC) / 60;
  const moving = s.fuel > 0;
  const before = dayOf(s);
  survive(s, h, { moving });
  if (dayOf(s) !== before) { s.runDays++; ev.push('day'); }
  if (moving) s.km += speedKmh(s) * h;
  const cfg = routeConfig(s.route);
  // 좀비
  if (!s.zombie) {
    if (rnd() < 1 - Math.exp(-zombieRate(s) * h)) { spawnZombie(s); ev.push('zombie'); }
  } else {
    const z = s.zombie;
    z.t += dt;
    if (z.t > ZOMBIE_APPROACH) {
      if (s.up.wire) { z.hp -= 0.6 * s.up.wire * dt; if (z.hp <= 0) { killZombie(s, rnd); ev.push('zap'); } }
      if (s.zombie) {
        const d = zombieDps(s) * dt;
        if (s.barricade > 0) s.barricade = Math.max(0, s.barricade - d);
        else { s.health = clamp(s.health - d * 0.7); s.mood = clamp(s.mood - d * 0.5); if (s.health <= 0 && !s.dead) s.dead = 'zombie'; }
      }
    }
  }
  if (s.km >= cfg.length) { s.km = cfg.length; s.arrived = true; ev.push('arrive'); }
  else if (s.km >= s.nextStation) { s.station = makeStation(s, rnd); s.nextStation += STATION_KM; ev.push('station'); }
  if (s.dead) ev.push('dead');
  return ev;
}

// ---------- 행동 ----------
export function feed(s) {
  if (s.food < 1) return false;
  s.food -= 1; s.hunger = clamp(s.hunger + 30); s.mood = clamp(s.mood + 3);
  return true;
}
export function heal(s) {
  if (s.meds < 1 || s.health >= 100) return false;
  s.meds -= 1; s.health = clamp(s.health + 40);
  return true;
}
export const REPAIR_COST = 2;
export function repair(s) {
  if (s.scrap < REPAIR_COST || s.barricade >= barricadeMax(s)) return false;
  s.scrap -= REPAIR_COST; s.barricade = Math.min(barricadeMax(s), s.barricade + 25);
  return true;
}
export function toggleStove(s) { s.stoveOn = !s.stoveOn; return s.stoveOn; }
export function pet(s) { s.mood = clamp(s.mood + 4); }
export function hitZombie(s, rnd = Math.random) {
  const z = s.zombie;
  if (!z || z.t < ZOMBIE_APPROACH * 0.6) return null;
  z.hp -= weaponDmg(s);
  if (z.hp <= 0) return killZombie(s, rnd);
  return { killed: false };
}
function killZombie(s, rnd) {
  s.zombie = null; s.kills++;
  s.mood = clamp(s.mood + 2);
  const scrap = rnd() < 0.6 ? 1 : 0, food = rnd() < 0.08 ? 1 : 0;
  s.scrap += scrap; s.food += food;
  return { killed: true, scrap, food };
}

// 연료가 바닥나 멈췄을 때: 밖에 나가 땔감을 구한다(2시간, 위험)
export function forage(s, rnd = Math.random) {
  if (s.station || s.dead || s.arrived) return null;
  survive(s, 2, { moving: false });
  const fuel = 2 + Math.floor(rnd() * 3);
  s.fuel += fuel;
  const hurt = rnd() < 0.25 * routeConfig(s.route).danger / (1 + 0.3 * (s.up.weapon || 0)) ? Math.round(8 + rnd() * 12) : 0;
  s.health = clamp(s.health - hurt);
  if (s.health <= 0 && !s.dead) s.dead = 'zombie';
  return { fuel, hurt };
}

// ---------- 역 ----------
export function makeStation(s, rnd = Math.random) {
  const idx = Math.floor(s.nextStation / STATION_KM) + s.route * 7;
  const type = STATION_TYPES[Math.floor(rnd() * STATION_TYPES.length)];
  return { name: `${STATION_NAMES[idx % STATION_NAMES.length]}역`, type: type.id, km: s.nextStation };
}
export const SEARCH = {
  quick: { name: '빠르게 둘러보기', hours: 1, mult: 1, risk: 0.1 },
  deep: { name: '꼼꼼히 수색하기', hours: 3, mult: 2.2, risk: 0.35 },
};
export function searchRisk(s, kind) {
  return Math.min(0.9, SEARCH[kind].risk * routeConfig(s.route).danger / (1 + 0.3 * (s.up.weapon || 0)) * (s.mood < 30 ? 1.3 : 1));
}
// kind: 'quick' | 'deep' | 'leave'
export function resolveStation(s, kind, rnd = Math.random) {
  const st = s.station;
  if (!st) return null;
  s.station = null;
  if (kind === 'leave') return { kind, gains: {}, hurt: 0 };
  const opt = SEARCH[kind], type = STATION_TYPES.find((t) => t.id === st.type);
  survive(s, opt.hours, { moving: false });
  const roll = (base) => Math.floor(base * opt.mult * (0.5 + rnd()) + rnd() * 0.999);
  const gains = { food: roll(type.food * 0.5), fuel: roll(type.fuel * 0.9), scrap: roll(type.scrap * 1.4), meds: rnd() < type.meds * opt.mult ? 1 : 0 };
  for (const k of Object.keys(gains)) s[k] += gains[k];
  const hurt = rnd() < searchRisk(s, kind) ? Math.round((10 + rnd() * 15) * Math.sqrt(routeConfig(s.route).danger)) : 0;
  if (hurt) { s.health = clamp(s.health - hurt); s.mood = clamp(s.mood - 10); }
  if (s.health <= 0 && !s.dead) s.dead = 'zombie';
  return { kind, gains, hurt };
}

// ---------- 노선 끝, 죽음 ----------
export function nextRoute(s) {
  s.cleared++;
  s.route++; s.km = 0; s.nextStation = STATION_KM; s.arrived = false; s.zombie = null;
  s.scrap += 5 + 3 * s.route;
  s.barricade = barricadeMax(s);
  s.best.route = Math.max(s.best.route, s.route);
}
// 다시 시작: 개조는 남고, 같은 노선을 처음부터, 물자는 처음 값
export function restart(s) {
  s.best.days = Math.max(s.best.days, s.runDays);
  const keep = { up: s.up, best: s.best, route: s.route, kills: s.kills, cleared: s.cleared, sound: s.sound, vibrate: s.vibrate };
  Object.assign(s, defaultSave(), keep);
  s.barricade = barricadeMax(s);
}

export function loadSave(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw), s = defaultSave();
      Object.assign(s, d, { up: { ...s.up, ...(d.up || {}) }, best: { ...s.best, ...(d.best || {}) } });
      return s;
    }
  } catch { /* 깨진 저장은 새로 */ }
  return defaultSave();
}
export function storeSave(storage, s) {
  try { s.lastSeen = Date.now(); storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ }
}

export function fmt(n) { return n >= 10 ? String(Math.floor(n)) : n >= 1 ? n.toFixed(1).replace(/\.0$/, '') : n > 0 ? n.toFixed(1) : '0'; }
