import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const S1 = L.stageConfig(1), S6 = L.stageConfig(6);

test('stages: early ones end at small bodies, later ones at giants, targets grow', () => {
  assert.equal(S1.endId, 'moon');
  assert.equal(L.stageConfig(2).endId, 'mars');
  assert.equal(S6.endId, 'jupiter');
  assert.equal(L.stageConfig(9).endId, 'jupiter');
  let prev = 0;
  for (let s = 1; s <= 9; s++) { const c = L.stageConfig(s); assert.ok(c.endMass > prev); prev = c.endMass; assert.equal(c.types.at(-1).id, c.endId); }
  assert.equal(L.planetStage(0, S6).type.id, 'pluto');
  assert.equal(L.planetStage(1, S6).type.id, 'jupiter');
  assert.equal(L.planetStage(1, S1).type.id, 'moon');
});

test('pacing: stage 1 is quick, later stages take longer', () => {
  const times = [];
  for (let st = 1; st <= 5; st++) {
    const s = { ...L.defaultSave(), stage: st };
    const end = L.stageConfig(st).endMass;
    let t = 0;
    while (s.mass < end && t < 3 * 3600) {
      L.addLaunch(s, L.totalRate(s) + 3 * L.tapPower(s));
      t++;
      for (;;) {
        const rate = L.totalRate(s) + 3 * L.tapPower(s);
        let best = -1, bv = Infinity;
        for (let i = 0; i < L.LAUNCHERS.length; i++) { const c = L.launcherCost(i, s.owned[i]); const v = c / L.nextGain(s, i) + Math.max(0, c - s.money) / rate; if (v < bv) { bv = v; best = i; } }
        if (L.tapCost(s.tapLv) / (3 * L.tapPower(s)) < bv && L.buyTap(s)) continue;
        if (!L.buyLauncher(s, best)) break;
      }
    }
    times.push(t);
  }
  assert.ok(times[0] > 90 && times[0] < 6 * 60, `stage 1 ${times[0]}s`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], `stage ${i + 1} ${times[i]}s > ${times[i - 1]}s`);
});

test('free fall: slow start, fast end, surface contact at the end', () => {
  for (const cfg of [S1, S6]) {
    assert.equal(L.distanceKm(1, cfg), 0);
    let prev = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.02) { const d = L.distanceKm(Math.min(1, p), cfg); assert.ok(d <= prev + 1e-6); prev = d; }
    assert.ok(L.distanceKm(0, cfg) - L.distanceKm(0.5, cfg) < L.distanceKm(0.9, cfg) - L.distanceKm(1, cfg));
  }
  assert.equal(L.fallTimeFraction(1), 0);
});

test('approach speed from gravity', () => {
  assert.equal(L.speedKms(0, S6), 0);
  const vEnd = L.speedKms(1, S6);
  assert.ok(vEnd > 45 && vEnd < 59.5, `${vEnd}`);
  const vMoon = L.speedKms(1, S1);
  assert.ok(vMoon > 8 && vMoon < 11.2, `moon impact ${vMoon}`);   // 지구 탈출 속도 11.2km/s보다 조금 느림
});

test('apparent size from real radius and distance', () => {
  const f = L.focalPx(390);
  assert.ok(L.moonTimes(0, S6) < 1);
  assert.ok(L.moonTimes(0.999, S6) > 200);
  const p = 0.9, R = L.bodyAt(p, S6).radiusKm, D = L.centerDistanceKm(p, S6);
  assert.ok(Math.abs(L.screenRadius(p, f, S6) - f * Math.tan(Math.asin(R / D))) < 1e-9);
});

test('effects: tides, quakes, heat, seasons, Roche limit', () => {
  // 지금의 달이라면 조석력 1배, 평형 조석 약 0.54m
  const moonLike = { massKg: L.MOON.massKg };
  const h = 1.5 * (moonLike.massKg / L.EARTH.massKg) * L.EARTH.radiusKm ** 4 / L.MOON.distKm ** 3 * 1000;
  assert.ok(h > 0.5 && h < 0.6, `${h}`);
  const a = L.effects(0.1, S6), b = L.effects(0.95, S6);
  assert.ok(b.tideRatio > a.tideRatio * 100);
  assert.ok(b.tideM > a.tideM && b.quake > a.quake && b.tempRise > a.tempRise && b.seasonAmp > a.seasonAmp);
  assert.ok(L.effects(1, S6).insideRoche, 'Earth inside Jupiter-class Roche limit at contact');
  assert.equal(L.effects(1, S6).earthTorn, true);
  assert.equal(L.effects(0.99, S1).earthTorn, false, 'a Moon-class body is torn by Earth instead');
});

