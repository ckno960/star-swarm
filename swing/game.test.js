import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const C = L.cityLayout(7);

test('city: blocks split into buildings, taller toward the middle, a few parks', () => {
  assert.ok(C.boxes.length > 100);
  for (const b of C.boxes) { assert.ok(b.x1 > b.x0 && b.z1 > b.z0 && b.h >= 24); assert.ok(Math.abs(b.x0) <= L.HALF && Math.abs(b.z1) <= L.HALF); }
  const mid = C.boxes.filter((b) => Math.hypot((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) < 100), edge = C.boxes.filter((b) => Math.hypot((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) > 180);
  const avg = (a) => a.reduce((s, b) => s + b.h, 0) / a.length;
  assert.ok(avg(mid) > avg(edge));
});

test('anchor: picks a roof edge ahead and above, never behind or too close', () => {
  const pos = { x: -L.HALF, y: 5, z: 0 };
  const a = L.chooseAnchor(pos, { x: 1, z: 0 }, C.boxes);
  assert.ok(a, 'found');
  const d = Math.hypot(a.x - pos.x, a.y - pos.y, a.z - pos.z);
  assert.ok(d >= L.ROPE_MIN && d <= L.ROPE_MAX); assert.ok(a.x > pos.x); assert.ok(a.y - pos.y >= 6);
  assert.equal(L.chooseAnchor({ x: 0, y: 500, z: 0 }, { x: 1, z: 0 }, C.boxes), null, 'too high above the city');
  const sky = L.chooseAnchor({ x: 0, y: 190, z: 0 }, { x: 1, z: 0 }, C.boxes);
  assert.ok(sky && sky.sky && sky.x > 0 && sky.y > 190, 'sky anchor over the city');
  assert.equal(L.chooseAnchor({ x: -L.HALF - 200, y: 5, z: 0 }, { x: -1, z: 0 }, C.boxes), null, 'nothing ahead');
});

test('rope: never longer than its length, and a swing trades height for speed', () => {
  const a = { x: 0, y: 40, z: 0 }, len = 30;
  const p = { x: 30, y: 40, z: 0 }, v = { x: 0, y: 0, z: 0 };
  let maxSpeed = 0, minY = Infinity;
  for (let i = 0; i < 120; i++) {
    L.swingStep(p, v, a, len, 1 / 60);
    const d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
    assert.ok(d <= len + 1e-6);
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z)); minY = Math.min(minY, p.y);
  }
  assert.ok(minY < 12, `swings down ${minY}`);
  assert.ok(maxSpeed > 18, `picks up speed ${maxSpeed}`);
  // 느슨한 줄은 아무것도 하지 않는다
  const q = { x: 5, y: 40, z: 0 }, w = { x: 1, y: 2, z: 3 };
  assert.equal(L.ropeStep(q, w, a, len), false); assert.deepEqual(w, { x: 1, y: 2, z: 3 });
  const up = { x: 10, y: 5, z: 0 }; L.releaseBoost(up); assert.equal(up.y, 11);
});

test('shards: spread on roofs, in the air and on the street', () => {
  const s = L.placeShards(C, 60);
  assert.equal(s.length, 60);
  assert.ok(s.some((x) => x.y > 20) && s.some((x) => x.y < 5));
  for (const x of s) if (x.y < 5) assert.ok(!C.boxes.some((b) => L.insideBox(b, x.x, x.z)), 'street shards are not inside buildings');
});

test('save round-trip', () => {
  const store = new Map(), io = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = L.loadSave(io); s.got.push(3, 9); s.best = 52; L.storeSave(io, s);
  const t = L.loadSave(io); assert.deepEqual(t.got, [3, 9]); assert.equal(t.best, 52);
});
