import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

test('distance follows a gravitational free fall and ends at surface contact', () => {
  assert.equal(Math.round(L.distanceKm(0)), L.START_KM - L.EARTH.radiusKm - L.BODY_DATA.pluto.radiusKm);
  assert.equal(L.distanceKm(1), 0);
  let prev = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.01) { const d = L.distanceKm(Math.min(1, p)); assert.ok(d <= prev, `p=${p}`); prev = d; }
  // 처음엔 느리고 끝에서 빠르다: 앞 절반 동안 움직인 거리 < 뒤 10% 동안 움직인 거리
  const early = L.distanceKm(0) - L.distanceKm(0.5), late = L.distanceKm(0.9) - L.distanceKm(1);
  assert.ok(early < late, `${early} vs ${late}`);
  // 자유 낙하 시간 비율: 시작 0, 중심까지 1
  assert.equal(L.fallTimeFraction(1), 0);
  assert.ok(Math.abs(L.fallTimeFraction(0) - 1) < 1e-12);
});

test('approach speed from gravity: v = sqrt(2GM(1/D - 1/D0))', () => {
  assert.equal(L.speedKms(0), 0);
  let prev = -1;
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) { const v = L.speedKms(p); assert.ok(v > prev); prev = v; }
  // 맞닿을 때 속도는 목성의 탈출 속도(59.5km/s)보다 조금 느리다
  const vEnd = L.speedKms(1);
  assert.ok(vEnd > 45 && vEnd < 59.5, `${vEnd}`);
  const D = L.centerDistanceKm(1) * 1000, D0 = L.START_KM * 1000, M = L.EARTH.massKg + L.BODY_DATA.jupiter.massKg;
  assert.ok(Math.abs(vEnd - Math.sqrt(2 * L.G * M * (1 / D - 1 / D0)) / 1000) < 1e-9);
});

test('apparent size from real radius and distance: theta = asin(R/D)', () => {
  const f = L.focalPx(390);
  assert.ok(Math.abs(f - 195 / Math.tan(Math.PI / 6)) < 1e-9);
  // 처음엔 점(달보다 작게), 충돌 직전엔 보름달의 200배가 넘고 화면보다 크다
  assert.ok(L.moonTimes(0) < 1);
  assert.ok(L.screenRadius(0, f) < 2);
  assert.ok(L.moonTimes(0.999) > 200);
  assert.ok(L.screenRadius(0.995, f) > 390);
  const p = 0.9, R = L.bodyAt(p).radiusKm, D = L.centerDistanceKm(p);
  assert.ok(Math.abs(L.screenRadius(p, f) - f * Math.tan(Math.asin(R / D))) < 1e-9);
});

test('planet grows through real bodies with real radius and mass', () => {
  assert.equal(L.bodyAt(0).radiusKm, L.BODY_DATA.pluto.radiusKm);
  assert.equal(L.bodyAt(1).massKg, L.BODY_DATA.jupiter.massKg);
  let prev = 0;
  for (let p = 0; p <= 1; p += 0.02) { const r = L.bodyAt(p).radiusKm; assert.ok(r >= prev - 1e-6, `p=${p}`); prev = r; }
  assert.match(L.massText(0), /%$/);
  assert.match(L.massText(1), /318배$/);
});

test('news broadcasts at distance milestones quote computed numbers', () => {
  assert.ok(L.BROADCASTS.length >= 10);
  for (let i = 1; i < L.BROADCASTS.length; i++) assert.ok(L.BROADCASTS[i] < L.BROADCASTS[i - 1]);
  const b = L.broadcastFor(120000, 0.855);
  assert.match(b.head, /120,000km/);
  assert.ok(b.lines.some((l) => /km\/s/.test(l)));
  assert.equal(L.formatSpeed(0.25), '250m/s');
  assert.equal(L.formatSpeed(12.345), '12.3km/s');
});

test('sending trash adds mass and money; tap power doubles', () => {
  const s = L.defaultSave();
  L.addTrash(s, L.tapPower(s));
  assert.equal(s.mass, 1);
  assert.equal(s.money, 1);
  s.money = 100;
  assert.equal(L.buyTap(s), true);
  assert.equal(L.tapPower(s), 2);
  assert.equal(s.money, 50);
  assert.equal(L.buyTap(s), false);
});

test('launchers: cost grows 15% each, milestones double output', () => {
  const s = L.defaultSave();
  assert.equal(L.launcherCost(0, 0), 15);
  assert.equal(L.launcherCost(0, 1), Math.ceil(15 * 1.15));
  s.money = 1000;
  assert.equal(L.buyLauncher(s, 0), true);
  assert.equal(s.money, 985);
  assert.ok(Math.abs(L.totalRate(s) - 0.15) < 1e-9);
  s.owned[0] = 25;
  assert.ok(Math.abs(L.launcherRate(s, 0) - 0.15 * 25 * 2) < 1e-9);
  s.owned[0] = 24;
  assert.ok(L.nextGain(s, 0) > 0.15 * 20, 'buying the 25th doubles everything');
});

