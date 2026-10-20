import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, REGIONS, TAME_CHANCE, SHAPES, EVO_LEVEL, MAX_EVO, EVO_POWER, unitStats, tameChance, levelMult, starsOf, displayName } from './data.js';
import { createBattle, stepBattle, useSkill, canUse, simulate, necro, killsByType, NECRO_D, LANES } from './battle.js';
import {
  defaultSave, loadSave, stageEnemies, tameOptions, tame, tameAmount, recordWin, recordLoss, partyUnits, enemyUnits, groupEnemies,
  stageOf, globalStage, isUnlocked, regionProgress, STAGE_COUNT, armySize, enemyCount, necroLevel, stageSouls,
  levelUp, levelUpCost, evolve, canEvolve, evolveCost, rollRoulette, applyRoulette, ROULETTE, TAME_MIN,
} from './progress.js';

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const fixed = v => () => v;
const unit = (o = {}) => ({ typeId: 'slime', name: 'x', level: 1, hp: 100, atk: 10, interval: 1, trait: 'swift', speed: 20, ...o });
const necroU = (o = {}) => unit({ necro: true, trait: 'bolt', speed: 0, ...o });

test('지역은 5개, 지역마다 몬스터 5종과 보스', () => {
  assert.equal(REGIONS.length, 5);
  for (const R of REGIONS) {
    assert.deepEqual(R.monsters.map(t => MONSTERS[t].tier), [1, 2, 3, 4, 5]);
    assert.equal(MONSTERS[R.boss].tier, 'boss');
  }
});

test('강한 몬스터일수록 길들이기 확률이 낮고, 보스가 가장 낮다', () => {
  const chances = [1, 2, 3, 4, 5].map(t => TAME_CHANCE[t]);
  for (let i = 1; i < chances.length; i++) assert.ok(chances[i] < chances[i - 1]);
  assert.ok(TAME_CHANCE.boss < TAME_CHANCE[5]);
});

test('능력치: 다음 지역, 높은 레벨, 진화할수록 강하다', () => {
  assert.ok(unitStats('sewer', 1).hp > unitStats('slime', 1).hp);
  assert.ok(unitStats('slime', 5).atk > unitStats('slime', 1).atk);
  assert.equal(unitStats('slime', 1, 1).hp, Math.round(SHAPES.blob.hp * EVO_POWER));
  assert.equal(levelMult(1), 1);
  assert.equal(displayName('slime', 1), '상급 슬라임');
  assert.equal(displayName('slime', 2), '고대 슬라임');
  assert.equal(starsOf('chief'), 8);
});

test('처음에는 슬라임 1마리로 시작한다', () => {
  const s = defaultSave();
  assert.deepEqual(s.roster.map(r => [r.type, r.count]), [['slime', 1]]);
  assert.equal(armySize(s), 1);
  assert.deepEqual(partyUnits(s).map(u => u.typeId), ['slime', 'necro']);
});

test('전투: 적은 네크로맨서를 향해 오고, 막는 소환수가 없으면 네크로맨서를 때린다', () => {
  const b = createBattle([necroU({ hp: 50, atk: 0 })], [unit({ atk: 10 })], fixed(0.5), { spawnTime: 0 });
  assert.equal(simulate(b), 'lose');
  assert.equal(b.enemies[0].d >= NECRO_D - 3, true);
});

test('전투: 소환수가 길을 막으면 적은 소환수와 싸운다', () => {
  // 모든 줄을 소환수가 막고 있으면 네크로맨서는 맞지 않는다
  const summons = Array.from({ length: LANES }, () => unit({ hp: 1000, atk: 50 }));
  const b = createBattle([...summons, necroU({ hp: 10, atk: 0 })], [unit({ hp: 100, atk: 5 })], fixed(0.5), { spawnTime: 0 });
  const events = [];
  while (!b.over) events.push(...stepBattle(b, 1));
  assert.equal(b.result, 'win');
  assert.ok(!events.some(e => e.type === 'hit' && e.target.necro));
});

