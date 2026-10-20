// 진행 상황: 스테이지 구성, 군단 편성, 길들이기, 경험치, 저장 데이터. 순수 로직(DOM, localStorage 접근 없음).
// 길들인 몬스터는 "소환할 수 있는 종류"가 되고, 같은 종류를 여러 마리 소환할 수 있다.
// 소환수 별 합은 네크로맨서 레벨에 따른 한도를 넘을 수 없다.
import { MONSTERS, REGIONS, STAGES_PER_REGION, MAX_LEVEL, regionPower, unitStats, tameChance, starsOf } from './data.js';

export const STAGE_COUNT = REGIONS.length * STAGES_PER_REGION;
export const ENEMY_GROWTH = 1.16; // 스테이지마다 적 수가 16%씩 늘어 마지막엔 약 2,900마리
export const CAP_BASE = 5;
// 별 한도는 적 수와 같은 비율로 늘고, 그 위에 약간의 덤을 얹는다: 27스테이지까지 0.22%씩 늘고, 38스테이지부터 0.15%씩 줄어든다.
// 군단이 클수록 몇 % 차이로 승패가 갈려서(수가 많은 쪽이 압도) 덤을 끝까지 늘리면 뒤 지역이 너무 쉬워진다. 값은 시뮬레이션으로 맞췄다
export const CAP_BONUS = 0.0022, CAP_BONUS_UNTIL = 27, CAP_TAPER = 0.0015, CAP_TAPER_FROM = 38;
export const BOSS_FACTOR = 0.45; // 적 보스 힘 = 소환수 보스 기본치 × 이 값 × √(부하 수 / 8)
const NECRO = { hp: 90, atk: 5, interval: 1.2 };
// 앞줄부터 서는 순서: 튼튼한 몬스터가 앞, 급습하는 비행형은 뒤
const FRONT_ORDER = { boss: 0, golem: 1, blob: 2, humanoid: 3, beast: 4, flyer: 5 };

// 전체 스테이지 번호(1~50) ↔ 지역·지역 안 스테이지
export function stageOf(g) {
  return { region: Math.floor((g - 1) / STAGES_PER_REGION), stage: ((g - 1) % STAGES_PER_REGION) + 1 };
}
export function globalStage(region, stage) {
  return region * STAGES_PER_REGION + stage;
}
export function isBossStage(stage) {
  return stage === STAGES_PER_REGION;
}

export function defaultSave() {
  return {
    cleared: 0, // 처음 깬 가장 높은 전체 스테이지 번호
    roster: [{ id: 1, type: 'skeleton', level: 1, xp: 0 }], // 소환할 수 있는 종류
    army: { 1: 2 }, // 종류(id)별 소환할 마리 수
    autoArmy: true, // 켜져 있으면 전투 전에 별 한도를 가장 알차게 채운다
    nextId: 2,
    settings: { speed: 1, autoSkill: false },
    ended: false,
  };
}

export function loadSave(raw) {
  const base = defaultSave();
  try {
    if (!raw) return base;
    const s = JSON.parse(raw);
    const save = { ...base, ...s, settings: { ...base.settings, ...s.settings } };
    // 예전 버전(편성 3자리)은 자동 편성으로 바꾼다
    if (!s.army) { save.army = {}; save.autoArmy = true; delete save.party; autoArmy(save); }
    return save;
  } catch {
    return base;
  }
}

export function isUnlocked(save, g) {
  return g <= save.cleared + 1;
}

export function necroLevel(save) {
  return save.cleared + 1;
}

// 소환수 별 한도. 적이 늘어나는 속도에 맞춰 함께 늘어난다
export function starCap(save) {
  const c = save.cleared;
  const bonus = CAP_BONUS * Math.min(c, CAP_BONUS_UNTIL) - CAP_TAPER * Math.max(0, c - CAP_TAPER_FROM);
  return Math.round(CAP_BASE * ENEMY_GROWTH ** c * (1 + bonus));
}

export function armyStars(save) {
  let sum = 0;
  for (const [id, n] of Object.entries(save.army)) {
    const r = save.roster.find(o => o.id === Number(id));
    if (r) sum += starsOf(r.type) * n;
  }
  return sum;
}

export function armySize(save) {
  return Object.values(save.army).reduce((a, n) => a + n, 0);
}

