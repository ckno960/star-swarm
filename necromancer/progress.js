// 진행 상황: 스테이지 구성, 길들이기, 경험치, 저장 데이터. 순수 로직(DOM, localStorage 접근 없음).
import { MONSTERS, REGIONS, STAGES_PER_REGION, MAX_LEVEL, regionPower, unitStats, tameChance } from './data.js';

export const PARTY_SIZE = 3;
export const STAGE_COUNT = REGIONS.length * STAGES_PER_REGION;
const NECRO = { hp: 90, atk: 5, interval: 1.2 };

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
    roster: [{ id: 1, type: 'skeleton', level: 1, xp: 0 }],
    party: [1],
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
    return { ...base, ...s, settings: { ...base.settings, ...s.settings } };
  } catch {
    return base;
  }
}

export function isUnlocked(save, g) {
  return g <= save.cleared + 1;
}

// 네크로맨서는 처음 깬 스테이지 수만큼 강해진다 (10스테이지마다 다음 지역 수준)
export function necroPower(save) {
  return regionPower(save.cleared / STAGES_PER_REGION);
}

export function necroUnit(save) {
  const p = necroPower(save);
  return { typeId: 'necro', name: '네크로맨서', necro: true, level: save.cleared + 1, hp: Math.round(NECRO.hp * p), atk: Math.round(NECRO.atk * p * 10) / 10, interval: NECRO.interval, trait: 'bolt' };
}

export function summonUnit(r) {
  return { typeId: r.type, name: MONSTERS[r.type].name, level: r.level, rosterId: r.id, ...unitStats(r.type, r.level) };
}

export function partyUnits(save) {
  const summons = save.party.map(id => save.roster.find(r => r.id === id)).filter(Boolean).map(summonUnit);
  return [...summons, necroUnit(save)];
}

// 스테이지가 오를수록 적이 많아지고 강한 종류가 섞인다. 10스테이지는 보스와 부하 둘
export function stageEnemies(region, stage, rand) {
  const R = REGIONS[region];
  if (isBossStage(stage)) {
    const minions = [R.monsters[2], R.monsters[3]];
    return [...minions, R.boss].map(type => ({ type, level: stage }));
  }
  const count = 2 + Math.floor(stage / 5);
  const maxTier = Math.min(5, 1 + Math.floor((stage - 1) / 2));
  return Array.from({ length: count }, () => ({ type: R.monsters[Math.floor(rand() * maxTier)], level: stage }))
    // 강한 몬스터가 앞에 서서 몸으로 막는다
    .sort((a, b) => MONSTERS[b.type].tier - MONSTERS[a.type].tier);
}

export function enemyUnits(list) {
  return list.map(e => ({ typeId: e.type, name: MONSTERS[e.type].name, level: e.level, ...unitStats(e.type, e.level) }));
}

// 길들이기 후보 3마리. 보스 스테이지에서는 보스가 반드시 들어간다
export function tameOptions(region, stage, rand) {
  const R = REGIONS[region];
  const pool = [...R.monsters];
  const picks = [];
  if (isBossStage(stage)) picks.push(R.boss);
  while (picks.length < 3) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picks;
}

// 길들이기를 시도한다. 성공하면 새 소환수로, 이미 있으면 그 소환수의 레벨을 올린다
export function tame(save, type, stage, rand) {
  const chance = tameChance(type);
  if (rand() >= chance) return { success: false, chance };
  const owned = save.roster.find(r => r.type === type);
  if (owned) {
    const before = owned.level;
    owned.level = Math.min(MAX_LEVEL, Math.max(owned.level + 1, stage));
    owned.xp = 0;
    return { success: true, chance, unit: owned, levelUp: owned.level - before };
  }
  // 싸웠던 그 레벨 그대로 데려온다
  const unit = { id: save.nextId++, type, level: stage, xp: 0 };
  save.roster.push(unit);
  if (save.party.length < PARTY_SIZE) save.party.push(unit.id);
  return { success: true, chance, unit, isNew: true };
}

export function xpNeed(level) {
  return 5 + level * 3;
}

// 이긴 전투에 나간 소환수에게 경험치를 준다. 레벨이 오른 소환수 목록을 돌려준다
export function grantXp(save, stage) {
  const ups = [];
  for (const id of save.party) {
    const r = save.roster.find(o => o.id === id);
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
  return { first };
}

export function toggleParty(save, id) {
  if (save.party.includes(id)) {
    save.party = save.party.filter(p => p !== id);
    return { ok: true, added: false };
  }
  if (save.party.length >= PARTY_SIZE) return { ok: false, reason: `소환수는 ${PARTY_SIZE}마리까지 데려갈 수 있어요` };
  save.party.push(id);
  return { ok: true, added: true };
}

// 지역 파괴율: 그 지역에서 처음 깬 스테이지 비율
export function regionProgress(save, region) {
  const done = Math.max(0, Math.min(STAGES_PER_REGION, save.cleared - region * STAGES_PER_REGION));
  return done / STAGES_PER_REGION;
}
