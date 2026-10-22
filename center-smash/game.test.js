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

test('hero starts on the ground beside buildings, on top of spheres', () => {
  const hut = L.stageInfo(0);
  assert.ok(hut.x0 < -hut.target.w / 2);
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
  // 리듬게임식 PERFECT: 바늘 빠르기와 상관없이 정중앙 ±40ms
  for (const i of [0, 25, 49]) {
    const sp = L.stageInfo(i).needleSpeed;
    const at = (ms) => L.judgeJump(L.needlePos(0.25 / sp + ms / 1000, sp), 1, sp).grade;
    assert.equal(at(0), 'perfect');
    assert.equal(at(39), 'perfect', `stage ${i} +39ms`);
    assert.equal(at(-39), 'perfect', `stage ${i} -39ms`);
    assert.notEqual(at(45), 'perfect', `stage ${i} +45ms`);
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
  assert.equal(L.damage(j, 'perfect', 0), Math.round(L.damage(j, 'none', 0) * 2));
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

test('stages are winnable with good play, not with mashing', () => {
  for (let i = 0; i < 50; i++) {
    const s = L.stageInfo(i);
    // 한 번 뛰고 돌아오는 데 걸리는 시간(바늘 기다림 + 체공 + 반동)
    const cycle = (j) => 1 / (4 * s.needleSpeed) + 0.07 + L.airTime(L.jumpFraction(j)) + L.BOUNCE_TIME + 0.05;
    const run = (p, apex) => {
      const j = L.judgeJump(p);
      return Math.floor(s.time / cycle(j)) * L.damage(j, apex, 0);
    };
    assert.ok(run(0.1, 'great') >= s.maxHp, `stage ${i} winnable with great/great`);
    assert.ok(run(0.6, 'none') < s.maxHp, `stage ${i} not winnable by mashing`);
  }
});

test('formatting', () => {
  assert.equal(L.formatNumber(950), '950');
  assert.equal(L.formatNumber(12000), '1.2만');
  assert.equal(L.formatNumber(3e8), '3억');
  assert.equal(L.formatMeters(6), '6.0m');
  assert.equal(L.formatMeters(2500), '2.5km');
  assert.match(L.formatMeters(1e21), /광년$/);
});

test('coins on every clear, double on first; buy and select characters', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(storage);
  assert.equal(s.coins, 0);
  const a = L.recordClear(s, 0, 500, 1);
  assert.equal(a.first, true);
  assert.equal(a.coins, 22);
  const b = L.recordClear(s, 0, 500, 0);
  assert.equal(b.coins, 10);
  assert.equal(s.coins, 32);
  assert.equal(L.buyChar(s, 'turtle'), false, 'not enough coins');
  s.coins = 250;
  assert.equal(L.buyChar(s, 'turtle'), true);
  assert.equal(s.coins, 50);
  assert.equal(s.char, 'turtle');
  assert.equal(L.buyChar(s, 'turtle'), false, 'already owned');
  assert.equal(L.selectChar(s, 'gold'), false);
  assert.equal(L.selectChar(s, 'punch'), true);
  L.storeSave(storage, s);
  const t = L.loadSave(storage);
  assert.deepEqual(t.owned, ['punch', 'turtle']);
  assert.equal(t.unlocked, 1);
  assert.deepEqual(L.loadSave({ getItem() { throw new Error('x'); } }), L.defaultSave());
});

test('character perks change stage numbers', () => {
  assert.ok(L.stageInfo(3, L.charById('clock')).time > L.stageInfo(3).time);
  assert.equal(L.stageInfo(3, L.charById('hawk')).zone, 1.6);
  assert.equal(L.charById('nope').id, 'punch');
});
