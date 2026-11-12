import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const G = (rows) => Array.from({ length: 5 }, (_, c) => rows.map((r) => r[c]));   // 행 3줄(위→아래)을 grid[열][행]으로
const l = 'lemon', c = 'cherry', k = 'clover', b = 'bell', d = 'diamond', s = 'seven', x = 'skull', w = 'wild';
const run0 = () => { const r = L.newRun(L.defaultSave()); L.startRound(r); return r; };
const MISS = [[l, c, b, d, k], [b, d, k, l, c], [c, k, s, b, d]], HIT = [[l, l, l, c, b], [b, d, k, l, c], [c, k, s, b, d]];
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('lines: longest horizontal run, columns, diagonals, zigzag, jackpot', () => {
  const kinds = (g) => L.findLines(G(g)).map((n) => `${n.kind}:${n.sym}`).sort();
  assert.deepEqual(kinds([[l, l, l, c, b], [b, d, k, l, c], [c, k, s, b, d]]), ['h3:lemon']);
  assert.deepEqual(kinds([[l, l, l, l, b], [b, d, k, s, c], [c, k, s, b, d]]), ['h4:lemon']);
  assert.deepEqual(kinds([[s, s, s, s, s], [b, d, k, l, c], [c, k, l, b, d]]), ['h5:seven']);
  assert.deepEqual(kinds([[l, c, b, d, k], [l, d, k, s, c], [l, k, s, b, d]]), ['v3:lemon']);
  assert.deepEqual(kinds([[l, c, b, d, k], [b, l, k, s, c], [c, k, l, b, d]]), ['d3:lemon']);
  assert.deepEqual(kinds([[k, c, b, d, k], [b, k, s, k, c], [c, d, k, b, l]]), ['d3:clover', 'd3:clover', 'zig:clover']);
  assert.deepEqual(kinds([[b, b, b, b, b], [b, b, b, b, b], [b, b, b, b, b]]), ['full:bell']);
  assert.deepEqual(kinds(MISS), []);
});

test('wild matches anything except skulls', () => {
  assert.equal(L.findLines(G([[l, w, l, c, b], [b, d, k, l, c], [c, k, s, b, d]]))[0].kind, 'h3');
  assert.equal(L.findLines(G([[w, w, w, x, b], [b, d, k, l, c], [c, k, s, b, d]]))[0].sym, 'seven');
  assert.equal(L.findLines(G([[x, w, x, c, b], [b, d, k, l, c], [c, k, s, b, d]])).length, 0);
});

test('payout: symbol value x pattern, charms stack', () => {
  const r = run0();
  const res = L.spin(r, Math.random, G(HIT));
  assert.equal(res.total, 10); assert.equal(r.coins, 10); assert.equal(r.spinsLeft, 4);
  r.charms = ['candy', 'lamp', 'dice', 'cat'];   // 값 +15, 가로 ×2, (첫 스핀 아님), 스핀마다 +4
  const res2 = L.spin(r, Math.random, G([[l, l, l, l, b], [b, d, k, s, c], [c, k, s, b, d]]));
  assert.equal(res2.total, (10 + 15) * 3 * 2 + 4);
  const f = run0(); f.charms = ['dice'];
  assert.equal(L.spin(f, Math.random, G([[b, b, b, c, l], [l, d, k, s, c], [c, k, s, l, d]])).total, 60);
});

test('skull line halves your coins unless the ward blocks it', () => {
  const r = run0(); r.coins = 100;
  const g = G([[x, x, x, c, b], [b, d, k, l, c], [c, k, s, b, d]]);
  const res = L.spin(r, Math.random, g);
  assert.equal(res.curse, 50); assert.equal(r.coins, 50);
  const h = run0(); h.coins = 100; h.charms = ['holy'];
  const res2 = L.spin(h, Math.random, g);
  assert.equal(res2.curse, 0); assert.equal(h.coins, 130);
});

