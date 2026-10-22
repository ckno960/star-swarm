import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

test('50 stages across 5 regions, last of each region is a boss', () => {
  assert.equal(L.STAGE_COUNT, 50);
  for (let i = 0; i < 50; i++) {
    const s = L.stageInfo(i);
    assert.equal(s.boss, s.local === 9, `stage ${i}`);
  }
  assert.equal(L.stageInfo(50), null);
  assert.equal(L.stageInfo(10).region.id, 'city');
  assert.equal(L.stageInfo(49).target.name, '은하');
});

test('targets grow so the 1.8m hero shrinks to a dot', () => {
  let prev = 0;
  for (let i = 0; i < 50; i++) {
    const t = L.stageInfo(i).target;
    assert.ok(t.h >= prev * 0.5, `stage ${i} not much smaller than before`);
    prev = Math.max(prev, t.h);
  }
  assert.ok(L.stageInfo(49).target.h / L.HERO_M > 1e20);
});

test('hero starts on the ground in front of buildings (vertical jumps), on top of spheres', () => {
  const hut = L.stageInfo(0);
  assert.equal(hut.x0, 0);
  const moon = L.stageInfo(33);
  assert.equal(moon.sphere, true);
  assert.equal(moon.x0, 0);
});

test('needle sweeps -1..1 and passes center', () => {
  assert.equal(L.needlePos(0, 1), -1);
  assert.equal(L.needlePos(0.25, 1), 0);
  assert.equal(L.needlePos(0.5, 1), 1);
  for (let t = 0; t < 3; t += 0.013) {
    const p = L.needlePos(t, 1.3, 0.37);
    assert.ok(p >= -1 && p <= 1);
  }
});

test('perfect is 3% of the bar; slow needle', () => {
  assert.equal(L.judgeJump(0.03).grade, 'perfect');
  assert.equal(L.judgeJump(-0.035).grade, 'great');
  assert.equal(L.judgeJump(0.3).grade, 'good');
  assert.equal(L.judgeJump(0.5).grade, 'miss');
  assert.equal(L.judgeJump(0.04, 1.6).grade, 'perfect', 'wider zones for 매눈이');
  // 리듬게임식 PERFECT: 바늘 빠르기와 상관없이 정중앙 ±16ms
  for (const i of [0, 25, 49]) {
    const sp = L.stageInfo(i).needleSpeed;
    const at = (ms) => L.judgeJump(L.needlePos(0.25 / sp + ms / 1000, sp), 1, sp).grade;
    assert.equal(at(0), 'perfect');
    assert.equal(at(15), 'perfect', `stage ${i} +15ms`);
    assert.equal(at(-15), 'perfect', `stage ${i} -15ms`);
    assert.notEqual(at(18), 'perfect', `stage ${i} +18ms`);
  }
  assert.ok(L.stageInfo(0).needleSpeed <= 0.4);
  assert.ok(L.stageInfo(49).needleSpeed <= 0.6);
  assert.ok(L.stageInfo(0, L.charById('turtle')).needleSpeed < L.stageInfo(0).needleSpeed);
});

test('closer to center → higher jump and more damage', () => {
  let prevF = Infinity, prevD = Infinity;
  for (const p of [0, 0.1, 0.3, 0.6, 1]) {
    const j = L.judgeJump(p);
    const f = L.jumpFraction(j), d = L.damage(j, 'none', 0);
    assert.ok(f < prevF && d < prevD, `p=${p}`);
    prevF = f; prevD = d;
  }
});

test('apex press: perfect at the top, bonus multiplies damage', () => {
  const T = 2;
  assert.equal(L.judgeApex(1, T), 'perfect');
  assert.equal(L.judgeApex(1.1, T), 'great');
  assert.equal(L.judgeApex(0.75, T), 'ok');
  assert.equal(L.judgeApex(0.3, T), 'early');
  assert.equal(L.judgeApex(1.6, T), 'late');
  const j = L.judgeJump(0.1);
  assert.ok(Math.abs(L.damage(j, 'perfect', 0) - L.damage(j, 'none', 0) * 3) <= 2);
  // PERFECT + PERFECT는 GREAT + GREAT의 10배 가까이
  assert.ok(L.damage(L.judgeJump(0), 'perfect', 0) > L.damage(j, 'great', 0) * 8);
  assert.ok(Math.abs(L.damage(j, 'none', 0, 1.25) - L.damage(j, 'none', 0) * 1.25) <= 1);
});

test('arc: ground → apex → roof', () => {
  const T = 1.5;
  assert.equal(L.arcY(0, T, 0, 30, 10), 0);
  assert.equal(L.arcY(T / 2, T, 0, 30, 10), 30);
  assert.equal(L.arcY(T, T, 0, 30, 10), 10);
  assert.ok(L.arcY(T * 0.4, T, 0, 30, 10) > 27, 'hangs near the top');
});

