// 정중앙 스매시 — 판정, 점프, 피해, 스테이지, 캐릭터, 저장. 화면과 분리된 순수 로직.
// 길이는 모두 실제 m 단위. 주인공은 1.8m 그대로이고, 대상이 커질수록 화면이 넓어져 주인공이 점처럼 작아진다.

// 바늘 판정: 바늘 위치 p는 -1(왼쪽 끝) ~ 1(오른쪽 끝), 0이 정중앙.
// PERFECT는 리듬게임처럼 시간으로 정한다: 바늘이 정중앙을 지나는 순간 ±25ms.
// 바늘 빠르기와 상관없이 같은 타이밍 감각이 되고, 막대 위 PERFECT 칸은 바늘이 빠를수록 넓게 그려진다.
export const PERFECT_MS = 0.025;
export const PERFECT_ZONE = 0.03;   // 바늘 빠르기를 모를 때 쓰는 기본 폭
export const GREAT_ZONE = 0.15;
export const GOOD_ZONE = 0.4;

// 최고점 판정: 최고점 시각과의 차이(초)
export const APEX_PERFECT = 0.07;
export const APEX_GREAT = 0.16;
export const APEX_OK = 0.32;

export const ACC_PERFECT_MULT = 3;
export const APEX_MULT = { perfect: 2, great: 1.5, ok: 1.15, early: 1, late: 1, none: 1 };
export const DOUBLE_MULT = { perfect: 1.6, great: 1.35, ok: 1.15, early: 1.05, late: 1.05 };
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 5;
export const BASE_DAMAGE = 100;
export const HERO_M = 1.8;
export const BOUNCE_TIME = 0.55;

// ---------- 방치형 ----------
// 시간 제한 없이 자동으로 계속 뛰어 부순다. 직접 누르면 기다리지 않고 바로 뛰고, 정중앙·최고점을 맞혀 훨씬 세게 때린다.
export const HP_BASE = 3000;      // 첫 대상 체력(피해 단위)
export const HP_GROWTH = 1.33;    // 스테이지마다 체력 ×1.33
export const BOSS_HP = 2;
export const COIN_BASE = 20;      // 첫 대상에서 버는 코인
export const COIN_GROWTH = 1.3;
export const HIT_COIN_SHARE = 0.5; // 때릴 때마다 (준 피해 / 체력) × 스테이지 코인 × 0.5, 부수면 스테이지 코인을 한 번 더
export const AUTO_DELAY = 1.2;    // 자동 점프 전에 땅에서 기다리는 시간(초)
export const AUTO_ACC = 0.55;     // 자동 점프의 정확도(1이 정중앙)
export const OFFLINE_CAP = 8 * 3600;

