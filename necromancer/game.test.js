import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, REGIONS, TAME_CHANCE, SHAPES, unitStats, tameChance, levelMult, starsOf } from './data.js';
import { createBattle, stepBattle, useSkill, canUse, simulate, necro, SKILLS, BLAST_MULT, DAMAGE_SCALE } from './battle.js';
import {
  defaultSave, loadSave, stageEnemies, tameOptions, tame, grantXp, recordWin, partyUnits, enemyUnits, groupEnemies,
  stageOf, globalStage, isUnlocked, regionProgress, xpNeed, STAGE_COUNT, starCap, armyStars, armySize, setCount, autoArmy,
  enemyCount, necroLevel,
} from './progress.js';

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const fixed = v => () => v;
const unit = (o = {}) => ({ typeId: 'x', name: 'x', level: 1, hp: 100, atk: 10, interval: 1, trait: 'swift', ...o });

test('지역은 5개, 지역마다 몬스터 5종과 보스', () => {
  assert.equal(REGIONS.length, 5);
  for (const R of REGIONS) {
    assert.equal(R.monsters.length, 5);
    assert.deepEqual(R.monsters.map(t => MONSTERS[t].tier), [1, 2, 3, 4, 5]);
    assert.equal(MONSTERS[R.boss].tier, 'boss');
  }
});

test('강한 몬스터일수록 길들이기 확률이 낮고, 보스가 가장 낮다', () => {
  const chances = [1, 2, 3, 4, 5].map(t => TAME_CHANCE[t]);
  for (let i = 1; i < chances.length; i++) assert.ok(chances[i] < chances[i - 1]);
  assert.ok(TAME_CHANCE.boss < TAME_CHANCE[5]);
});

test('별이 많은 몬스터일수록 별 하나당 힘이 조금 더 크다', () => {
  const perStar = shape => Math.sqrt(SHAPES[shape].hp * SHAPES[shape].atk / SHAPES[shape].interval);
  const shapes = ['blob', 'beast', 'flyer', 'humanoid', 'golem'];
  for (let i = 1; i < shapes.length; i++) assert.ok(perStar(shapes[i]) / (i + 1) > perStar(shapes[i - 1]) / i);
  assert.equal(starsOf('slime'), 1);
  assert.equal(starsOf('chief'), 8);
});

test('능력치: 다음 지역과 높은 레벨일수록 강하다', () => {
  assert.ok(unitStats('sewer', 1).hp > unitStats('slime', 1).hp);
  assert.ok(unitStats('slime', 5).atk > unitStats('slime', 1).atk);
  assert.equal(levelMult(1), 1);
});

test('전투: 맨 앞 상대를 때리고, 적을 모두 쓰러뜨리면 승리', () => {
  const b = createBattle([unit({ atk: 50 }), unit({ necro: true, trait: 'bolt', atk: 1 })], [unit({ hp: 40, atk: 1 })], fixed(0.5));
  assert.equal(simulate(b), 'win');
});

test('전투: 네크로맨서가 쓰러지면 소환수가 살아 있어도 패배', () => {
  // 급습하는 적은 맨 뒤 네크로맨서도 노린다
  const b = createBattle(
    [unit({ hp: 9999, atk: 0.1 }), unit({ necro: true, trait: 'bolt', hp: 10, atk: 0.1 })],
    [unit({ hp: 9999, atk: 50, trait: 'ambush' })], fixed(0.99),
  );
  assert.equal(simulate(b), 'lose');
  assert.ok(b.allies[0].alive);
});

test('전투: 90초가 지나면 패배', () => {
  const b = createBattle([unit({ necro: true, trait: 'bolt', hp: 1e6, atk: 0.01 })], [unit({ hp: 1e6, atk: 0.01 })], fixed(0.5));
  assert.equal(simulate(b), 'lose');
  assert.ok(b.time >= 90);
});