test('전투: 제한 시간(3분)이 지나면 패배', () => {
  const summons = Array.from({ length: LANES }, () => unit({ hp: 1e9, atk: 0.0001 }));
  const b = createBattle([...summons, necroU({ hp: 1e9, atk: 0 })], [unit({ hp: 1e9, atk: 0.0001 })], fixed(0.5), { spawnTime: 0 });
  assert.equal(simulate(b), 'lose');
  assert.ok(b.time >= 180);
});

test('전투: 적은 시간을 두고 차례로 나온다', () => {
  const enemies = Array.from({ length: 10 }, () => unit({ hp: 1e6, atk: 0 }));
  const b = createBattle([necroU({ hp: 1e6, atk: 0 })], enemies, fixed(0.5), { spawnTime: 9 });
  stepBattle(b, 0.1);
  assert.ok(b.spawned >= 1 && b.spawned < 10);
  stepBattle(b, 10);
  assert.equal(b.spawned, 10);
});

test('스킬: 영혼 폭발은 나와 있는 모든 적에게 피해, 쿨타임 동안 다시 못 씀', () => {
  const b = createBattle([necroU({ atk: 10 })], [unit({ hp: 100 }), unit({ hp: 5 })], fixed(0.5), { spawnTime: 0, dmgScale: 1 });
  stepBattle(b, 0.05);
  b.cooldowns.blast = 0;
  useSkill(b, 'blast');
  assert.equal(b.enemies[0].hp, 70);
  assert.equal(b.enemies[1].alive, false);
  assert.equal(canUse(b, 'blast'), false);
});

test('스킬: 되살리기는 쓰러진 소환수를 체력 50%로', () => {
  const b = createBattle([unit({ hp: 80 }), unit({ hp: 80 }), necroU()], [unit()], fixed(0.5));
  assert.equal(canUse(b, 'revive'), false);
  for (const u of b.allies.slice(0, 2)) { u.alive = false; u.hp = 0; }
  b.alive.ally = 1;
  useSkill(b, 'revive');
  assert.ok(b.allies[0].alive && b.allies[1].alive);
  assert.equal(b.allies[0].hp, 40);
  assert.ok(necro(b).necro);
});

test('전투: 수천 마리끼리 싸워도 끝까지 돌아가고 빠르다', () => {
  const r = seeded(4);
  const allies = [...Array.from({ length: 3000 }, () => unit({ hp: 50, atk: 5, interval: 0.5 + r() })), necroU({ hp: 1e6 })];
  const enemies = Array.from({ length: 3000 }, () => unit({ hp: 50, atk: 5, interval: 0.5 + r(), trait: r() < 0.2 ? 'ambush' : 'splash' }));
  const t0 = Date.now();
  const b = createBattle(allies, enemies, r);
  simulate(b);
  assert.ok(b.over);
  assert.ok(b.time < 60, `${b.time}초`);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
});

test('쓰러뜨린 적을 종류별로 센다', () => {
  const b = createBattle([unit({ atk: 1000 }), necroU()], [unit({ typeId: 'dog', hp: 1 }), unit({ typeId: 'dog', hp: 1 }), unit({ typeId: 'crow', hp: 1 })], fixed(0.5), { spawnTime: 0 });
  simulate(b);
  assert.deepEqual(killsByType(b), { dog: 2, crow: 1 });
});

test('스테이지 번호 변환과 잠금', () => {
  assert.deepEqual(stageOf(11), { region: 1, stage: 1 });
  assert.equal(globalStage(4, 10), STAGE_COUNT);
  assert.ok(isUnlocked(defaultSave(), 1));
  assert.ok(!isUnlocked(defaultSave(), 2));
});