// 종류 하나의 마리 수를 바꾼다. 별 한도를 넘으면 들어갈 만큼만 넣는다. 보스는 한 마리만
export function setCount(save, id, n) {
  const r = save.roster.find(o => o.id === id);
  if (!r) return 0;
  const stars = starsOf(r.type), current = save.army[id] ?? 0;
  const room = starCap(save) - (armyStars(save) - current * stars);
  let want = Math.max(0, Math.min(n, Math.floor(room / stars)));
  if (MONSTERS[r.type].tier === 'boss') want = Math.min(want, 1);
  if (want) save.army[id] = want;
  else delete save.army[id];
  return want;
}

// 별 하나당 힘(√(체력×초당 피해) / 별)
export function powerPerStar(r) {
  const st = unitStats(r.type, r.level);
  return Math.sqrt(st.hp * (st.atk / st.interval)) / starsOf(r.type);
}

// 별 한도를 알차게 채운다: 보스는 한 마리씩 먼저, 그다음 별당 힘이 센 종류부터 남은 별의 절반씩
export function autoArmy(save) {
  save.army = {};
  const cap = starCap(save);
  let left = cap;
  const bosses = save.roster.filter(r => MONSTERS[r.type].tier === 'boss').sort((a, b) => powerPerStar(b) - powerPerStar(a));
  for (const r of bosses) if (starsOf(r.type) <= left) { save.army[r.id] = 1; left -= starsOf(r.type); }
  const rest = save.roster.filter(r => MONSTERS[r.type].tier !== 'boss').sort((a, b) => powerPerStar(b) - powerPerStar(a));
  rest.forEach((r, i) => {
    const stars = starsOf(r.type);
    const budget = i === rest.length - 1 ? left : Math.max(stars, Math.ceil(left / 2));
    const n = Math.floor(Math.min(budget, left) / stars);
    if (n > 0) { save.army[r.id] = n; left -= n * stars; }
  });
  // 남은 별 자투리는 가장 싼 종류로 채운다
  const cheapest = [...rest].sort((a, b) => starsOf(a.type) - starsOf(b.type))[0];
  if (cheapest && left >= starsOf(cheapest.type)) {
    const n = Math.floor(left / starsOf(cheapest.type));
    save.army[cheapest.id] = (save.army[cheapest.id] ?? 0) + n;
  }
  return save.army;
}

// 네크로맨서는 처음 깬 스테이지 수만큼 강해진다 (10스테이지마다 다음 지역 수준)
export function necroPower(save) {
  return regionPower(save.cleared / STAGES_PER_REGION);
}

export function necroUnit(save) {
  const p = necroPower(save);
  return { typeId: 'necro', name: '네크로맨서', necro: true, level: necroLevel(save), hp: Math.round(NECRO.hp * p), atk: Math.round(NECRO.atk * p * 10) / 10, interval: NECRO.interval, trait: 'bolt' };
}

function frontOrder(type) {
  return FRONT_ORDER[MONSTERS[type].shape];
}

// 전투에 나갈 유닛 목록: 소환수(앞줄 순서대로) + 맨 뒤 네크로맨서
export function partyUnits(save) {
  const units = [];
  const entries = Object.entries(save.army)
    .map(([id, n]) => [save.roster.find(o => o.id === Number(id)), n])
    .filter(([r, n]) => r && n > 0)
    .sort(([a], [b]) => frontOrder(a.type) - frontOrder(b.type));
  for (const [r, n] of entries) {
    const st = unitStats(r.type, r.level);
    for (let i = 0; i < n; i++) units.push({ typeId: r.type, name: MONSTERS[r.type].name, level: r.level, rosterId: r.id, ...st });
  }
  units.push(necroUnit(save));
  return units;
}

export function enemyCount(g) {
  return Math.round(2 * ENEMY_GROWTH ** (g - 1));
}

export function maxTier(stage) {
  return Math.min(5, 1 + Math.floor((stage - 1) / 2));
}

