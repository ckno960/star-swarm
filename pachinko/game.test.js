import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

test('upgrades: cost grows, value milestones double, rate caps', () => {
  const s = L.defaultSave();
  assert.equal(L.ballValue(s), 1); assert.equal(L.dropRate(s), 0.5);
  assert.equal(L.buyUpgrade(s, 'value'), false);
  s.money = 1e9;
  const c0 = L.upgradeCost(s, 'value'); L.buyUpgrade(s, 'value');
  assert.ok(L.upgradeCost(s, 'value') > c0); assert.equal(L.ballValue(s), 2);
  s.up.value = 25; assert.equal(L.ballValue(s), 52);
  s.up.rate = 30; assert.equal(L.upgradeCost(s, 'rate'), Infinity); assert.equal(L.dropRate(s), 8);
});

test('payout: slot multiplier, gold x10, fever multiplier', () => {
  const s = L.defaultSave();
  assert.equal(L.payout(s, 4), 4);
  assert.equal(L.payout(s, 4, true), 40);
  s.fever = 5; s.up.fever = 2;
  assert.equal(L.payout(s, 1), 7);
  assert.equal(s.balls, 3); assert.equal(s.money, 51); assert.equal(L.dropRate(s), 1);
});

test('reels: hold up to 4, jackpot odds follow luck, reach is a near miss', () => {
  const s = L.defaultSave();
  for (let i = 0; i < 6; i++) L.holdSpin(s);
  assert.equal(s.hold, 4);
  assert.equal(L.spin({ ...s, hold: 0 }), null);
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const j = L.spin(s, seq(0.001, 0.5));
  assert.equal(j.jackpot, true); assert.ok(j.digits[0] === j.digits[1] && j.digits[1] === j.digits[2]);
  const r = L.spin(s, seq(0.1, 0.5));
  assert.equal(r.jackpot, false); assert.equal(r.reach, true); assert.ok(r.digits[0] === r.digits[1] && r.digits[2] !== r.digits[0]);
  const m = L.spin(s, seq(0.9, 0.5));
  assert.equal(m.reach, false); assert.notEqual(m.digits[0], m.digits[1]);
  assert.equal(s.hold, 1);
  const lucky = L.defaultSave(); lucky.up.luck = 12;
  assert.ok(L.jackpotChance(lucky) > L.jackpotChance(s) * 3);
  // 많이 돌리면 잭팟 비율이 확률과 맞는다
  const t = L.defaultSave(); let hits = 0;
  for (let i = 0; i < 20000; i++) { t.hold = 1; if (L.spin(t).jackpot) hits++; }
  assert.ok(Math.abs(hits / 20000 - 1 / 30) < 0.01, `${hits / 20000}`);
});

test('jackpot starts fever, fever runs out', () => {
  const s = L.defaultSave();
  const b = L.jackpot(s);
  assert.equal(b, 150); assert.equal(s.fever, L.FEVER_SEC); assert.equal(L.feverMult(s), 5);
  L.stepFever(s, 20); assert.equal(s.fever, 0); assert.equal(L.feverMult(s), 1);
});

test('prestige: medals from this shop earnings, +10% each, upgrades reset', () => {
  const s = L.defaultSave();
  assert.equal(L.canPrestige(s), false); assert.equal(L.prestige(s), 0);
  s.total = 5e6; s.money = 123; s.up.value = 40;
  assert.equal(L.medalsFor(s.total), 10);
  assert.equal(L.prestige(s), 10);
  assert.equal(s.money, 0); assert.equal(s.up.value, 0); assert.equal(s.medals, 10); assert.equal(L.ballValue(s), 2);
});

test('offline earnings are capped, numbers format in Korean units, save round-trip', () => {
  const s = L.defaultSave(); s.up.value = 9; s.up.rate = 2;
  const r = L.offlineEarnings(s, 1e9);
  assert.equal(r.seconds, L.OFFLINE_CAP);
  assert.ok(Math.abs(r.money - 10 * L.EXPECTED_MULT * 1 * L.OFFLINE_CAP * 0.5) < 1e-6);
  assert.equal(L.fmt(9999), '9999'); assert.equal(L.fmt(12345), '1.23만'); assert.equal(L.fmt(3.2e8), '3.20억'); assert.equal(L.fmt(0.2), '0.2');
  const store = new Map(), io = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  s.fever = 9; L.storeSave(io, s);
  const t = L.loadSave(io); assert.equal(t.up.value, 9); assert.equal(t.fever, 0);
});