test('적 수: 스테이지마다 늘어 마지막엔 3000마리 이하, 10스테이지는 보스가 맨 마지막', () => {
  assert.equal(enemyCount(1), 2);
  assert.ok(enemyCount(STAGE_COUNT) > 2000 && enemyCount(STAGE_COUNT) <= 3000);
  const r = seeded(3);
  const boss = stageEnemies(1, 10, r);
  assert.equal(boss.at(-1).type, REGIONS[1].boss);
  for (const e of stageEnemies(1, 5, r)) assert.ok(REGIONS[1].monsters.includes(e.type));
  const many = stageEnemies(4, 9, r);
  const count = t => many.filter(e => e.type === REGIONS[4].monsters[t - 1]).length;
  assert.ok(count(1) > count(5));
});

test('길들이기 후보: 이번 전투에서 만난 적 종류 중에서만, 최대 3가지, 보스가 있었으면 포함', () => {
  const r = seeded(5);
  const list = stageEnemies(2, 7, r);
  const opts = tameOptions(list, r);
  assert.ok(opts.length >= 1 && opts.length <= 3);
  for (const t of opts) assert.ok(list.some(e => e.type === t));
  assert.deepEqual(tameOptions([{ type: 'slime' }, { type: 'slime' }], r), ['slime']);
  assert.ok(tameOptions(stageEnemies(2, 10, r), r).includes(REGIONS[2].boss));
  assert.deepEqual(groupEnemies([{ type: 'slime', level: 1 }, { type: 'slime', level: 1 }]), [{ type: 'slime', level: 1, count: 2 }]);
});

test('길들이기: 성공하면 쓰러뜨린 같은 종류의 일부를 데려오고, 길들인 만큼만 소환한다', () => {
  const s = defaultSave();
  assert.equal(tame(s, 'dog', 4, { dog: 40 }, fixed(tameChance('dog'))).success, false);
  const ok = tame(s, 'dog', 4, { dog: 40 }, fixed(0));
  assert.ok(ok.success && ok.isNew);
  assert.equal(ok.amount, tameAmount('dog', { dog: 40 }));
  assert.equal(ok.unit.level, 4);
  assert.equal(tameAmount('dog', {}), TAME_MIN);
  const before = ok.unit.count;
  tame(s, 'dog', 6, { dog: 10 }, fixed(0));
  assert.equal(s.roster.find(r => r.type === 'dog').count, before + tameAmount('dog', { dog: 10 }));
  assert.equal(partyUnits(s).filter(u => u.typeId === 'dog').length, s.roster.find(r => r.type === 'dog').count);
  // 보스는 한 마리, 또 길들이면 레벨 업
  assert.equal(tame(s, 'chief', 10, {}, fixed(0)).amount, 1);
  const again = tame(s, 'chief', 10, {}, fixed(0));
  assert.equal(again.levelUp, 2);
  assert.equal(s.roster.find(r => r.type === 'chief').count, 1);
});

test('보상: 스테이지를 깨면 영혼, 처음 깨면 두 배. 져도 쓰러뜨린 만큼 조금', () => {
  const s = defaultSave();
  const first = recordWin(s, 1);
  assert.ok(first.first);
  assert.equal(first.souls, stageSouls(1, true));
  assert.equal(recordWin(s, 1).souls, stageSouls(1, false));
  assert.equal(stageSouls(1, true), stageSouls(1, false) * 2);
  const before = s.souls;
  assert.equal(recordLoss(s, 5, 0.5).souls, Math.floor(stageSouls(5, false) * 0.25));
  assert.ok(s.souls > before);
  assert.equal(recordLoss(s, 5, 0).souls, 0);
});

test('레벨 업: 영혼을 쓰고, 레벨이 오를수록 비싸진다', () => {
  const s = defaultSave();
  const r = s.roster[0];
  assert.equal(levelUp(s, r.id).ok, false);
  s.souls = 1000;
  const c1 = levelUpCost(r);
  assert.ok(levelUp(s, r.id).ok);
  assert.equal(r.level, 2);
  assert.equal(s.souls, 1000 - c1);
  assert.ok(levelUpCost(r) > c1);
});