test('dry streak magnet and last-spin hourglass', () => {
  const r = run0(); r.charms = ['horseshoe', 'hourglass'];
  const miss = G(MISS), hit = G(HIT);
  L.spin(r, Math.random, miss); L.spin(r, Math.random, miss);
  assert.equal(r.dry, 2);
  assert.equal(L.spin(r, Math.random, hit).total, 30); assert.equal(r.dry, 0);
  L.spin(r, Math.random, miss);
  assert.equal(L.spin(r, Math.random, hit).total, 10 * 2 * 4, 'last spin x4 with one dry stack');
  assert.equal(L.spin(r, Math.random, hit), null);
});

test('rounds, deadline payment, early payment and death', () => {
  const r = run0(); r.coins = 500;
  r.spinsLeft = 0; assert.equal(L.endRound(r).paid, undefined); assert.equal(r.round, 2); assert.equal(r.phase, 'shop');
  const e = L.payEarly(r);
  assert.equal(e.skipped, 2); assert.equal(r.deadline, 2); assert.equal(r.round, 1); assert.equal(r.coins, 500 - 60 + 2 * 9);
  assert.ok(L.debtFor(2) > L.debtFor(1) * 1.5);
  const p = run0(); p.round = 3; p.coins = 10;
  assert.equal(L.endRound(p).dead, true); assert.equal(p.over.cleared, 0); assert.equal(p.over.short, 50);
  const q = run0(); q.round = 3; q.coins = 70; q.charms = ['piggy'];
  const ev = L.endRound(q); assert.equal(ev.interest, 7); assert.equal(ev.paid, 60); assert.equal(q.coins, 17); assert.equal(q.deadline, 2);
});

test('shop: three different charms, prices rise with deadline, slots limit, sell, reroll', () => {
  const r = run0(); r.coins = 1000;
  L.rollShop(r, seq(0.1, 0.5, 0.9));
  assert.equal(new Set(r.shop).size, 3);
  const id = r.shop[0], p = L.priceOf(r, id);
  assert.ok(L.buyCharm(r, 0)); assert.equal(r.coins, 1000 - p); assert.equal(r.shop[0], null); assert.equal(L.buyCharm(r, 0), false);
  assert.equal(L.rerollCost(r), 5); assert.ok(L.reroll(r)); assert.equal(L.rerollCost(r), 10);
  assert.ok(!r.shop.includes(id), 'owned charms are not offered');
  r.deadline = 3; assert.ok(L.priceOf(r, id) > p);
  assert.equal(L.sellCharm(r, id), Math.floor(L.priceOf(r, id) / 2)); assert.equal(r.charms.length, 0);
  r.charms = ['a', 'b', 'c', 'd', 'e']; L.rollShop(r); assert.equal(L.buyCharm(r, 0), false, 'slots full');
});

test('meta: stars from cleared deadlines, permanent upgrades apply to a new run', () => {
  const save = L.defaultSave(), r = L.newRun(save);
  r.over = { cleared: 3 };
  assert.equal(L.finishRun(save, r), 6); assert.equal(save.best, 3);
  assert.ok(L.buyMeta(save, 'purse')); assert.ok(L.buyMeta(save, 'coupon')); assert.equal(L.buyMeta(save, 'arm'), false);
  save.stars = 99; L.buyMeta(save, 'arm'); L.buyMeta(save, 'pocket'); L.buyMeta(save, 'reroll');
  const n = L.newRun(save); L.startRound(n);
  assert.equal(n.coins, 15); assert.equal(n.spinsLeft, 6); assert.equal(n.slots, 6); assert.equal(L.rerollCost(n), 0);
  assert.equal(L.priceOf(n, 'candy'), 18);
});

// 균형: 부적 없이는 첫 기한을 대체로 넘기고, 그 뒤로는 부적 없이는 버티기 어렵다
test('balance: base income vs debt', () => {
  let sum = 0; const N = 4000;
  for (let i = 0; i < N; i++) { const r = run0(); r.spinsLeft = 1; sum += L.spin(r).total; }
  const perSpin = sum / N, perDeadline = perSpin * 15;
  assert.ok(perDeadline > L.debtFor(1) * 1.2 && perDeadline < L.debtFor(1) * 2.6, `per deadline ${perDeadline.toFixed(0)} vs debt ${L.debtFor(1)}`);
  assert.ok(perDeadline < L.debtFor(3), 'deadline 3 needs charms');
});
