// 스윙 시티: 거미줄 물리와 도시 배치 (화면과 분리, node --test로 검사)
// 단위는 m, y가 위. 건물은 축에 맞춘 상자 { x0, x1, z0, z1, h }.

export const GRAVITY = 26;
export const ROPE_MIN = 12, ROPE_MAX = 85;

// ---------- 줄 붙일 곳 고르기 ----------
// 앞쪽 위에 있는 옥상 모서리 중에서, 바라보는 방향과 맞고 적당히 높고 먼 곳
export function anchorCandidates(b) {
  const xs = [b.x0, (b.x0 + b.x1) / 2, b.x1], zs = [b.z0, (b.z0 + b.z1) / 2, b.z1], out = [];
  for (const x of xs) for (const z of zs) if (x !== xs[1] || z !== zs[1]) out.push({ x, y: b.h, z });
  return out;
}
export function chooseAnchor(pos, fwd, boxes) {
  const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
  let best = null, bestScore = -Infinity;
  for (const b of boxes) {
    if (b.h < pos.y + 6) continue;
    for (const c of anchorCandidates(b)) {
      const dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z, d = Math.hypot(dx, dy, dz), hd = Math.hypot(dx, dz) || 1;
      if (d < ROPE_MIN || d > ROPE_MAX || dy < 6) continue;
      const align = (dx * fx + dz * fz) / hd;
      if (align < 0.3) continue;
      const score = align * 2.2 - Math.abs(d - 38) / 30 - Math.abs(dy - 22) / 40;
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  if (best) return best;
  // 더 높은 빌딩이 없으면: 근처(100m 안)에 빌딩이 있을 때 앞쪽 위 허공에 건다(도시 안에서는 언제든 스윙)
  const near = boxes.some((b) => Math.hypot(Math.max(b.x0 - pos.x, 0, pos.x - b.x1), Math.max(b.z0 - pos.z, 0, pos.z - b.z1)) < 100);
  if (!near || pos.y > 220) return null;
  return { x: pos.x + fx * 30, y: pos.y + 26, z: pos.z + fz * 30, sky: true };
}

// ---------- 줄 ----------
// 줄은 늘어나지 않는다: 줄보다 멀어지면 구 위로 되돌리고, 바깥으로 가는 속도를 없앤다(느슨하면 자유 낙하)
export function ropeStep(p, v, a, len) {
  const dx = p.x - a.x, dy = p.y - a.y, dz = p.z - a.z, d = Math.hypot(dx, dy, dz);
  if (d <= len || d === 0) return false;
  const nx = dx / d, ny = dy / d, nz = dz / d;
  p.x = a.x + nx * len; p.y = a.y + ny * len; p.z = a.z + nz * len;
  const out = v.x * nx + v.y * ny + v.z * nz;
  if (out > 0) { v.x -= out * nx; v.y -= out * ny; v.z -= out * nz; }
  return true;
}
// 한 단계: 중력, 입력 방향으로 밀기(스윙에 힘 싣기), 공기 저항, 이동, 줄
export function swingStep(p, v, a, len, dt, push = { x: 0, z: 0 }) {
  v.y -= GRAVITY * dt;
  v.x += push.x * 9 * dt; v.z += push.z * 9 * dt;
  const drag = Math.pow(0.996, dt * 60);
  v.x *= drag; v.y *= drag; v.z *= drag;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (a) ropeStep(p, v, a, len);
}
// 줄을 놓을 때: 위로 올라가는 중이면 조금 더 띄워 준다
export function releaseBoost(v) { if (v.y > 0) v.y += 6; const s = Math.hypot(v.x, v.y, v.z); return s; }

// ---------- 도시 ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const BLOCK = 44, STREETW = 16, P = BLOCK + STREETW, N = 8, HALF = (N * P) / 2;
// 블록을 1~4개 건물로 나누고, 몇 블록은 공원. 가운데로 갈수록 높다
export function cityLayout(seed = 7) {
  const r = rng(seed), boxes = [], parks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = -HALF + STREETW / 2 + i * P + BLOCK / 2, cz = -HALF + STREETW / 2 + j * P + BLOCK / 2;
    const center = 1 - Math.hypot(i - (N - 1) / 2, j - (N - 1) / 2) / (N * 0.7);
    if (r() < 0.1 && center < 0.7) { parks.push({ x: cx, z: cz }); continue; }
    const s = r(), H = BLOCK / 2, m = 2;
    const rects = s < 0.3 ? [[-H, H, -H, H]] : s < 0.65 ? [[-H, -1, -H, H], [1, H, -H, H]] : [[-H, -1, -H, -1], [1, H, -H, -1], [-H, -1, 1, H], [1, H, 1, H]];
    for (const [a, b, c, d] of rects) {
      const h = Math.round((25 + r() * 50 + center * 90 * r()) / 4) * 4;
      boxes.push({ x0: cx + a + m, x1: cx + b - m, z0: cz + c + m, z1: cz + d - m, h, color: Math.floor(r() * 8) });
    }
  }
  return { boxes, parks };
}
// 빛나는 조각: 옥상 위, 빌딩 사이 공중, 길 위
export function placeShards(C, n = 60, seed = 3) {
  const r = rng(seed), out = [];
  while (out.length < n) {
    const k = r();
    if (k < 0.45) { const b = C.boxes[Math.floor(r() * C.boxes.length)]; out.push({ x: (b.x0 + b.x1) / 2 + (r() - 0.5) * (b.x1 - b.x0) * 0.6, y: b.h + 2, z: (b.z0 + b.z1) / 2 + (r() - 0.5) * (b.z1 - b.z0) * 0.6 }); }
    else {
      const vertical = r() < 0.5, line = -HALF + Math.floor(r() * (N + 1)) * P, t = (r() * 2 - 1) * HALF * 0.9;
      out.push({ x: vertical ? line : t, y: k < 0.8 ? 18 + r() * 40 : 2, z: vertical ? t : line });
    }
  }
  return out.map((s, i) => ({ ...s, id: i }));
}
export const insideBox = (b, x, z, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

// ---------- 저장 ----------
export const SAVE_KEY = 'swing.save';
export const defaultSave = () => ({ got: [], best: 0, distance: 0, sound: true, vibrate: true, seenIntro: false });
export function loadSave(storage) { try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) return { ...defaultSave(), ...d, got: Array.isArray(d.got) ? d.got : [] }; } catch { /* 새로 */ } return defaultSave(); }
export function storeSave(storage, s) { try { storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