test('광역 공격은 나머지 적에게도 피해, 흡혈은 회복', () => {
  // 광역: 맨 앞과 그 뒤 2마리까지만
  const b = createBattle([unit({ trait: 'splash', atk: 30, interval: 1 }), unit({ necro: true, trait: 'bolt', atk: 0 })],
    [unit({ hp: 100, atk: 0 }), unit({ hp: 100, atk: 0 }), unit({ hp: 100, atk: 0 }), unit({ hp: 100, atk: 0 })], fixed(0.5));
  b.allies[0].timer = 0.01;
  stepBattle(b, 0.05);
  const dmg = 30 * DAMAGE_SCALE;
  assert.deepEqual(b.enemies.map(e => Math.round(e.hp * 10) / 10), [100 - dmg, 100 - dmg * 0.3, 100 - dmg * 0.3, 100].map(v => Math.round(v * 10) / 10));
  const d = createBattle([unit({ trait: 'drain', atk: 30 }), unit({ necro: true, trait: 'bolt', atk: 0 })], [unit({ hp: 100, atk: 0 })], fixed(0.5));
  d.allies[0].hp = 50;
  d.allies[0].timer = 0.01;
  stepBattle(d, 0.05);
  assert.equal(Math.round(d.allies[0].hp * 10) / 10, 50 + 30 * DAMAGE_SCALE * 0.3);
});

test('스킬: 영혼 폭발은 모든 적에게 피해, 쿨타임 동안 다시 못 씀', () => {
  const b = createBattle([unit({ necro: true, trait: 'bolt', atk: 10 })], [unit({ hp: 100 }), unit({ hp: 5 })], fixed(0.5));
  b.cooldowns.blast = 0;
  useSkill(b, 'blast');
  assert.equal(b.enemies[0].hp, 100 - 10 * BLAST_MULT * DAMAGE_SCALE);
  assert.equal(b.enemies[1].alive, false);
  assert.equal(canUse(b, 'blast'), false);
  assert.equal(b.cooldowns.blast, SKILLS.blast.cooldown);
});

test('스킬: 되살리기는 쓰러진 소환수가 있을 때만, 최대 10마리를 체력 50%로', () => {
  const allies = [...Array.from({ length: 12 }, () => unit({ hp: 80 })), unit({ necro: true, trait: 'bolt' })];
  const b = createBattle(allies, [unit()], fixed(0.5));
  assert.equal(canUse(b, 'revive'), false);
  for (const u of b.allies.slice(0, 12)) { u.alive = false; u.hp = 0; }
  b.alive.ally = 1;
  b.front.ally = 12;
  useSkill(b, 'revive');
  assert.equal(b.allies.filter(u => u.alive && !u.necro).length, 10);
  assert.equal(b.allies[0].hp, 40);
  assert.equal(b.alive.ally, 11);
  assert.ok(necro(b).necro);
});

test('전투: 수천 마리끼리 싸워도 끝까지 돌아가고 빠르다', () => {
  const r = seeded(4);
  const allies = [...Array.from({ length: 3000 }, () => unit({ hp: 50, atk: 5, interval: 0.5 + r() })), unit({ necro: true, trait: 'bolt', hp: 1e6 })];
  const enemies = Array.from({ length: 3000 }, () => unit({ hp: 50, atk: 5, interval: 0.5 + r(), trait: r() < 0.2 ? 'ambush' : 'splash' }));
  const t0 = Date.now();
  const b = createBattle(allies, enemies, r);
  simulate(b);
  assert.ok(b.over);
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
});

test('스테이지 번호 변환과 잠금', () => {
  assert.deepEqual(stageOf(1), { region: 0, stage: 1 });
  assert.deepEqual(stageOf(10), { region: 0, stage: 10 });
  assert.deepEqual(stageOf(11), { region: 1, stage: 1 });
  assert.equal(globalStage(4, 10), STAGE_COUNT);
  const s = defaultSave();
  assert.ok(isUnlocked(s, 1));
  assert.ok(!isUnlocked(s, 2));
});

test('적 수: 스테이지마다 늘어 마지막엔 3000마리 이하', () => {
  assert.equal(enemyCount(1), 2);
  for (let g = 2; g <= STAGE_COUNT; g++) assert.ok(enemyCount(g) >= enemyCount(g - 1));
  assert.ok(enemyCount(STAGE_COUNT) > 2000 && enemyCount(STAGE_COUNT) <= 3000, String(enemyCount(STAGE_COUNT)));
});

