// 진행 상황: 스테이지 구성, 군단, 길들이기, 영혼(보상)·레벨 업·진화, 룰렛, 저장 데이터. 순수 로직(DOM, localStorage 접근 없음).
// 군단은 길들인 숫자만큼만 소환한다. 길들이기에 성공하면 그 전투에서 쓰러뜨린 같은 종류의 일부를 한꺼번에 데려온다.
import {
  MONSTERS, REGIONS, STAGES_PER_REGION, MAX_LEVEL, EVO_LEVEL, MAX_EVO, regionPower, unitStats, tameChance, starsOf, displayName,
} from './data.js';

export const STAGE_COUNT = REGIONS.length * STAGES_PER_REGION;
export const ENEMY_GROWTH = 1.16; // 스테이지마다 적 수가 16%씩 늘어 마지막엔 약 2,900마리
export const TAME_SHARE = 0.35, TAME_MIN = 3; // 길들이기에 성공하면 쓰러뜨린 같은 종류의 이 비율만큼(최소 3마리) 데려온다. 스테이지마다 한 번뿐이라 넉넉하게
export const BOSS_FACTOR = 0.35; // 적 보스 힘 = 소환수 보스 기본치 × 이 값 × √(부하 수 / 8)
// 뒤 지역 적은 레벨을 조금 더 높게. 군단이 커지고 진화가 쌓이면 뒤로 갈수록 너무 쉬워져서
export const ENEMY_LEVEL_BONUS = [0, 0, 0, 0, 3];
// 영혼: 스테이지를 깰 때마다 받는 보상. 처음 깨면 두 배
export const SOUL_BASE = 12, SOUL_GROWTH = 1.08;
// 레벨 업 비용 = LV_COST × 별 × LV_GROWTH^(레벨-1) × (진화 단계+1) × 마리 수^COUNT_EXP
// 마리 수를 곱하는 건, 수천 마리를 한 번에 키우는 값이 한 마리 값과 같으면 큰 군단이 너무 쉽게 강해져서다
export const LV_COST = 3, LV_GROWTH = 1.3, COUNT_EXP = 0.4;
export const EVO_COST = 100; // 진화 비용 = EVO_COST × 별 × (진화 단계+1) × 마리 수^COUNT_EXP
const NECRO = { hp: 120, atk: 6, interval: 1.0 };
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
    roster: [{ id: 1, type: 'slime', level: 1, evo: 0, count: 1 }], // 길들인 종류와 마리 수
    nextId: 2,
    souls: 0,
    roulettes: {}, // 룰렛을 이미 돌린 보스 스테이지 (보스마다 한 번)
    tamed: {}, // 길들이기에 성공한 스테이지 → 길들인 종류 (스테이지마다 한 번)
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
    // 예전 버전(별 한도 편성)은 편성했던 마리 수를 길들인 수로 옮긴다
    if (s.roster?.some(r => r.count === undefined)) {
      save.roster = s.roster.map(r => ({ id: r.id, type: r.type, level: r.level, evo: r.evo ?? 0, count: Math.max(1, s.army?.[r.id] ?? s.party?.includes(r.id) ?? 1) }));
    }
    for (const k of ['army', 'autoArmy', 'party']) delete save[k];
    save.souls ??= 0;
    save.roulettes ??= {};
    save.tamed ??= {};
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

export function armySize(save) {
  return save.roster.reduce((a, r) => a + r.count, 0);
}

// 네크로맨서는 처음 깬 스테이지 수만큼 강해진다 (10스테이지마다 다음 지역 수준)
export function necroPower(save) {
  return regionPower(save.cleared / STAGES_PER_REGION);
}

export function necroUnit(save) {
  const p = necroPower(save);
  return { typeId: 'necro', name: '네크로맨서', necro: true, level: necroLevel(save), hp: Math.round(NECRO.hp * p), atk: Math.round(NECRO.atk * p * 10) / 10, interval: NECRO.interval, trait: 'bolt', speed: 0 };
}

function frontOrder(type) {
  return FRONT_ORDER[MONSTERS[type].shape];
}

// 전투에 나갈 유닛 목록: 길들인 모든 소환수(앞줄 순서대로) + 네크로맨서
export function partyUnits(save) {
  const units = [];
  const list = [...save.roster].sort((a, b) => frontOrder(a.type) - frontOrder(b.type));
  for (const r of list) {
    const st = unitStats(r.type, r.level, r.evo);
    const name = displayName(r.type, r.evo);
    for (let i = 0; i < r.count; i++) units.push({ typeId: r.type, evo: r.evo, name, level: r.level, rosterId: r.id, ...st });
  }
  units.push(necroUnit(save));
  return units;
}