test('진화: 레벨 10부터, 진화하면 레벨 1로 돌아가고 더 강해진다. 최대 2단계', () => {
  const s = defaultSave();
  const r = s.roster[0];
  s.souls = 1e6;
  assert.equal(canEvolve(r), false);
  r.level = EVO_LEVEL;
  const before = unitStats(r.type, r.level, r.evo).hp;
  const cost = evolveCost(r);
  assert.ok(evolve(s, r.id).ok);
  assert.equal(s.souls, 1e6 - cost);
  assert.deepEqual([r.evo, r.level], [1, 1]);
  assert.ok(unitStats(r.type, r.level, r.evo).hp > before);
  r.level = EVO_LEVEL;
  evolve(s, r.id);
  r.level = EVO_LEVEL;
  assert.equal(r.evo, MAX_EVO);
  assert.equal(evolve(s, r.id).ok, false);
  // 보스는 진화하지 않는다
  assert.equal(canEvolve({ type: 'chief', level: 20, evo: 0 }), false);
});

test('룰렛: 모든 칸이 나올 수 있고, 각 칸이 실제로 상을 준다', () => {
  const r = seeded(8);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(rollRoulette(r));
  assert.equal(seen.size, ROULETTE.length);
  for (let i = 0; i < ROULETTE.length; i++) {
    const s = defaultSave();
    s.roster.push({ id: 2, type: 'dog', level: 10, evo: 0, count: 10 });
    const before = JSON.stringify(s);
    const text = applyRoulette(s, i, 10, r);
    assert.ok(text.length > 0);
    assert.notEqual(JSON.stringify(s), before, ROULETTE[i].label);
  }
});

test('적 보스는 부하가 많을수록 강해진다', () => {
  const r = seeded(6);
  const bossOf = region => enemyUnits(stageEnemies(region, 10, r)).at(-1);
  const small = bossOf(0), big = bossOf(4);
  assert.ok(big.hp / unitStats(big.typeId, big.level).hp > small.hp / unitStats(small.typeId, small.level).hp);
});

test('처음 깬 스테이지만 진행도가 오르고, 마지막 스테이지를 깨면 엔딩', () => {
  const s = defaultSave();
  recordWin(s, 1);
  assert.equal(regionProgress(s, 0), 0.1);
  assert.equal(necroLevel(s), 2);
  s.cleared = STAGE_COUNT - 1;
  recordWin(s, STAGE_COUNT);
  assert.ok(s.ended);
});

test('저장 불러오기: 깨진 데이터는 새로 시작, 예전 군단은 편성 수를 마리 수로', () => {
  assert.deepEqual(loadSave('{깨짐'), defaultSave());
  const old = { cleared: 7, roster: [{ id: 1, type: 'skeleton', level: 3, xp: 2 }, { id: 2, type: 'dog', level: 5, xp: 0 }], army: { 1: 2, 2: 5 }, autoArmy: true, nextId: 3, settings: { speed: 2 } };
  const s = loadSave(JSON.stringify(old));
  assert.deepEqual(s.roster.map(r => [r.type, r.count, r.evo]), [['skeleton', 2, 0], ['dog', 5, 0]]);
  assert.equal(s.army, undefined);
  assert.equal(s.souls, 0);
  assert.deepEqual(s.settings, { speed: 2, autoSkill: false });
});

test('밸런스: 첫 스테이지는 슬라임 1마리로도 대부분 이긴다', () => {
  const r = seeded(9);
  let wins = 0;
  for (let i = 0; i < 40; i++) {
    const b = createBattle(partyUnits(defaultSave()), enemyUnits(stageEnemies(0, 1, r)), r);
    if (simulate(b) === 'win') wins++;
  }
  assert.ok(wins >= 30, `${wins}/40`);
});