test('calendar: one day per second, seasons and temperature', () => {
  const s = { ...L.defaultSave(), startDay: Math.floor(Date.UTC(2026, 0, 1) / 86400000), days: 0 };
  assert.equal(L.calendar(s).m, 1);
  s.days = 31 + 28 + 15;   // 3월 16일
  const c = L.calendar(s);
  assert.equal(c.m, 3); assert.equal(c.d, 16);
  assert.equal(L.seasonName(L.seasonWeights(L.seasonDay(c.doy, 0, 1))), '봄');
  assert.equal(L.seasonName(L.seasonWeights(200)), '여름');
  assert.equal(L.seasonName(L.seasonWeights(290)), '가을');
  assert.equal(L.seasonName(L.seasonWeights(10)), '겨울');
  const w = L.seasonWeights(151);
  assert.ok(Math.abs(w.spring + w.summer - 1) < 1e-9 && w.spring > 0 && w.summer > 0, 'blends at the boundary');
  // 열관성: 평형 기온으로 바로 뛰지 않고 약 240일에 걸쳐 따라간다
  assert.equal(L.relaxWarming(0, 10, 0), 0);
  assert.ok(Math.abs(L.relaxWarming(0, 10, L.THERMAL_DAYS) - 10 * (1 - Math.exp(-1))) < 1e-9);
  assert.ok(L.relaxWarming(0, 10, 5000) > 9.99);
  const calm = L.effects(0, S6);
  assert.ok(L.temperatureC(15, calm) < 0 && L.temperatureC(196, calm) > 25);
});

test('news: distance and effect broadcasts with causes, never repeated', () => {
  const n1 = L.pendingNews(0.1, S6, []);
  assert.ok(n1.some((n) => n.id === 'd375000'));
  const late = L.pendingNews(0.97, S6, []);
  for (const id of ['tide10', 'quake75', 'temp5', 'season15']) assert.ok(late.some((n) => n.id === id), id);
  assert.ok(late.find((n) => n.id === 'tide10').lines.some((l) => /조석력/.test(l)), 'explains the cause');
  assert.deepEqual(L.pendingNews(0.97, S6, late.map((n) => n.id)), []);
  assert.match(L.tickerText(0.97, S6), /조석력/);
});

test('economy, offline days, next stage keeps calendar', () => {
  const s = L.defaultSave();
  L.addLaunch(s, 5);
  assert.equal(s.mass, 5); assert.equal(s.money, 5);
  s.money = 100;
  assert.equal(L.buyTap(s), true);
  assert.equal(L.tapPower(s), 2);
  s.owned[1] = 10;
  const r = L.offlineProgress(s, 100);
  assert.equal(r.tons, 1000); assert.equal(s.days, 100);
  s.mass = S1.endMass; s.days = 300;
  L.nextStage(s);
  assert.equal(s.stage, 2); assert.equal(s.mass, 0); assert.equal(s.days, 300); assert.equal(s.owned[1], 0);
  assert.equal(L.tapPower(s), 1.25);
  assert.equal(L.offlineProgress(L.defaultSave(), 1e9).seconds, L.OFFLINE_CAP);
});

test('save round-trip; old trash save starts fresh', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(storage);
  s.owned[2] = 4; s.mass = 123; s.stage = 3;
  L.storeSave(storage, s);
  const t = L.loadSave(storage);
  assert.equal(t.owned[2], 4); assert.equal(t.mass, 123); assert.equal(t.stage, 3);
  store.set(L.SAVE_KEY, JSON.stringify({ mass: 5e9, earths: 2, sound: false }));
  const old = L.loadSave(storage);
  assert.equal(old.stage, 1); assert.equal(old.mass, 0); assert.equal(old.sound, false);
});

test('every planet has a real texture map', async () => {
  const { BODIES } = await import('./globe.js');
  const fs = await import('node:fs');
  for (const t of [...L.BASE_TYPES, { id: 'earth' }]) {
    const b = BODIES[t.id];
    assert.ok(b, t.id);
    assert.ok(fs.existsSync(new URL(`./textures/${b.tex}.jpg`, import.meta.url)), t.id);
  }
});
