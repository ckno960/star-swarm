import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

function rng(seed) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 성실한 플레이어(먹이고, 고치고, 좀비를 치고, 개조함) 또는 아무것도 안 하는 플레이어
function play(seed, careful, routes) {
  const r = rng(seed), s = L.defaultSave(), done = [];
  for (let t = 0; t < 3 * 3600; t++) {
    if (s.station) L.resolveStation(s, careful ? (s.health > 70 ? 'deep' : 'quick') : 'leave', r);
    if (s.arrived) { done.push(t); if (s.route >= routes) break; L.nextRoute(s); }
    if (s.dead) return { s, done, deadAt: t };
    for (let k = 0; k < 10; k++) { L.step(s, 0.1, r); if (careful && s.zombie && s.zombie.t > L.ZOMBIE_APPROACH && k % 3 === 0) L.hitZombie(s, r); }
    if (careful) {
      if (s.hunger < 50) L.feed(s);
      if (s.health < 50) L.heal(s);
      if (s.barricade < L.barricadeMax(s) * 0.5) L.repair(s);
      if (s.fuel < 1) L.forage(s, r);
      for (const u of L.UPGRADES) if (L.upgradeCost(s, u.id) <= s.scrap - 2) L.buyUpgrade(s, u.id);
    }
  }
  return { s, done };
}

test('clock: 1 real second = 5 game minutes, nights and horde nights', () => {
  const s = L.defaultSave();
  assert.equal(L.clock(s), '08:00');
  L.step(s, 12);   // 1시간
  assert.equal(L.clock(s), '09:00');
  assert.equal(L.isNight(21), true); assert.equal(L.isNight(12), false);
  assert.equal(L.daylight(12), 1); assert.equal(L.daylight(0), 0);
  s.minutes = 3 * 1440 + 22 * 60;
  assert.equal(L.dayOf(s), 4); assert.equal(L.hordeNight(s), true);
});

test('survival needs: hunger falls, stove keeps warm, starving and cold hurt', () => {
  const s = L.defaultSave();
  L.survive(s, 10);
  assert.ok(s.hunger < 30 && s.warmth > 60 && s.health === 100);
  const cold = { ...L.defaultSave(), stoveOn: false, minutes: 22 * 60, hunger: 0, warmth: 10 };
  L.survive(cold, 5);
  assert.ok(cold.health < 60, `${cold.health}`);
  assert.ok(L.feed(cold)); assert.equal(cold.hunger, 30);
});

test('fuel: engine and stove share it; empty fuel stops the train', () => {
  const s = { ...L.defaultSave(), fuel: 0.5 };
  for (let i = 0; i < 360; i++) L.step(s, 0.1, () => 1);
  assert.equal(s.fuel, 0);
  const km = s.km;
  L.step(s, 12, () => 1);
  assert.equal(s.km, km);
  const f = L.forage(s, () => 0.99);
  assert.ok(f.fuel >= 2 && f.hurt === 0);
});

test('zombies: break the window, then hurt; hits and wire kill them', () => {
  const s = L.defaultSave();
  L.spawnZombie(s);
  for (let i = 0; i < 400 && s.barricade > 0; i++) L.step(s, 0.1, () => 1);
  assert.equal(s.barricade, 0);
  const hp = s.health;
  L.step(s, 1, () => 1);
  assert.ok(s.health < hp);
  s.up.weapon = 4;
  let r; while (s.zombie) r = L.hitZombie(s, () => 0);
  assert.equal(r.killed, true); assert.equal(r.scrap, 1);
  const w = { ...L.defaultSave(), up: { ...L.defaultSave().up, wire: 4 } };
  L.spawnZombie(w);
  for (let i = 0; i < 300 && w.zombie; i++) L.step(w, 0.1, () => 1);
  assert.equal(w.zombie, null);
  assert.ok(w.barricade > 0);
});

test('stations: every 50 km, the game pauses for a choice, searching pays with risk', () => {
  const s = L.defaultSave();
  for (let i = 0; i < 4000 && !s.station; i++) L.step(s, 0.1, () => 0.5);
  assert.ok(s.station && s.km >= 50 && s.km < 51);
  const m = s.minutes;
  L.step(s, 5);
  assert.equal(s.minutes, m, 'paused at the station');
  const before = s.food + s.fuel + s.scrap;
  const res = L.resolveStation(s, 'deep', () => 0.99);
  assert.equal(res.hurt, 0);
  assert.ok(s.food + s.fuel + s.scrap > before);
  assert.equal(s.station, null);
  assert.ok(L.searchRisk(s, 'deep') > L.searchRisk(s, 'quick'));
});

test('pacing: a careful player clears route 1 in a few minutes and later routes take longer', () => {
  for (const seed of [1, 2, 3]) {
    const { done, deadAt } = play(seed, true, 3);
    assert.equal(deadAt, undefined, `seed ${seed} died`);
    assert.ok(done[0] > 180 && done[0] < 420, `route 1 ${done[0]}s`);
    assert.ok(done[2] - done[1] > done[0], 'route 3 longer than route 1');
  }
});

test('an idle player does not survive route 1', () => {
  for (const seed of [1, 2, 3]) assert.ok(play(seed, false, 1).deadAt !== undefined, `seed ${seed}`);
});

test('upgrades, next route and restart keep upgrades', () => {
  const s = L.defaultSave();
  s.scrap = 100;
  assert.ok(L.buyUpgrade(s, 'weapon'));
  assert.equal(L.weaponDmg(s), 2);
  assert.ok(L.buyUpgrade(s, 'plate'));
  assert.equal(L.barricadeMax(s), 65);
  s.up.radio = 1;
  assert.equal(L.buyUpgrade(s, 'radio'), false, 'max level');
  s.arrived = true; s.km = 400;
  L.nextRoute(s);
  assert.equal(s.route, 2); assert.equal(s.km, 0); assert.equal(L.routeConfig(2).from, '대전');
  assert.ok(L.routeConfig(2).length > L.routeConfig(1).length);
  s.runDays = 7; s.dead = 'cold';
  L.restart(s);
  assert.equal(s.dead, null); assert.equal(s.route, 2); assert.equal(s.up.weapon, 1); assert.equal(s.best.days, 7); assert.equal(s.food, 4);
});

test('save round-trip', () => {
  const store = new Map();
  const st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(st);
  s.up.engine = 2; s.km = 123; s.food = 7;
  L.storeSave(st, s);
  const t = L.loadSave(st);
  assert.equal(t.up.engine, 2); assert.equal(t.km, 123); assert.equal(t.food, 7); assert.equal(t.up.medkit, 0);
});