// 스테이지가 오를수록 적이 늘고 강한 종류가 섞인다. 10스테이지는 보스가 부하들 맨 뒤에 선다
export function stageEnemies(region, stage, rand) {
  const R = REGIONS[region], g = globalStage(region, stage);
  const count = enemyCount(g);
  // 약한 몬스터가 떼로, 강한 몬스터는 드물게 (등급 t가 나올 비중 1/t)
  const weights = Array.from({ length: maxTier(stage) }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((x, y) => x + y, 0);
  const list = [];
  for (let i = 0; i < count; i++) {
    let r = rand() * total, t = 0;
    while (r >= weights[t] && t < weights.length - 1) r -= weights[t++];
    list.push({ type: R.monsters[t], level: stage });
  }
  list.sort((a, b) => frontOrder(a.type) - frontOrder(b.type));
  // 부하가 많을수록 보스도 커진다. 고정이면 작은 전투에선 혼자 압도하고 큰 전투에선 아무것도 아니게 된다
  if (isBossStage(stage)) list.push({ type: R.boss, level: stage, scale: BOSS_FACTOR * Math.sqrt(Math.max(1, count / 8)) });
  return list;
}

export function enemyUnits(list) {
  const cache = {};
  return list.map(e => {
    const key = `${e.type}:${e.level}:${e.scale ?? 1}`;
    if (!cache[key]) {
      const st = unitStats(e.type, e.level), k = e.scale ?? 1;
      cache[key] = { typeId: e.type, name: MONSTERS[e.type].name, level: e.level, ...st, hp: Math.round(st.hp * k), atk: st.atk * k };
    }
    return { ...cache[key] };
  });
}

// 적 목록을 종류별로 묶는다: [{ type, level, count }]
export function groupEnemies(list) {
  const map = new Map();
  for (const e of list) {
    const k = `${e.type}:${e.level}`;
    if (!map.has(k)) map.set(k, { type: e.type, level: e.level, count: 0 });
    map.get(k).count++;
  }
  return [...map.values()];
}

// 길들이기 후보: 이번 전투에서 만난 적 종류 중 최대 3가지. 보스가 있었으면 반드시 넣는다
export function tameOptions(enemyList, rand) {
  const types = [...new Set(enemyList.map(e => e.type))];
  const boss = types.find(t => MONSTERS[t].tier === 'boss');
  const pool = types.filter(t => t !== boss);
  const picks = boss ? [boss] : [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picks;
}

// 길들이기를 시도한다. 성공하면 새 종류로, 이미 있으면 그 종류의 레벨을 올린다
export function tame(save, type, stage, rand) {
  const chance = tameChance(type);
  if (rand() >= chance) return { success: false, chance };
  const owned = save.roster.find(r => r.type === type);
  let result;
  if (owned) {
    const before = owned.level;
    owned.level = Math.min(MAX_LEVEL, Math.max(owned.level + 1, stage));
    owned.xp = 0;
    result = { success: true, chance, unit: owned, levelUp: owned.level - before };
  } else {
    // 싸웠던 그 레벨 그대로 데려온다
    const unit = { id: save.nextId++, type, level: stage, xp: 0 };
    save.roster.push(unit);
    result = { success: true, chance, unit, isNew: true };
  }
  if (save.autoArmy) autoArmy(save);
  return result;
}

export function xpNeed(level) {
  return 5 + level * 3;
}

// 이긴 전투에 나간 종류에게 경험치를 준다. 레벨이 오른 종류 목록을 돌려준다
export function grantXp(save, stage) {
  const ups = [];
  for (const id of Object.keys(save.army)) {
    const r = save.roster.find(o => o.id === Number(id));
    if (!r || r.level >= MAX_LEVEL) continue;
    r.xp += stage + 2;
    const before = r.level;
    while (r.level < MAX_LEVEL && r.xp >= xpNeed(r.level)) { r.xp -= xpNeed(r.level); r.level++; }
    if (r.level > before) ups.push({ unit: r, from: before });
  }
  return ups;
}

export function recordWin(save, g) {
  const first = g > save.cleared;
  if (first) save.cleared = g;
  if (g === STAGE_COUNT) save.ended = true;
  // 레벨이 올라 별 한도가 늘었으니 다시 채운다
  if (save.autoArmy) autoArmy(save);
  return { first };
}

// 지역 파괴율: 그 지역에서 처음 깬 스테이지 비율
export function regionProgress(save, region) {
  const done = Math.max(0, Math.min(STAGES_PER_REGION, save.cleared - region * STAGES_PER_REGION));
  return done / STAGES_PER_REGION;
}
