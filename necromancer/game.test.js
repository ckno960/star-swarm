import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, REGIONS, TAME_CHANCE, unitStats, tameChance, levelMult } from './data.js';
import { createBattle, stepBattle, useSkill, canUse, simulate, necro, SKILLS } from './battle.js';
import {
  defaultSave, loadSave, stageEnemies, tameOptions, tame, grantXp, recordWin, toggleParty, partyUnits, enemyUnits,
  stageOf, globalStage, isUnlocked, regionProgress, xpNeed, PARTY_SIZE, STAGE_COUNT,
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
  const b = createBattle([unit({ trait: 'splash', atk: 10, interval: 1 }), unit({ necro: true, trait: 'bolt', atk: 0 })],
    [unit({ hp: 100, atk: 0 }), unit({ hp: 100, atk: 0 })], fixed(0.5));
  b.allies[0].timer = 0.01;
  stepBattle(b, 0.05);
  assert.equal(b.enemies[0].hp, 90);
  assert.equal(b.enemies[1].hp, 97);
  const d = createBattle([unit({ trait: 'drain', atk: 10 }), unit({ necro: true, trait: 'bolt', atk: 0 })], [unit({ hp: 100, atk: 0 })], fixed(0.5));
  d.allies[0].hp = 50;
  d.allies[0].timer = 0.01;
  stepBattle(d, 0.05);
  assert.equal(d.allies[0].hp, 53);
});

test('스킬: 영혼 폭발은 모든 적에게 피해, 쿨타임 동안 다시 못 씀', () => {
  const b = createBattle([unit({ necro: true, trait: 'bolt', atk: 10 })], [unit({ hp: 100 }), unit({ hp: 30 })], fixed(0.5));
  b.cooldowns.blast = 0;
  useSkill(b, 'blast');
  assert.equal(b.enemies[0].hp, 60);
  assert.equal(b.enemies[1].alive, false);
  assert.equal(canUse(b, 'blast'), false);
  assert.equal(b.cooldowns.blast, SKILLS.blast.cooldown);
});

test('스킬: 되살리기는 쓰러진 소환수가 있을 때만, 체력 50%로', () => {
  const b = createBattle([unit({ hp: 80 }), unit({ necro: true, trait: 'bolt' })], [unit()], fixed(0.5));
  assert.equal(canUse(b, 'revive'), false);
  b.allies[0].alive = false;
  b.allies[0].hp = 0;
  useSkill(b, 'revive');
  assert.ok(b.allies[0].alive);
  assert.equal(b.allies[0].hp, 40);
  assert.ok(necro(b).necro);
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

test('적 구성: 지역 몬스터만 나오고, 10스테이지는 보스가 맨 뒤', () => {
  const r = seeded(3);
  for (let stage = 1; stage <= 9; stage++) {
    const list = stageEnemies(1, stage, r);
    assert.ok(list.length >= 2);
    for (const e of list) assert.ok(REGIONS[1].monsters.includes(e.type));
  }
  const boss = stageEnemies(1, 10, r);
  assert.equal(boss.at(-1).type, REGIONS[1].boss);
});

test('길들이기 후보: 서로 다른 3마리, 보스 스테이지엔 보스 포함', () => {
  const r = seeded(5);
  for (let i = 0; i < 20; i++) {
    const opts = tameOptions(2, 4, r);
    assert.equal(new Set(opts).size, 3);
    for (const t of opts) assert.ok(REGIONS[2].monsters.includes(t));
  }
  assert.ok(tameOptions(2, 10, r).includes(REGIONS[2].boss));
});

test('길들이기: 확률보다 낮게 뽑히면 성공, 싸운 레벨로 합류하고 자리가 있으면 편성', () => {
  const s = defaultSave();
  const fail = tame(s, 'crow', 4, fixed(tameChance('crow')));
  assert.equal(fail.success, false);
  const ok = tame(s, 'crow', 4, fixed(0));
  assert.ok(ok.success && ok.isNew);
  assert.equal(ok.unit.level, 4);
  assert.ok(s.party.includes(ok.unit.id));
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

test('경험치: 편성한 소환수만 받고, 다 차면 레벨 업', () => {
  const s = defaultSave();
  s.roster.push({ id: 9, type: 'slime', level: 1, xp: 0 });
  const ups = grantXp(s, 10);
  assert.equal(s.roster[0].level, 2);
  assert.equal(s.roster[0].xp, 12 - xpNeed(1));
  assert.equal(ups.length, 1);
  assert.equal(s.roster[1].xp, 0);
});

test('편성은 3마리까지, 다시 누르면 빠진다', () => {
  const s = defaultSave();
  for (const id of [2, 3, 4]) s.roster.push({ id, type: 'slime', level: 1, xp: 0 });
  assert.ok(toggleParty(s, 2).ok);
  assert.ok(toggleParty(s, 3).ok);
  assert.equal(toggleParty(s, 4).ok, false);
  assert.equal(s.party.length, PARTY_SIZE);
  toggleParty(s, 1);
  assert.deepEqual(s.party, [2, 3]);
});

test('전투에는 편성 순서대로 소환수가 서고 네크로맨서가 맨 뒤', () => {
  const s = defaultSave();
  tame(s, 'slime', 1, fixed(0));
  const units = partyUnits(s);
  assert.deepEqual(units.map(u => u.typeId), ['skeleton', 'slime', 'necro']);
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

test('저장 불러오기: 깨진 데이터는 새로 시작, 빠진 설정은 채움', () => {
  assert.deepEqual(loadSave('{깨짐'), defaultSave());
  const s = loadSave(JSON.stringify({ cleared: 7, settings: { speed: 2 } }));
  assert.equal(s.cleared, 7);
  assert.deepEqual(s.settings, { speed: 2, autoSkill: false });
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