test('적 구성: 지역 몬스터만 나오고 약한 몬스터가 더 많다. 10스테이지는 보스가 맨 뒤', () => {
  const r = seeded(3);
  for (let stage = 1; stage <= 9; stage++) {
    const list = stageEnemies(1, stage, r);
    assert.equal(list.length, enemyCount(globalStage(1, stage)));
    for (const e of list) assert.ok(REGIONS[1].monsters.includes(e.type));
  }
  const many = stageEnemies(4, 9, r);
  const count = t => many.filter(e => e.type === REGIONS[4].monsters[t - 1]).length;
  assert.ok(count(1) > count(5));
  const boss = stageEnemies(1, 10, r);
  assert.equal(boss.at(-1).type, REGIONS[1].boss);
  assert.equal(boss.length, enemyCount(globalStage(1, 10)) + 1);
});

test('적 보스는 부하가 많을수록 강해진다', () => {
  const r = seeded(6);
  const bossOf = region => enemyUnits(stageEnemies(region, 10, r)).at(-1);
  const small = bossOf(0), big = bossOf(4);
  assert.ok(big.hp / unitStats(big.typeId, 10).hp > small.hp / unitStats(small.typeId, 10).hp);
});

test('길들이기 후보: 이번 전투에서 만난 적 종류 중에서만, 최대 3가지, 보스가 있었으면 포함', () => {
  const r = seeded(5);
  for (let i = 0; i < 20; i++) {
    const list = stageEnemies(2, 7, r);
    const opts = tameOptions(list, r);
    assert.ok(opts.length >= 1 && opts.length <= 3);
    assert.equal(new Set(opts).size, opts.length);
    for (const t of opts) assert.ok(list.some(e => e.type === t));
  }
  assert.deepEqual(tameOptions([{ type: 'slime' }, { type: 'slime' }], r), ['slime']);
  assert.ok(tameOptions(stageEnemies(2, 10, r), r).includes(REGIONS[2].boss));
  assert.deepEqual(groupEnemies([{ type: 'slime', level: 1 }, { type: 'slime', level: 1 }, { type: 'dog', level: 1 }]),
    [{ type: 'slime', level: 1, count: 2 }, { type: 'dog', level: 1, count: 1 }]);
});

test('길들이기: 확률보다 낮게 뽑히면 성공, 싸운 레벨로 합류하고 자동 편성이면 군단에 들어감', () => {
  const s = defaultSave();
  s.cleared = 6;
  const fail = tame(s, 'crow', 4, fixed(tameChance('crow')));
  assert.equal(fail.success, false);
  const ok = tame(s, 'crow', 4, fixed(0));
  assert.ok(ok.success && ok.isNew);
  assert.equal(ok.unit.level, 4);
  assert.ok(s.army[ok.unit.id] > 0);
});

test('이미 가진 몬스터를 또 길들이면 레벨이 오른다', () => {
  const s = defaultSave();
  tame(s, 'dog', 3, fixed(0));
  const again = tame(s, 'dog', 2, fixed(0));
  assert.equal(again.unit.level, 4);
  const higher = tame(s, 'dog', 9, fixed(0));
  assert.equal(higher.unit.level, 9);
  assert.equal(s.roster.filter(r => r.type === 'dog').length, 1);
});

test('경험치: 군단에 넣은 종류만 받고, 다 차면 레벨 업', () => {
  const s = defaultSave();
  s.roster.push({ id: 9, type: 'slime', level: 1, xp: 0 });
  const ups = grantXp(s, 10);
  assert.equal(s.roster[0].level, 2);
  assert.equal(s.roster[0].xp, 12 - xpNeed(1));
  assert.equal(ups.length, 1);
  assert.equal(s.roster[1].xp, 0);
});

test('별 한도: 네크로맨서 레벨(처음 깬 스테이지)이 오를수록 커진다', () => {
  const s = defaultSave();
  assert.equal(necroLevel(s), 1);
  assert.equal(starCap(s), 5);
  let prev = starCap(s);
  for (let c = 1; c < STAGE_COUNT; c++) { s.cleared = c; assert.ok(starCap(s) > prev); prev = starCap(s); }
});

