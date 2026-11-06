import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const LAY = L.layout(360, 720, 3);

test('ballistics: zeroed at 250m, drops more with distance, wind drift grows', () => {
  assert.ok(Math.abs(L.dropM(L.ZERO)) < 1e-9);
  assert.ok(L.dropM(150) < 0, 'slightly high when nearer than zero');
  assert.ok(L.dropM(430) > 0.4 && L.dropM(430) < 1.2, `${L.dropM(430)}`);
  assert.ok(L.dropM(750) > L.dropM(430) * 2.5);
  assert.equal(L.driftM(500, 0), 0);
  assert.ok(L.driftM(750, 5) > L.driftM(300, 5) * 3);
  assert.ok(L.driftM(500, -4) < 0);
  // 175cm 사람은 200m에서 약 22픽셀
  assert.equal(L.personH(200), 22);
  assert.ok(Math.abs(L.mil(1, 1000) - 1) < 1e-12);
});

test('breath: holding steadies the scope for a few seconds, then exhaustion', () => {
  const b = L.newBreath();
  const calm = Math.abs(L.sway(1.3, b).x) + Math.abs(L.sway(1.3, b).y);
  L.breathStep(b, 0.1, true);
  assert.equal(b.holding, true);
  const held = Math.abs(L.sway(1.3, b).x) + Math.abs(L.sway(1.3, b).y);
  assert.ok(held < calm * 0.2);
  for (let i = 0; i < 40; i++) L.breathStep(b, 0.1, true);
  assert.equal(b.holding, false); assert.ok(b.exhaust > 0);
  for (let i = 0; i < 100; i++) L.breathStep(b, 0.1, false);
  assert.equal(b.exhaust, 0); assert.ok(b.stamina > 0.9);
});

test('layout: depths by band, windows inside buildings', () => {
  assert.ok(L.streetDepth(LAY, LAY.midBase) === 235 && L.streetDepth(LAY, LAY.AH) === 150);
  for (const b of LAY.mid) for (const w of b.wins) { assert.ok(w.x >= b.x && w.x + w.w <= b.x + b.w); assert.ok(w.y + w.h < LAY.midBase); }
  assert.equal(L.depthAt(LAY, 180, LAY.AH - 5) < 160, true);
  assert.equal(L.depthAt(LAY, 5, 5), Infinity);
});

test('stages: target is unique by the briefing traits, distances per zone', () => {
  for (let n = 1; n <= 20; n++) {
    const st = L.buildStage(n, LAY);
    const keys = st.cfg.keys, t = st.target.traits;
    const same = st.people.filter((p) => keys.every((k) => p.traits[k] === t[k]));
    assert.equal(same.length, 1, `stage ${n}`);
    assert.ok(st.desc.length > 0);
    const z = st.target.zone;
    if (z === 'street') assert.ok(st.target.d >= 150 && st.target.d <= 235);
    if (z === 'window') assert.ok(st.target.d >= 380 && st.target.d <= 460);
    if (z === 'roof') assert.ok(st.target.d >= 640);
  }
  assert.equal(L.stageConfig(1).guide, true);
  assert.ok(L.stageConfig(STAGE()).crowd >= L.stageConfig(1).crowd);
});
const STAGE = () => L.STAGE_COUNT;

test('shooting: aim solution lands on a standing target, civilian and miss outcomes', () => {
  const st = L.buildStage(1, LAY), p = st.target;
  st.people = [p];
  // 몸통 가운데를 겨누되 낙차·편류만큼 반대로 보정
  const off = L.impactOffset(p.d, st.cfg.wind), ax = p.x - off.dx, ay = p.y - p.h * 0.5 - off.dy;
  const sol = L.aimSolution(st, LAY, ax, ay);
  const res = L.resolveShot(st, LAY, sol.x, sol.y);
  assert.equal(res.kind, 'target'); assert.equal(st.over.win, true); assert.ok(L.stars(st.over) >= 2);
  const st2 = L.buildStage(4, LAY), c = st2.people.find((q) => !q.target && q.zone === 'street');
  st2.people = [st2.target, c].filter(Boolean);
  if (c) { const r2 = L.resolveShot(st2, LAY, c.x, c.y - c.h * 0.5); assert.equal(r2.kind, 'civilian'); assert.equal(st2.over.why, 'civilian'); }
  const st3 = L.buildStage(3, LAY);
  const r3 = L.resolveShot(st3, LAY, 2, 2);
  assert.equal(r3.kind, 'miss'); assert.equal(st3.panic, true); assert.equal(st3.shots, 2); assert.equal(st3.over, null);
  L.resolveShot(st3, LAY, 2, 2); L.resolveShot(st3, LAY, 2, 2);
  assert.equal(st3.over.why, 'ammo');
});

test('panic: street target runs off and escapes; window target hides and reappears', () => {
  const st = L.buildStage(3, LAY);
  st.target.zone = 'street';
  L.startPanic(st);
  for (let i = 0; i < 600 && !st.over; i++) { L.stepPeople(st, LAY, 0.1); L.checkOver(st, 0.1); }
  assert.equal(st.over.why, 'escaped');
  const sw = L.buildStage(2, LAY);
  L.startPanic(sw);
  assert.equal(sw.target.state, 'hidden');
  for (let i = 0; i < 30; i++) L.stepPeople(sw, LAY, 0.1);
  assert.equal(sw.target.state, 'idle');
});

test('time limit, stars and save', () => {
  const st = L.buildStage(9, LAY);
  for (let i = 0; i < 320 && !st.over; i++) L.checkOver(st, 0.1);
  assert.equal(st.over.why, 'time');
  assert.equal(L.stars({ win: true, head: true, shotsUsed: 1 }), 3);
  assert.equal(L.stars({ win: true, head: false, shotsUsed: 2 }), 1);
  const store = new Map(), io = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(io); s.stars[1] = 2; L.storeSave(io, s);
  assert.equal(L.loadSave(io).stars[1], 2);
  assert.equal(L.unlocked(s, 2), true); assert.equal(L.unlocked(s, 3), false);
});