// 시드가 같으면 같은 수열을 내는 난수. 스테이지 구성을 미리 정해 두는 데 쓴다
export function seeded(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 스테이지의 적 구성은 미리 정해져 있어서 다시 해도 똑같이 나온다
export function stageLineup(g) {
  const { region, stage } = stageOf(g);
  return stageEnemies(region, stage, seeded(g * 7919 + 13));
}

// 길들이기 후보도 스테이지마다 정해져 있다
export function stageTameOptions(g, enemyList, save) {
  return tameOptions(enemyList, seeded(g * 104729 + 7), save);
}

export function tameAvailable(save, g) {
  return !save.tamed[g];
}

export function enemyCount(g) {
  return Math.round(2 * ENEMY_GROWTH ** (g - 1));
}

export function maxTier(stage) {
  return Math.min(5, 1 + Math.floor((stage - 1) / 2));
}

// 스테이지가 오를수록 적이 늘고 강한 종류가 섞인다. 10스테이지는 보스가 맨 마지막에 나온다
export function stageEnemies(region, stage, rand) {
  const R = REGIONS[region], g = globalStage(region, stage);
  const count = enemyCount(g), level = stage + ENEMY_LEVEL_BONUS[region];
  // 약한 몬스터가 떼로, 강한 몬스터는 드물게 (등급 t가 나올 비중 1/t)
  const weights = Array.from({ length: maxTier(stage) }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((x, y) => x + y, 0);
  const list = [];
  for (let i = 0; i < count; i++) {
    let r = rand() * total, t = 0;
    while (r >= weights[t] && t < weights.length - 1) r -= weights[t++];
    list.push({ type: R.monsters[t], level });
  }
  // 부하가 많을수록 보스도 커진다. 고정이면 작은 전투에선 혼자 압도하고 큰 전투에선 아무것도 아니게 된다
  if (isBossStage(stage)) list.push({ type: R.boss, level, scale: BOSS_FACTOR * Math.sqrt(Math.max(1, count / 8)) });
  return list;
}

export function enemyUnits(list) {
  const cache = {};
  return list.map(e => {
    const key = `${e.type}:${e.level}:${e.scale ?? 1}`;
    if (!cache[key]) {
      const st = unitStats(e.type, e.level), k = e.scale ?? 1;
      cache[key] = { typeId: e.type, evo: 0, name: MONSTERS[e.type].name, level: e.level, ...st, hp: Math.round(st.hp * k), atk: st.atk * k };
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

// 길들이기 후보: 이번 전투에서 만난 적 종류 중 최대 3가지. 보스가 있었으면 반드시 넣되, 이미 길들인 보스는 빼고
export function tameOptions(enemyList, rand, save = null) {
  const types = [...new Set(enemyList.map(e => e.type))];
  const owned = t => save?.roster.some(r => r.type === t);
  const boss = types.find(t => MONSTERS[t].tier === 'boss' && !owned(t));
  const pool = types.filter(t => MONSTERS[t].tier !== 'boss');
  const picks = boss ? [boss] : [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picks;
}

// 길들이면 데려오는 마리 수. 보스는 한 마리
export function tameAmount(type, kills) {
  if (MONSTERS[type].tier === 'boss') return 1;
  return Math.max(TAME_MIN, Math.round((kills[type] ?? 0) * TAME_SHARE));
}

// 길들이기를 시도한다. 성공하면 그만큼 군단에 더한다.
// 스테이지마다 성공은 한 번뿐이고(g를 넘기면 기록), 보스는 종류마다 한 번만 길들일 수 있다
export function tame(save, type, stage, kills, rand, g = null) {
  const chance = tameChance(type);
  const owned = save.roster.find(r => r.type === type);
  if (g !== null && !tameAvailable(save, g)) return { success: false, chance, stageDone: true };
  if (owned && MONSTERS[type].tier === 'boss') return { success: false, chance, already: true };
  if (rand() >= chance) return { success: false, chance };
  if (g !== null) save.tamed[g] = type;
  const amount = tameAmount(type, kills);
  if (owned) {
    owned.count += amount;
    return { success: true, chance, unit: owned, amount };
  }
  // 싸웠던 그 레벨로 데려온다. 더 키우는 건 영혼으로
  const unit = { id: save.nextId++, type, level: stage, evo: 0, count: amount };
  save.roster.push(unit);
  return { success: true, chance, unit, amount, isNew: true };
}

export function stageSouls(g, first) {
  return Math.round(SOUL_BASE * SOUL_GROWTH ** (g - 1)) * (first ? 2 : 1);
}

export function recordWin(save, g) {
  const first = g > save.cleared;
  if (first) save.cleared = g;
  if (g === STAGE_COUNT) save.ended = true;
  const souls = stageSouls(g, first);
  save.souls += souls;
  return { first, souls };
}

// 져도 쓰러뜨린 적 비율만큼 영혼을 조금 준다(최대 절반). 질수록 아무것도 못 얻으면 같은 곳에서 계속 막힌다
export function recordLoss(save, g, killedRatio) {
  const souls = Math.floor(stageSouls(g, false) * 0.5 * Math.max(0, Math.min(1, killedRatio)));
  save.souls += souls;
  return { souls };
}

export function levelUpCost(r) {
  return Math.ceil(LV_COST * starsOf(r.type) * LV_GROWTH ** (r.level - 1) * (r.evo + 1) * r.count ** COUNT_EXP);
}

export function levelUp(save, id) {
  const r = save.roster.find(o => o.id === id);
  if (!r) return { ok: false, reason: '없는 소환수' };
  if (r.level >= MAX_LEVEL) return { ok: false, reason: '최대 레벨이에요' };
  const cost = levelUpCost(r);
  if (save.souls < cost) return { ok: false, reason: '영혼이 부족해요' };
  save.souls -= cost;
  r.level++;
  return { ok: true, cost };
}

export function canEvolve(r) {
  return r.level >= EVO_LEVEL && r.evo < MAX_EVO && MONSTERS[r.type].tier !== 'boss';
}

export function evolveCost(r) {
  return Math.ceil(EVO_COST * starsOf(r.type) * (r.evo + 1) * r.count ** COUNT_EXP);
}

export function evolve(save, id, free = false) {
  const r = save.roster.find(o => o.id === id);
  if (!r || !canEvolve(r)) return { ok: false, reason: `레벨 ${EVO_LEVEL}부터 진화할 수 있어요` };
  const cost = free ? 0 : evolveCost(r);
  if (save.souls < cost) return { ok: false, reason: '영혼이 부족해요' };
  save.souls -= cost;
  r.evo++;
  r.level = 1;
  return { ok: true, cost };
}

// ---------- 보스 룰렛 ----------

// 룰렛은 보스 스테이지마다 처음 깰 때 한 번만 돌린다
export function rouletteAvailable(save, g) {
  return isBossStage(stageOf(g).stage) && !save.roulettes[g];
}

// weight: 나올 비중. 칸 크기도 비중에 맞춘다
// 보스마다 한 번뿐이라 한 번에 크게 준다
export const ROULETTE = [
  { kind: 'souls', mult: 3, label: '영혼 ×3', weight: 5 },
  { kind: 'copies', label: '군단 증원', weight: 4 },
  { kind: 'souls', mult: 8, label: '영혼 ×8', weight: 3 },
  { kind: 'levels', label: '레벨 +5', weight: 4 },
  { kind: 'evolve', label: '무료 진화', weight: 1.5 },
  { kind: 'souls', mult: 20, label: '잭팟 영혼 ×20', weight: 0.8 },
];

export function rollRoulette(rand) {
  const total = ROULETTE.reduce((a, s) => a + s.weight, 0);
  let r = rand() * total;
  for (let i = 0; i < ROULETTE.length; i++) {
    if (r < ROULETTE[i].weight) return i;
    r -= ROULETTE[i].weight;
  }
  return ROULETTE.length - 1;
}

// 뽑힌 칸의 상을 준다. 무슨 일이 일어났는지 글로 돌려준다
export function applyRoulette(save, index, g, rand) {
  save.roulettes[g] = true;
  const seg = ROULETTE[index];
  const base = stageSouls(g, false);
  const souls = n => { save.souls += n; return `영혼 +${n}`; };
  if (seg.kind === 'souls') return souls(base * seg.mult);
  const pick = list => list[Math.floor(rand() * list.length)];
  if (seg.kind === 'copies') {
    // 가장 많은 종류를 50% 늘린다
    const r = [...save.roster].filter(o => MONSTERS[o.type].tier !== 'boss').sort((a, b) => b.count - a.count)[0];
    if (!r) return souls(base * 5);
    const add = Math.max(2, Math.round(r.count * 0.5));
    r.count += add;
    return `${displayName(r.type, r.evo)} +${add}마리`;
  }
  if (seg.kind === 'levels') {
    const list = save.roster.filter(o => o.level < MAX_LEVEL);
    if (!list.length) return souls(base * 5);
    const r = pick(list);
    r.level = Math.min(MAX_LEVEL, r.level + 5);
    return `${displayName(r.type, r.evo)} Lv.${r.level}`;
  }
  // 무료 진화: 진화할 수 있는 종류가 없으면 영혼으로
  const ready = save.roster.filter(canEvolve);
  if (!ready.length) return `진화할 소환수가 없어 ${souls(base * 10)}`;
  const r = pick(ready);
  evolve(save, r.id, true);
  return `${displayName(r.type, r.evo)}(으)로 진화!`;
}

// 지역 파괴율: 그 지역에서 처음 깬 스테이지 비율
export function regionProgress(save, region) {
  const done = Math.max(0, Math.min(STAGES_PER_REGION, save.cleared - region * STAGES_PER_REGION));
  return done / STAGES_PER_REGION;
}