test('편성: 같은 종류를 여러 마리, 별 한도를 넘으면 들어갈 만큼만, 보스는 한 마리', () => {
  const s = defaultSave();
  s.cleared = 10; // 한도 약 23
  s.roster.push({ id: 2, type: 'slime', level: 1, xp: 0 }, { id: 3, type: 'chief', level: 10, xp: 0 });
  s.army = {};
  assert.equal(setCount(s, 2, 10), 10);
  assert.equal(setCount(s, 3, 3), 1);
  assert.equal(armyStars(s), 18);
  const got = setCount(s, 1, 100); // 해골 병사 별 2개
  assert.equal(got, Math.floor((starCap(s) - 18) / 2));
  assert.ok(armyStars(s) <= starCap(s));
  setCount(s, 2, 0);
  assert.equal(s.army[2], undefined);
});

test('자동 편성은 별 한도를 거의 다 채우고 넘지 않는다', () => {
  const s = defaultSave();
  for (const c of [0, 5, 20, 45]) {
    s.cleared = c;
    s.roster = [{ id: 1, type: 'skeleton', level: 5, xp: 0 }, { id: 2, type: 'slime', level: 3, xp: 0 }, { id: 3, type: 'crow', level: 2, xp: 0 }, { id: 4, type: 'chief', level: 10, xp: 0 }];
    autoArmy(s);
    assert.ok(armyStars(s) <= starCap(s));
    assert.ok(starCap(s) - armyStars(s) < 1 + 1, `${armyStars(s)}/${starCap(s)}`);
  }
  assert.ok(armySize(s) > 100);
});

test('전투에는 튼튼한 종류가 앞에, 비행형이 뒤에 서고 네크로맨서가 맨 뒤', () => {
  const s = defaultSave();
  s.roster.push({ id: 2, type: 'crow', level: 1, xp: 0 }, { id: 3, type: 'slime', level: 1, xp: 0 });
  s.army = { 1: 1, 2: 2, 3: 1 };
  const units = partyUnits(s);
  assert.deepEqual(units.map(u => u.typeId), ['slime', 'skeleton', 'crow', 'crow', 'necro']);
  assert.equal(enemyUnits([{ type: 'slime', level: 1 }])[0].hp, unitStats('slime', 1).hp);
});

test('처음 깬 스테이지만 진행도가 오르고, 마지막 스테이지를 깨면 엔딩', () => {
  const s = defaultSave();
  assert.ok(recordWin(s, 1).first);
  assert.equal(recordWin(s, 1).first, false);
  assert.equal(regionProgress(s, 0), 0.1);
  s.cleared = STAGE_COUNT - 1;
  recordWin(s, STAGE_COUNT);
  assert.ok(s.ended);
});

test('저장 불러오기: 깨진 데이터는 새로 시작, 빠진 설정은 채움, 예전 편성은 자동 편성으로', () => {
  assert.deepEqual(loadSave('{깨짐'), defaultSave());
  const old = { cleared: 7, roster: [{ id: 1, type: 'skeleton', level: 3, xp: 0 }, { id: 2, type: 'dog', level: 5, xp: 0 }], party: [1, 2], nextId: 3, settings: { speed: 2 } };
  const s = loadSave(JSON.stringify(old));
  assert.equal(s.cleared, 7);
  assert.deepEqual(s.settings, { speed: 2, autoSkill: false });
  assert.equal(s.party, undefined);
  assert.ok(armyStars(s) > 0 && armyStars(s) <= starCap(s));
});

test('밸런스: 첫 스테이지는 해골 병사만으로 이길 수 있다', () => {
  const r = seeded(9);
  let wins = 0;
  for (let i = 0; i < 50; i++) {
    const b = createBattle(partyUnits(defaultSave()), enemyUnits(stageEnemies(0, 1, r)), r);
    if (simulate(b) === 'win') wins++;
  }
  assert.ok(wins >= 45, `${wins}/50`);
});