test('next launcher is revealed once you can nearly afford it', () => {
  const s = L.defaultSave();
  assert.equal(L.visibleLaunchers(s), 1);
  s.owned[0] = 1;
  assert.equal(L.visibleLaunchers(s), 1);
  s.money = 60;
  assert.equal(L.visibleLaunchers(s), 2);
  s.money = 0;
  assert.equal(L.visibleLaunchers(s), 2, 'stays revealed');
});

test('pacing: an active player destroys Earth in roughly 40-70 minutes', () => {
  const s = L.defaultSave();
  let t = 0;
  while (s.mass < L.END_MASS && t < 3 * 3600) {
    L.addTrash(s, L.totalRate(s) + 3 * L.tapPower(s));   // 초당 3번 누름
    t++;
    for (;;) {
      const rate = L.totalRate(s) + 3 * L.tapPower(s);
      let best = -1, bv = Infinity;
      for (let i = 0; i < L.LAUNCHERS.length; i++) {
        const c = L.launcherCost(i, s.owned[i]);
        const v = c / L.nextGain(s, i) + Math.max(0, c - s.money) / rate;
        if (v < bv) { bv = v; best = i; }
      }
      const tc = L.tapCost(s.tapLv);
      if (tc / (3 * L.tapPower(s)) < bv && L.buyTap(s)) continue;
      if (!L.buyLauncher(s, best)) break;
    }
  }
  assert.ok(t > 40 * 60 && t < 70 * 60, `${(t / 60).toFixed(1)} min`);
});

test('offline progress pays the current rate, capped at 8 hours', () => {
  const s = L.defaultSave();
  s.owned[1] = 10;
  const r = L.offlineProgress(s, 100);
  assert.equal(r.tons, 1000);
  assert.equal(s.money, 1000);
  assert.equal(L.offlineProgress(L.defaultSave(), 1e9).seconds, L.OFFLINE_CAP);
  const big = L.defaultSave();
  big.owned[9] = 1000;
  L.offlineProgress(big, 3600);
  assert.equal(big.mass, L.END_MASS, 'never overshoots the collision');
});

test('prestige: new Earth, everything doubled forever', () => {
  const s = L.defaultSave();
  s.mass = L.END_MASS; s.money = 5e9; s.owned[3] = 9; s.time = 3000;
  L.prestige(s);
  assert.equal(s.earths, 1);
  assert.equal(s.mass, 0);
  assert.equal(s.owned[3], 0);
  assert.equal(s.best, 3000);
  assert.equal(L.tapPower(s), 2);
  s.owned[0] = 1;
  assert.ok(Math.abs(L.totalRate(s) - 0.3) < 1e-9);
});

test('news follows progress', () => {
  assert.match(L.currentNews(0), /쓰레기/);

  assert.match(L.currentNews(0.99), /안녕/);
});

test('formatting and save round-trip', () => {
  assert.equal(L.formatNumber(12345), '1.2만');
  assert.equal(L.formatNumber(1e11), '1,000억');
  assert.equal(L.formatRate(0.15), '0.1');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(storage);
  s.owned[2] = 4; s.mass = 123;
  L.storeSave(storage, s);
  const t = L.loadSave(storage);
  assert.equal(t.owned[2], 4);
  assert.equal(t.mass, 123);
  assert.deepEqual(L.loadSave({ getItem() { throw new Error('x'); } }), L.defaultSave());
});

test('planet turns into real planets as it grows, blending at each change', () => {
  assert.equal(L.planetStage(0).type.id, 'pluto');
  assert.equal(L.planetStage(0.2).type.id, 'moon');
  assert.equal(L.planetStage(0.55).type.id, 'mars');
  assert.equal(L.planetStage(0.85).type.id, 'saturn');
  assert.equal(L.planetStage(1).type.id, 'jupiter');
  assert.equal(L.planetStage(1).next, null);
  assert.equal(L.planetStage(0.2).blend, 0);
  const b = L.planetStage(0.53 - L.BLEND / 2);
  assert.equal(b.type.id, 'ganymede');
  assert.ok(b.blend > 0.4 && b.blend < 0.6);
  let prev = -1;
  for (const t of L.PLANET_TYPES) { assert.ok(t.from > prev); prev = t.from; }
});

test('every planet stage has a real texture map and render settings', async () => {
  const { BODIES } = await import('./globe.js');
  const fs = await import('node:fs');
  for (const t of [...L.PLANET_TYPES, { id: 'earth' }]) {
    const b = BODIES[t.id];
    assert.ok(b, `${t.id} body`);
    assert.ok(fs.existsSync(new URL(`./textures/${b.tex}.jpg`, import.meta.url)), `${t.id} texture`);
    if (b.ring && b.ring !== 'faint') assert.ok(fs.existsSync(new URL(`./textures/${b.ring}.png`, import.meta.url)), `${t.id} ring`);
  }
});