test('combo grows with perfects, caps, breaks otherwise', () => {
  const P = L.judgeJump(0), G = L.judgeJump(0.3);
  assert.equal(L.nextCombo(2, P, 'none'), 3);
  assert.equal(L.nextCombo(2, G, 'perfect'), 3);
  assert.equal(L.nextCombo(2, G, 'great'), 0);
  assert.equal(L.comboMult(99), 1 + L.COMBO_STEP * L.COMBO_MAX);
});

test('formatting', () => {
  assert.equal(L.formatNumber(950), '950');
  assert.equal(L.formatNumber(12000), '1.2만');
  assert.equal(L.formatNumber(3e8), '3억');
  assert.equal(L.formatMeters(6), '6.0m');
  assert.equal(L.formatMeters(2500), '2.5km');
  assert.match(L.formatMeters(1e21), /광년$/);
});

test('character perks change stage numbers', () => {
  const sv = L.defaultSave();
  assert.ok(L.autoDelay(sv, L.charById('clock')) < L.autoDelay(sv));
  assert.equal(L.powerMult(sv, L.charById('gold')), 2);
  assert.equal(L.stageInfo(3, L.charById('hawk')).zone, 1.6);
  assert.equal(L.charById('nope').id, 'punch');
});

test('idle: HP and coins grow, upgrades cost more each level', () => {
  assert.ok(L.stageInfo(1).maxHp > L.stageInfo(0).maxHp);
  assert.equal(L.stageInfo(9).maxHp, Math.round(L.HP_BASE * L.HP_GROWTH ** 9 * 2));
  assert.ok(L.stageCoins(21) > L.stageCoins(20) * 1.2);
  assert.ok(L.upgradeCost('power', 5) > L.upgradeCost('power', 4));
  assert.equal(L.upgradeCost('auto', 12), Infinity);
  const s = L.defaultSave();
  s.coins = 100;
  assert.equal(L.buyUpgrade(s, 'power'), true);
  assert.equal(s.upgrades.power, 1);
  assert.equal(s.coins, 85);
  assert.equal(L.buyUpgrade(s, 'aim'), true);
  assert.equal(L.buyUpgrade(s, 'aim'), false, 'not enough coins');
});

test('manual play beats auto by a clear margin', () => {
  const s = L.defaultSave();
  const auto = L.autoDps(s);
  // 직접: 기다리지 않고 바로 뛰고(바늘 기다림 평균 0.6초), GREAT 점프 + GREAT 찍기, 찍으면 내려오는 시간이 짧다
  const j = L.judgeJump(0.1);
  const manual = L.damage(j, 'great', 0) / (0.6 + 0.07 + L.airTime(L.jumpFraction(j)) * 0.75 + L.BOUNCE_TIME);
  assert.ok(manual > auto * 3, `${manual} vs ${auto}`);
  // 자동만으로도 첫 대상은 몇 분 안에 부순다
  const t = L.stageInfo(0).maxHp / auto;
  assert.ok(t > 60 && t < 240, `${t}s`);
  // 자동 강화가 자동 피해를 올린다
  s.upgrades = { power: 5, auto: 5, aim: 5 };
  assert.ok(L.autoDps(s) > auto * 3);
});

test('offline progress destroys stages and pays coins, capped at 8 hours', () => {
  const s = L.defaultSave();
  const r = L.offlineProgress(s, 3600);
  assert.ok(r.stages >= 5 && r.stages < 30, `${r.stages} stages`);
  assert.ok(r.coins > 0 && s.coins === r.coins);
  assert.equal(s.unlocked, r.stages);
  assert.ok(s.hpLeft > 0);
  const t = L.defaultSave();
  assert.equal(L.offlineProgress(t, 1e9).seconds, L.OFFLINE_CAP);
});

test('clear pays stage coins and moves on; saves round-trip', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(storage);
  s.hpLeft = 123;
  assert.equal(L.recordClear(s, 0), L.stageCoins(0));
  assert.equal(s.unlocked, 1);
  assert.equal(s.hpLeft, null);
  s.coins = 400;
  assert.equal(L.buyChar(s, 'turtle'), true);
  assert.equal(s.char, 'turtle');
  assert.equal(L.buyChar(s, 'turtle'), false);
  L.storeSave(storage, s);
  const t = L.loadSave(storage);
  assert.deepEqual(t.owned, ['punch', 'turtle']);
  assert.equal(t.coins, 100);
  assert.equal(t.upgrades.power, 0);
  assert.deepEqual(L.loadSave({ getItem() { throw new Error('x'); } }), L.defaultSave());
});