export const UPGRADES = [
  { id: 'power', name: '힘', desc: '모든 피해 +15%', base: 15, growth: 1.17, max: 999 },
  { id: 'auto', name: '자동 점프 속도', desc: '자동 점프 대기 시간 -8%', base: 30, growth: 1.4, max: 12 },
  { id: 'aim', name: '자동 조준', desc: '자동 점프가 정중앙에 더 가까워져요', base: 50, growth: 1.5, max: 10 },
];
export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);
export function upgradeCost(id, lv) {
  const u = upgradeById(id);
  return lv >= u.max ? Infinity : Math.round(u.base * u.growth ** lv);
}
export function buyUpgrade(save, id) {
  const lv = save.upgrades[id] || 0, cost = upgradeCost(id, lv);
  if (save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[id] = lv + 1;
  return true;
}
export const powerMult = (save, char = CHARACTERS[0]) => 1.15 ** (save.upgrades.power || 0) * (char.power || 1);
export const autoDelay = (save, char = CHARACTERS[0]) => AUTO_DELAY * 0.92 ** (save.upgrades.auto || 0) * (char.autoDelay || 1);
export const autoAcc = (save) => Math.min(0.9, AUTO_ACC + 0.03 * (save.upgrades.aim || 0));

// 자동 점프 판정: 정확도만큼 정중앙에서 벗어난 자리에서 뛴다. 찍기는 하지 않고 그냥 떨어진다.
export function autoJump(save) {
  return judgeJump(1 - autoAcc(save));
}
export function stageCoins(index) {
  const boss = index % 10 === 9;
  return Math.round(COIN_BASE * COIN_GROWTH ** index * (boss ? 2 : 1));
}
export function hitCoins(index, dmg, maxHp) {
  return stageCoins(index) * HIT_COIN_SHARE * Math.min(dmg, maxHp) / maxHp;
}
// 자동만으로 1초에 주는 피해
export function autoDps(save, char = CHARACTERS[0]) {
  const j = autoJump(save);
  const dmg = damage(j, 'none', 0, powerMult(save, char));
  return dmg / (autoDelay(save, char) + 0.07 + airTime(jumpFraction(j)) + BOUNCE_TIME);
}
// 자리를 비운 동안: 자동 피해로 지금 대상부터 차례로 부수고 코인을 번다(최대 8시간)
export function offlineProgress(save, seconds, char = CHARACTERS[0]) {
  let left = Math.min(OFFLINE_CAP, Math.max(0, seconds));
  const out = { seconds: left, stages: 0, coins: 0 };
  while (left > 0 && save.unlocked < STAGE_COUNT) {
    const info = stageInfo(save.unlocked, char);
    if (!info) break;
    const hp = save.hpLeft ?? info.maxHp;
    const dps = autoDps(save, char);
    const need = hp / dps;
    if (need > left) {
      const dmg = dps * left;
      save.hpLeft = hp - dmg;
      out.coins += hitCoins(info.index, dmg, info.maxHp);
      left = 0;
    } else {
      out.coins += hitCoins(info.index, hp, info.maxHp) + stageCoins(info.index);
      save.cleared[info.index] = true;
      out.stages++;
      left -= need;
      save.hpLeft = null;
      if (save.unlocked >= STAGE_COUNT - 1) { save.done = true; break; }
      save.unlocked++;
    }
  }
  out.coins = Math.floor(out.coins);
  save.coins += out.coins;
  return out;
}

export const CHARACTERS = [
  { id: 'punch', name: '주먹이', desc: '기본 캐릭터', price: 0 },
  { id: 'turtle', name: '거북 도사', desc: '바늘이 30% 느리게 움직여요', price: 300, needle: 0.7 },
  { id: 'clock', name: '태엽 소녀', desc: '자동 점프가 40% 빨라요(대기 시간 -40%)', price: 1500, autoDelay: 0.6 },
  { id: 'hawk', name: '매눈이', desc: '가운데 판정 영역(PERFECT·GREAT·GOOD)이 1.6배 넓어요', price: 4000, zone: 1.6 },
  { id: 'bunny', name: '깡총이', desc: '2단 점프! 공중에서 한 번 더 누르면 더 높이 뛰고, 최고점에 맞출수록 피해가 커져요(최대 ×1.6)', price: 20000, double: true },
  { id: 'gold', name: '황금 주먹', desc: '피해 ×2, 바늘 15% 느림, 판정 영역 1.25배', price: 300000, power: 2, needle: 0.85, zone: 1.25 },
];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// w: 폭(m), h: 높이(m). 구 모양(행성·별 등)은 h가 지름.
export const REGIONS = [
  {
    id: 'village', name: '마을', hpUnit: 1,
    targets: [
      { name: '나무 오두막', kind: 'hut', w: 6, h: 4, color: '#a0663a', roof: '#c0392b' },
      { name: '헛간', kind: 'hut', w: 9, h: 6, color: '#b84a2a', roof: '#6a3a2a' },
      { name: '풍차', kind: 'mill', w: 6, h: 12, color: '#e8d8b0', roof: '#7a4a2a' },
      { name: '대장간', kind: 'house', w: 10, h: 7, color: '#8a8a8a', roof: '#4a3a3a' },
      { name: '여관', kind: 'house', w: 14, h: 10, color: '#d8b880', roof: '#3a6a3a' },
      { name: '마을 교회', kind: 'church', w: 12, h: 18, color: '#f0e8d8', roof: '#3a5a9a' },
      { name: '시계탑', kind: 'tower', w: 7, h: 24, color: '#b87050', roof: '#4a4a6a' },
      { name: '망루', kind: 'fort', w: 16, h: 14, color: '#9a9080', roof: '#5a5040' },
      { name: '영주의 저택', kind: 'manor', w: 26, h: 16, color: '#d8c8a0', roof: '#8a2a2a' },
      { name: '영주의 성', kind: 'castle', w: 36, h: 34, color: '#e0d8c8', roof: '#3a4aa0', boss: true },
    ],
  },
  {
    id: 'city', name: '도시', hpUnit: 100,
    targets: [
      { name: '상가 건물', kind: 'shop', w: 24, h: 18, color: '#e8e8e8', roof: '#2a9a5a' },
      { name: '학교', kind: 'mall', w: 50, h: 22, color: '#e0c8a0', roof: '#a04030' },
      { name: '병원', kind: 'tower', w: 30, h: 40, color: '#f0f0f0', roof: '#d04040' },
      { name: '호텔', kind: 'tower', w: 30, h: 55, color: '#c8b8e0', roof: '#5a4a8a' },
      { name: '아파트', kind: 'tower', w: 26, h: 75, color: '#d8c8a8', roof: '#8a7a6a' },
      { name: '백화점', kind: 'mall', w: 70, h: 60, color: '#c8a8d8', roof: '#6a4a8a' },
      { name: '경기장', kind: 'fort', w: 120, h: 60, color: '#b8b8c0', roof: '#4a6aa0' },
      { name: '방송국 타워', kind: 'antenna', w: 30, h: 240, color: '#b8c8d8', roof: '#e04040' },
      { name: '마천루', kind: 'sky', w: 50, h: 320, color: '#6a9ac8', roof: '#2a4a6a' },
      { name: '초고층 빌딩', kind: 'sky', w: 70, h: 650, color: '#5a8ab8', roof: '#c0c8d0', boss: true },
    ],
  },
  {
    id: 'nation', name: '나라', hpUnit: 10000,
    targets: [
      { name: '거대 댐', kind: 'fort', w: 700, h: 330, color: '#c8c8c0', roof: '#7a8a9a' },
      { name: '천공의 왕궁', kind: 'castle', w: 600, h: 420, color: '#e0d8c8', roof: '#3a4aa0' },
      { name: '수도', kind: 'capital', w: 1600, h: 700, color: '#c8b890', roof: '#d0a020' },
      { name: '언덕', kind: 'mountain', w: 3000, h: 900, color: '#5a8a4a', roof: '#6a9a5a' },
      { name: '고원 도시', kind: 'capital', w: 6000, h: 1500, color: '#a8b8c8', roof: '#4a8ad0' },
      { name: '화산', kind: 'volcano', w: 6000, h: 2500, color: '#5a4038', roof: '#ff6a20' },
      { name: '설산', kind: 'mountain', w: 9000, h: 4500, color: '#7a8a9a', roof: '#ffffff' },
      { name: '산맥', kind: 'mountain', w: 16000, h: 6500, color: '#6a7a6a', roof: '#ffffff' },
      { name: '안나푸르나', kind: 'mountain', w: 15000, h: 8091, color: '#8a8a98', roof: '#ffffff' },
      { name: '에베레스트', kind: 'mountain', w: 20000, h: 8848, color: '#7a8090', roof: '#ffffff', boss: true },
    ],
  },
  {
    id: 'planet', name: '행성', hpUnit: 1000000,
    targets: [
      { name: '포보스', kind: 'planet', w: 22e3, h: 22e3, color: '#8a7a6a', roof: '#5a4a3a' },
      { name: '세레스', kind: 'planet', w: 940e3, h: 940e3, color: '#9a9a98', roof: '#6a6a68' },
      { name: '명왕성', kind: 'planet', w: 2377e3, h: 2377e3, color: '#e8d8c0', roof: '#a08060' },
      { name: '달', kind: 'planet', w: 3474e3, h: 3474e3, color: '#c8c8c0', roof: '#8a8a88' },
      { name: '수성', kind: 'planet', w: 4879e3, h: 4879e3, color: '#a89888', roof: '#6a5a50' },
      { name: '화성', kind: 'planet', w: 6779e3, h: 6779e3, color: '#d0603a', roof: '#8a3020' },
      { name: '금성', kind: 'gas', w: 12104e3, h: 12104e3, color: '#e8c070', roof: '#b08040' },
      { name: '해왕성', kind: 'gas', w: 49244e3, h: 49244e3, color: '#4a7ae0', roof: '#2a4aa0' },
      { name: '토성', kind: 'ringed', w: 116460e3, h: 116460e3, color: '#e0c890', roof: '#a08050' },
      { name: '목성', kind: 'gas', w: 139820e3, h: 139820e3, color: '#d8a878', roof: '#a05a30', boss: true },
    ],
  },
  {
    id: 'space', name: '우주', hpUnit: 100000000,
    targets: [
      { name: '갈색 왜성', kind: 'star', w: 1.5e8, h: 1.5e8, color: '#c86a4a', roof: '#6a2a1a' },
      { name: '적색 왜성', kind: 'star', w: 4e8, h: 4e8, color: '#ff8a5a', roof: '#c02a10' },
      { name: '태양', kind: 'star', w: 1.39e9, h: 1.39e9, color: '#fff2a0', roof: '#ff9a20' },
      { name: '시리우스', kind: 'star', w: 2.4e9, h: 2.4e9, color: '#ffffff', roof: '#8ac0ff' },
      { name: '청색 거성', kind: 'star', w: 1e10, h: 1e10, color: '#d0e8ff', roof: '#3a7aff' },
      { name: '적색 거성', kind: 'star', w: 6e10, h: 6e10, color: '#ffb070', roof: '#d03a10' },
      { name: '베텔게우스', kind: 'star', w: 1.2e12, h: 1.2e12, color: '#ff9a5a', roof: '#a02a10' },
      { name: '블랙홀', kind: 'blackhole', w: 4e12, h: 4e12, color: '#ff9a3a', roof: '#000000' },
      { name: '성운', kind: 'nebula', w: 1e17, h: 1e17, color: '#d070ff', roof: '#40c0ff' },
      { name: '은하', kind: 'galaxy', w: 1e21, h: 1e21, color: '#fff0c0', roof: '#7a9aff', boss: true },
    ],
  },
];

const SPHERES = new Set(['planet', 'ringed', 'gas', 'star', 'blackhole', 'nebula', 'galaxy']);
export const isSphere = (t) => SPHERES.has(t.kind);
export const STAGE_COUNT = REGIONS.reduce((n, r) => n + r.targets.length, 0);

export function stageInfo(index, char = CHARACTERS[0]) {
  let i = index;
  for (let r = 0; r < REGIONS.length; r++) {
    const region = REGIONS[r];
    if (i < region.targets.length) {
      const target = region.targets[i];
      const sphere = isSphere(target);
      return {
        index, regionIndex: r, region, local: i, target, sphere,
        boss: !!target.boss,
        maxHp: Math.round(HP_BASE * HP_GROWTH ** index * (target.boss ? BOSS_HP : 1)),
        coins: stageCoins(index),
        needleSpeed: (0.35 + 0.004 * index) * (char.needle || 1),  // 초당 왕복 횟수 (정중앙 통과 속도 = 4 × 이 값)
        zone: char.zone || 1,
        // 대상 꼭대기 위로 더 뛸 수 있는 높이(PERFECT 기준)
        extra: sphere ? target.h * 2 : target.h * 1.6 + 6,
        // 주인공이 서 있는 곳: 건물은 왼쪽 옆 땅, 구는 표면 꼭대기
        x0: sphere ? 0 : -(target.w / 2 + Math.max(3, target.w * 0.35)),
        label: `${region.name} ${i + 1}`,
      };
    }
    i -= region.targets.length;
  }
  return null;
}

// 바늘: 삼각파로 좌우 왕복. phase는 0~1 사이 시작 위치
export function needlePos(t, speed, phase = 0) {
  const x = ((t * speed + phase) % 1 + 1) % 1;
  return x < 0.5 ? -1 + 4 * x : 3 - 4 * x;
}

// 바늘이 정중앙에서 ±PERFECT_MS 안에 있을 때의 위치 폭(정중앙 통과 속도 = 4 × speed)
export function perfectZone(speed, zone = 1) {
  return PERFECT_MS * 4 * speed * zone;
}

export function judgeJump(p, zone = 1, speed = null) {
  const off = Math.abs(p);
  const acc = Math.max(0, 1 - off);
  const pz = speed ? perfectZone(speed, zone) : PERFECT_ZONE * zone;
  let grade = 'miss';
  if (off <= pz) grade = 'perfect';
  else if (off <= GREAT_ZONE * zone) grade = 'great';
  else if (off <= GOOD_ZONE * zone) grade = 'good';
  return { grade, acc };
}

// 정중앙에 가까울수록 높이 뛴다. Perfect는 최고 높이.
export function jumpFraction(j) {
  return j.grade === 'perfect' ? 1 : 0.15 + 0.62 * j.acc * j.acc;
}
export function accMult(j) {
  return j.grade === 'perfect' ? ACC_PERFECT_MULT : 0.2 + 1.8 * j.acc * j.acc;
}

// 점프 체공 시간(초)
export function airTime(frac) {
  return 0.9 + 0.9 * frac;
}

// 포물선 하나: y0에서 출발해 T/2에 apex, T에 end로 내려온다.
// HANG이 2보다 커서 최고점 근처에 오래 머무르고 도약·낙하는 빠르다.
const HANG = 2.2;
export function arcY(t, T, y0, apex, end) {
  const u = Math.min(1, Math.max(0, t / T));
  if (u < 0.5) return y0 + (apex - y0) * (1 - (1 - 2 * u) ** HANG);
  return end + (apex - end) * (1 - (2 * u - 1) ** HANG);
}

export function judgeApex(t, T) {
  const dt = t - T / 2;
  const a = Math.abs(dt);
  if (a <= APEX_PERFECT) return 'perfect';
  if (a <= APEX_GREAT) return 'great';
  if (a <= APEX_OK) return 'ok';
  return dt < 0 ? 'early' : 'late';
}

// 내려찍기: 대상 꼭대기 위 drop(m)에서 가속하며 떨어지는 시간(초)
export function diveTime(drop, extra) {
  return 0.16 + 0.24 * Math.sqrt(Math.max(0, drop) / extra);
}

export function comboMult(combo) {
  return 1 + COMBO_STEP * Math.min(combo, COMBO_MAX);
}

export function damage(jump, apex, combo, mult = 1) {
  return Math.round(BASE_DAMAGE * accMult(jump) * APEX_MULT[apex] * comboMult(combo) * mult);
}

// 두 판정 중 하나라도 Perfect면 콤보 유지, 둘 다 아니면 끊김
export function nextCombo(combo, jump, apex) {
  return jump.grade === 'perfect' || apex === 'perfect' ? combo + 1 : 0;
}

const LIGHT_YEAR_KM = 9.4607e12;
export function formatMeters(m) {
  if (m < 1000) return `${m < 100 ? m.toFixed(1) : Math.round(m)}m`;
  const km = m / 1000;
  if (km < 1000) return `${km < 100 ? km.toFixed(1) : Math.round(km)}km`;
  if (km >= LIGHT_YEAR_KM * 0.1) {
    const ly = km / LIGHT_YEAR_KM;
    return `${ly < 100 ? ly.toFixed(1) : formatNumber(ly)}광년`;
  }
  return `${formatNumber(km)}km`;
}

export function formatNumber(n) {
  n = Math.round(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const units = [[1e20, '해'], [1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      return (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.floor(x).toLocaleString('en-US')) + s;
    }
  }
  return String(n);
}

export const SAVE_KEY = 'centerSmash.save';
export function defaultSave() {
  return { unlocked: 0, hpLeft: null, done: false, total: 0, cleared: {}, coins: 0, owned: ['punch'], char: 'punch', upgrades: { power: 0, auto: 0, aim: 0 }, lastSeen: 0, sound: true, vibrate: true };
}
export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = { ...defaultSave(), ...JSON.parse(raw) };
    s.unlocked = Math.max(0, Math.min(STAGE_COUNT - 1, s.unlocked | 0));
    s.coins = Math.max(0, Math.floor(+s.coins || 0));
    s.upgrades = { power: 0, auto: 0, aim: 0, ...(s.upgrades || {}) };
    if (typeof s.hpLeft !== 'number' || !(s.hpLeft > 0)) s.hpLeft = null;
    if (!Array.isArray(s.owned)) s.owned = ['punch'];
    if (!s.owned.includes('punch')) s.owned.unshift('punch');
    if (!s.owned.includes(s.char)) s.char = 'punch';
    return s;
  } catch {
    return defaultSave();
  }
}
export function storeSave(storage, save) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 */ }
}
// 부순 기록 + 코인. 받은 코인 수를 돌려준다.
export function recordClear(save, index) {
  const coins = stageCoins(index);
  save.cleared[index] = true;
  save.coins += coins;
  save.hpLeft = null;
  if (index >= STAGE_COUNT - 1) save.done = true;
  else save.unlocked = Math.max(save.unlocked, index + 1);
  return coins;
}
export function buyChar(save, id) {
  const c = charById(id);
  if (save.owned.includes(c.id) || save.coins < c.price) return false;
  save.coins -= c.price;
  save.owned.push(c.id);
  save.char = c.id;
  return true;
}
export function selectChar(save, id) {
  if (!save.owned.includes(id)) return false;
  save.char = id;
  return true;
}
