import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

test('20 stages across 4 regions, last of each region is a boss', () => {
  assert.equal(L.STAGE_COUNT, 20);
  for (let i = 0; i < 20; i++) {
    const s = L.stageInfo(i);
    assert.equal(s.boss, s.local === 4);
  }
  assert.equal(L.stageInfo(20), null);
  assert.equal(L.stageInfo(5).region.id, 'city');
  assert.equal(L.stageInfo(19).target.name, '목성');
});

test('needle sweeps -1..1 and passes center', () => {
  assert.equal(L.needlePos(0, 1), -1);
  assert.equal(L.needlePos(0.25, 1), 0);
  assert.equal(L.needlePos(0.5, 1), 1);
  assert.ok(Math.abs(L.needlePos(0.75, 1)) < 1e-9);
  for (let t = 0; t < 3; t += 0.013) {
    const p = L.needlePos(t, 1.3, 0.37);
    assert.ok(p >= -1 && p <= 1);
  }
});

test('judging by distance from center', () => {
  assert.equal(L.judgeJump(0).grade, 'perfect');
  assert.equal(L.judgeJump(-0.05).grade, 'perfect');
  assert.equal(L.judgeJump(0.15).grade, 'great');
  assert.equal(L.judgeJump(-0.4).grade, 'good');
  assert.equal(L.judgeJump(0.9).grade, 'miss');
});

test('closer to center → higher jump and more damage', () => {
  let prevF = Infinity, prevD = Infinity;
  for (const p of [0, 0.1, 0.3, 0.6, 1]) {
    const j = L.judgeJump(p);
    const f = L.jumpFraction(j), d = L.damage(j, 'none', 0);
    assert.ok(f < prevF && d < prevD, `p=${p}`);
    prevF = f; prevD = d;
  }
  assert.equal(L.jumpFraction(L.judgeJump(0)), 1);
  assert.ok(L.jumpFraction(L.judgeJump(0.1)) < 0.8, 'perfect clearly higher than great');
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
});

test('jump arc peaks at the middle', () => {
  const T = 1.5, H = 80;
  assert.equal(L.heightAt(0, T, H), 0);
  assert.equal(L.heightAt(T / 2, T, H), H);
  assert.equal(L.heightAt(T, T, H), 0);
  assert.ok(L.heightAt(T * 0.4, T, H) > H * 0.9, 'hangs near the top');
});

test('combo grows with perfects, caps, breaks otherwise', () => {
  const P = L.judgeJump(0), G = L.judgeJump(0.3);
  assert.equal(L.nextCombo(2, P, 'none'), 3);
  assert.equal(L.nextCombo(2, G, 'perfect'), 3);
  assert.equal(L.nextCombo(2, G, 'great'), 0);
  assert.equal(L.comboMult(99), 1 + L.COMBO_STEP * L.COMBO_MAX);
});

test('jumps grow from meters to space', () => {
  const first = L.stageInfo(0), last = L.stageInfo(19);
  const m0 = first.maxJump * first.region.mPerUnit;
  const m1 = last.maxJump * last.region.mPerUnit;
  assert.ok(m0 < 10, `${m0}m`);
  assert.ok(m1 > 100000 * 1000, `${m1}m`);
  assert.equal(L.formatMeters(40, first.region), '6.0m');
  assert.match(L.formatMeters(6000, last.region), /km$/);
});

test('stages are winnable with good play, not with misses', () => {
  for (let i = 0; i < 20; i++) {
    const s = L.stageInfo(i);
    // 한 번 뛰고 내려오는 데 걸리는 시간(대기 + 체공 + 착지)
    const cycle = (j) => 0.5 + L.airTime(L.jumpFraction(j), s.regionIndex) + 0.35;
    const run = (p, apex) => {
      const j = L.judgeJump(p);
      const n = Math.floor(s.time / cycle(j));
      return n * L.damage(j, apex, 0);
    };
    assert.ok(run(0.12, 'great') >= s.maxHp, `stage ${i} winnable with great/great`);
    assert.ok(run(0.6, 'none') < s.maxHp, `stage ${i} not winnable by mashing`);
  }
});

test('formatNumber uses Korean units', () => {
  assert.equal(L.formatNumber(950), '950');
  assert.equal(L.formatNumber(12000), '1.2만');
  assert.equal(L.formatNumber(3e8), '3억');
  assert.equal(L.formatNumber(2.5e12), '2.5조');
});

test('save roundtrip and clear unlocks next', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(storage);
  assert.equal(s.unlocked, 0);
  L.recordClear(s, 0, 500);
  L.storeSave(storage, s);
  const t = L.loadSave(storage);
  assert.equal(t.unlocked, 1);
  assert.equal(t.best, 500);
  assert.deepEqual(L.loadSave({ getItem() { throw new Error('x'); } }), L.defaultSave());
});
