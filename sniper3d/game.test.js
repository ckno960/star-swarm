import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const CITY = L.cityLayout(3);

test('ballistics: zeroed at 250m, drops more with distance, wind drift grows', () => {
  assert.ok(Math.abs(L.dropM(L.ZERO)) < 1e-9);
  assert.ok(L.dropM(160) < 0, 'slightly high when nearer than zero');
  assert.ok(L.dropM(310) > 0.1 && L.dropM(310) < 0.6, `${L.dropM(310)}`);
  assert.ok(L.dropM(600) > L.dropM(310) * 3);
  assert.equal(L.driftM(500, 0), 0);
  assert.ok(L.driftM(600, 5) > L.driftM(200, 5) * 4);
  assert.ok(L.driftM(500, -4) < 0);
  assert.ok(Math.abs(L.mil(1, 1000) - 1) < 1e-12);
});

test('breath: holding steadies the scope for a few seconds, then exhaustion', () => {
  const b = L.newBreath(), mag = (s) => Math.abs(s.yaw) + Math.abs(s.pitch);
  const calm = mag(L.sway(1.3, b));
  L.breathStep(b, 0.1, true);
  assert.equal(b.holding, true);
  assert.ok(mag(L.sway(1.3, b)) < calm * 0.2);
  for (let i = 0; i < 40; i++) L.breathStep(b, 0.1, true);
  assert.equal(b.holding, false); assert.ok(b.exhaust > 0);
  for (let i = 0; i < 100; i++) L.breathStep(b, 0.1, false);
  assert.equal(b.exhaust, 0); assert.ok(b.stamina > 0.9);
});

test('city: street, park, office windows, far skyline at increasing distance', () => {
  for (const b of CITY.mid) {
    assert.ok(b.wins.length > 20);
    for (const w of b.wins) { assert.ok(w.x0 >= b.x - b.w / 2 && w.x1 <= b.x + b.w / 2); assert.ok(w.y1 < b.h); }
    assert.ok(b.z < L.PARK.z1);
  }
  assert.ok(CITY.far.every((f) => f.z < -470));
  const d = (z, y = 0) => L.dist({ x: 0, y, z });
  assert.ok(d(L.STREET.near0) > 150 && d(L.STREET.far1) < 186);
  assert.ok(d(-300, 10) > 295 && d(-300, 10) < 320);
});

test('stages: target is unique by the briefing traits, zones at the right distance', () => {
  for (let n = 1; n <= 20; n++) {
    const st = L.buildStage(n, CITY);
    const keys = st.cfg.keys, t = st.target.traits;
    assert.equal(st.people.filter((p) => keys.every((k) => p.traits[k] === t[k])).length, 1, `stage ${n}`);
    assert.ok(!keys.includes('hat') || t.hat !== 'none');
    const d = L.dist(st.target), z = st.target.zone;
    if (z === 'street') assert.ok(d > 150 && d < 200, `${d}`);
    if (z === 'window') assert.ok(d > 290 && d < 330, `${d}`);
    if (z === 'roof') assert.ok(d > 470 && d < 700, `${d}`);
  }
  assert.equal(L.stageConfig(1).guide, true);
  assert.ok(L.stageConfig(L.STAGE_COUNT).crowd > L.stageConfig(1).crowd);
});

test('shots: target, civilian, misses and running out of ammo', () => {
  const st = L.buildStage(1, CITY);
  const res = L.resolveShot(st, { person: st.target, head: true });
  assert.equal(res.kind, 'target'); assert.equal(st.over.win, true); assert.equal(L.stars(st.over), 3);
  const st2 = L.buildStage(4, CITY);
  assert.equal(L.resolveShot(st2, { person: st2.people[1], head: false }).kind, 'civilian');
  assert.equal(st2.over.why, 'civilian');
  const st3 = L.buildStage(3, CITY);
  assert.equal(L.resolveShot(st3, null).kind, 'miss'); assert.equal(st3.panic, true); assert.equal(st3.over, null);
  L.resolveShot(st3, null); L.resolveShot(st3, null);
  assert.equal(st3.over.why, 'ammo');
});

test('panic: street target runs off and escapes; window target hides and reappears', () => {
  const st = L.buildStage(3, CITY);
  L.startPanic(st);
  for (let i = 0; i < 1200 && !st.over; i++) { L.stepPeople(st, CITY, 0.1); L.checkOver(st, 0.1); }
  assert.equal(st.over.why, 'escaped');
  const sw = L.buildStage(2, CITY);
  L.startPanic(sw);
  assert.equal(sw.target.state, 'hidden');
  for (let i = 0; i < 30; i++) L.stepPeople(sw, CITY, 0.1);
  assert.equal(sw.target.state, 'idle');
  assert.ok(Math.abs(sw.target.y / L.FLOOR_H - Math.round(sw.target.y / L.FLOOR_H)) < 1e-9, "stands on a floor");
});

test('time limit, stars and save', () => {
  const st = L.buildStage(9, CITY);
  for (let i = 0; i < 420 && !st.over; i++) L.checkOver(st, 0.1);
  assert.equal(st.over.why, 'time');
  assert.equal(L.stars({ win: true, head: false, shotsUsed: 2 }), 1);
  const store = new Map(), io = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(io); s.stars[1] = 2; L.storeSave(io, s);
  assert.equal(L.loadSave(io).stars[1], 2);
  assert.equal(L.unlocked(s, 2), true); assert.equal(L.unlocked(s, 3), false);
});
