// 실제 행성을 닮은 표면 지도(정거원통 도법)를 절차적으로 만들고, 빛을 받는 공 모양으로 그린다.

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// 가로로 이어지는 값 잡음(경도 0°와 360°가 맞물림)
function vnoise(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % period) + period) % period, xb = (xa + 1) % period;
  const a = hash2(xa, y0, seed), b = hash2(xb, y0, seed), c = hash2(xa, y0 + 1, seed), d = hash2(xb, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u, v, base, oct, seed) {
  let s = 0, amp = 0.5, f = base, norm = 0;
  for (let o = 0; o < oct; o++) { s += amp * vnoise(u * f, v * f * 0.5, f, seed + o * 17); norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 띠 색표에서 위치 x(0~n)에 맞는 색을 부드럽게
function bandColor(pal, x) {
  const n = pal.length, i = Math.floor(x), f = x - i;
  const a = pal[((i % n) + n) % n], b = pal[(((i + 1) % n) + n) % n];
  return mixc(a, b, f * f * (3 - 2 * f));
}

// 충돌구: 바닥은 어둡고 테두리는 밝다
function stampCraters(data, w, h, count, seed, maxR, strength) {
  const r = rand(seed);
  for (let k = 0; k < count; k++) {
    const cu = r(), cv = 0.12 + r() * 0.76, rad = maxR * Math.pow(r(), 2.2) + 0.002;
    const lat = (0.5 - cv) * Math.PI, sx = 1 / Math.max(0.2, Math.cos(lat));
    const rw = rad * sx * w * 0.5, rh = rad * h, cx = cu * w, cy = cv * h;
    for (let y = Math.max(0, Math.floor(cy - rh * 1.6)); y < Math.min(h, cy + rh * 1.6); y++) {
      for (let xx = Math.floor(cx - rw * 1.6); xx < cx + rw * 1.6; xx++) {
        const x = ((xx % w) + w) % w;
        const d = Math.hypot((xx - cx) / rw, (y - cy) / rh);
        if (d > 1.6) continue;
        let m = 0;
        if (d < 0.85) m = -0.22 * (1 - d * 0.4);
        else if (d < 1.05) m = 0.18;
        else m = 0.06 * (1.6 - d) / 0.55;
        const i = (y * w + x) * 3;
        for (let q = 0; q < 3; q++) data[i + q] = Math.max(0, Math.min(255, data[i + q] * (1 + m * strength)));
      }
    }
  }
}

const RECIPES = {
  moon(u, v) {
    const n = fbm(u, v, 10, 6, 1), maria = fbm(u, v, 3, 4, 50);
    const k = smooth(0.5, 0.62, maria + (n - 0.5) * 0.15);
    const g = lerp(0.66, 0.36, k) + (n - 0.5) * 0.22;
    return [g * 255, g * 250, g * 242];
  },
  mars(u, v) {
    const n = fbm(u, v, 8, 6, 3), dark = fbm(u, v, 2.5, 5, 60);
    const lat = Math.abs(0.5 - v) * 2;
    let c = mixc(hex('#c4693c'), hex('#6c3a25'), smooth(0.45, 0.66, dark));
    c = c.map((x) => x * (0.82 + 0.36 * (n - 0.5) + 0.1));
    if (Math.abs(v - 0.53) < 0.012 * (0.6 + n) && u > 0.28 && u < 0.52) c = c.map((x) => x * 0.65);   // 큰 협곡
    const cap = smooth(0.8, 0.86, lat + (n - 0.5) * 0.12);
    return mixc(c, hex('#f2efe8'), cap);
  },
  venus(u, v) {
    const warp = fbm(u, v, 3, 4, 7);
    const sw = fbm(u * 1 + warp * 0.25, v + warp * 0.1, 5, 5, 8);
    const band = 0.5 + 0.5 * Math.sin((v * 9 + (warp - 0.5) * 5 + u * 1.5) * Math.PI);
    return mixc(hex('#f1e2b8'), hex('#c49a58'), band * 0.35 + (sw - 0.3) * 0.7);
  },
  neptune(u, v) {
    const lat = (0.5 - v) * 2, warp = fbm(u, v, 4, 4, 9);
    let c = mixc(hex('#3f6fd8'), hex('#1c3486'), smooth(0.4, 1, Math.abs(lat)));
    c = c.map((x) => x * (0.94 + 0.12 * Math.sin((lat * 12 + (warp - 0.5) * 3) * Math.PI)));
    const streak = fbm(u * 1, v * 6, 6, 5, 10);
    c = mixc(c, hex('#e8f2ff'), smooth(0.66, 0.8, streak) * 0.85);
    const du = Math.min(Math.abs(u - 0.3), 1 - Math.abs(u - 0.3)) / 0.06, dv = (v - 0.62) / 0.035;
    const spot = du * du + dv * dv;
    if (spot < 1) c = mixc(c, hex('#13205a'), smooth(1, 0.3, spot) * 0.9);
    const du2 = Math.min(Math.abs(u - 0.32), 1 - Math.abs(u - 0.32)) / 0.05, dv2 = (v - 0.665) / 0.012;
    if (du2 * du2 + dv2 * dv2 < 1) c = mixc(c, hex('#ffffff'), 0.7);
    return c;
  },
  saturn(u, v) {
    const pal = ['#e9d7aa', '#d8bd86', '#cdae74', '#e7d3a2', '#bfa06a', '#f0e3bf', '#d3b47c', '#c7a56c'].map(hex);
    const warp = fbm(u, v, 6, 4, 11);
    let c = bandColor(pal, v * 30 + (warp - 0.5) * 1.2);
    c = c.map((x) => x * (0.95 + 0.1 * (fbm(u, v, 16, 3, 12) - 0.5)));
    const lat = (0.5 - v) * 2;
    if (lat > 0.72) c = mixc(c, hex('#a9b4ad'), smooth(0.72, 0.9, lat));
    return c;
  },
  jupiter(u, v) {
    const pal = ['#f3e8d2', '#c98c55', '#e9d4b2', '#a5623a', '#f5ecdb', '#b4733f', '#e2c49c', '#8c5a3a', '#efdcc0', '#c58a5a'].map(hex);
    const turb = fbm(u, v, 5, 6, 13);
    const edge = Math.abs(Math.sin(v * 22 * Math.PI));
    const x = v * 22 + (turb - 0.5) * (1.2 + 2.2 * (1 - edge)) + (fbm(u * 2, v * 3, 8, 4, 14) - 0.5) * 0.8;
    let c = bandColor(pal, x);
    // 대적점
    const du = Math.min(Math.abs(u - 0.35), 1 - Math.abs(u - 0.35)) / 0.055, dv = (v - 0.62) / 0.03;
    const d = du * du + dv * dv;
    if (d < 1.6) {
      const a = Math.atan2(dv, du), sw = 0.5 + 0.5 * Math.sin(a * 2 + Math.sqrt(d) * 9);
      const red = mixc(hex('#b84a2c'), hex('#e3835a'), sw * 0.6 + Math.sqrt(d) * 0.3);
      c = mixc(c, red, smooth(1.4, 0.6, d));
    }
    return c;
  },
  earth(u, v) {
    const lat = Math.abs(0.5 - v) * 2;
    const land = fbm(u, v, 3, 7, 21), det = fbm(u, v, 12, 4, 22);
    let c;
    if (land > 0.53) {
      const dry = smooth(0.15, 0.45, 1 - Math.abs(lat - 0.4) * 3) * smooth(0.45, 0.7, det);
      c = mixc(mixc(hex('#3f6b2f'), hex('#6d7f3a'), det), hex('#c8a86a'), dry);
    } else c = mixc(hex('#0d2f6b'), hex('#1f5a9a'), smooth(0.4, 0.53, land));
    c = mixc(c, hex('#f4f6fa'), smooth(0.82, 0.9, lat + (det - 0.5) * 0.1));
    const cloud = fbm(u + 0.3, v, 6, 6, 23);
    return mixc(c, hex('#ffffff'), smooth(0.55, 0.75, cloud) * 0.8);
  },
};

const ATMOS = {
  moon: null, mars: { c: hex('#e8a07a'), k: 0.25 }, venus: { c: hex('#fff0c8'), k: 0.7 },
  neptune: { c: hex('#9ad0ff'), k: 0.8 }, saturn: { c: hex('#fff0d0'), k: 0.5 }, jupiter: { c: hex('#ffe8d0'), k: 0.5 }, earth: { c: hex('#8ac4ff'), k: 0.9 },
};
const GAS = { venus: 1, neptune: 1, saturn: 1, jupiter: 1 };
export const AVG_COLOR = { moon: '#a8a49c', mars: '#b8643c', venus: '#e6d2a0', neptune: '#4a76d8', saturn: '#dcc490', jupiter: '#d8b48a', earth: '#4a7ab8' };
export const TILT = { moon: 0.05, mars: 0.3, venus: 0.05, neptune: 0.4, saturn: 0.35, jupiter: 0.05, earth: 0.4 };
export const SPIN = { moon: 0.006, mars: 0.012, venus: 0.004, neptune: 0.02, saturn: 0.025, jupiter: 0.03, earth: 0.015 };   // 초당 회전(바퀴)

const textures = new Map(), pending = new Map();
const TEX_W = 768, TEX_H = 384;
function finish(id, data) {
  if (id === 'moon') stampCraters(data, TEX_W, TEX_H, 380, 5, 0.06, 1);
  if (id === 'mars') stampCraters(data, TEX_W, TEX_H, 80, 6, 0.03, 0.6);
  const tex = { id, data, w: TEX_W, h: TEX_H };
  textures.set(id, tex);
  pending.delete(id);
  return tex;
}
function rows(id, data, y0, y1) {
  const f = RECIPES[id];
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5) / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const c = f((x + 0.5) / TEX_W, v), i = (y * TEX_W + x) * 3;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
  }
}
// 바로 만든다(테스트용)
export function texture(id) {
  if (textures.has(id)) return textures.get(id);
  const data = new Uint8ClampedArray(TEX_W * TEX_H * 3);
  rows(id, data, 0, TEX_H);
  return finish(id, data);
}
// 화면이 멈추지 않게 조금씩 나눠 만든다. 다 되기 전에는 null
export function requestTexture(id) {
  if (textures.has(id)) return textures.get(id);
  if (!pending.has(id)) {
    const job = { data: new Uint8ClampedArray(TEX_W * TEX_H * 3), y: 0 };
    pending.set(id, job);
    const step = () => {
      const t0 = performance.now();
      while (job.y < TEX_H && performance.now() - t0 < 8) { rows(id, job.data, job.y, Math.min(TEX_H, job.y + 4)); job.y += 4; }
      if (job.y < TEX_H) setTimeout(step, 0); else finish(id, job.data);
    };
    setTimeout(step, 0);
  }
  return null;
}
export const hasTexture = (id) => textures.has(id);

// 화면 픽셀마다 위도·경도·빛을 미리 계산해 두고(반지름이 바뀔 때만), 회전은 경도만 밀어서 빠르게 다시 그린다
const geoCache = new Map();
const LIGHT = (() => { const v = [-0.45, -0.5, 0.74], n = Math.hypot(...v); return v.map((x) => x / n); })();
function geometry(R, tilt) {
  const key = R + ':' + tilt;
  if (geoCache.has(key)) return geoCache.get(key);
  const size = R * 2, n = size * size;
  const lon = new Float32Array(n), vv = new Float32Array(n), light = new Float32Array(n), nzA = new Float32Array(n), mask = new Uint8Array(n);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R, d = nx * nx + ny * ny, i = y * size + x;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    const tx = nx * ct - ny * st, ty = nx * st + ny * ct;
    lon[i] = Math.atan2(tx, nz) / TAU;
    vv[i] = 0.5 + Math.asin(Math.max(-1, Math.min(1, ty))) / Math.PI;
    light[i] = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    nzA[i] = nz;
    mask[i] = d > (1 - 2 / R) ? 1 : 2;   // 가장자리 한 줄은 부드럽게
  }
  const g = { size, lon, vv, light, nzA, mask };
  if (geoCache.size > 6) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(key, g);
  return g;
}

// heat: 0~1, 조석 마찰로 달아오른 정도(밤쪽이 붉게 빛남)
export function renderSphere(canvas, id, R, rot, heat = 0) {
  const tex = textures.get(id) || texture(id), tilt = TILT[id] || 0;
  const g = geometry(R, tilt), size = g.size;
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size), out = img.data, td = tex.data, tw = tex.w, th = tex.h;
  const atm = ATMOS[id], gas = GAS[id];
  for (let i = 0; i < size * size; i++) {
    if (!g.mask[i]) continue;
    let u = g.lon[i] + rot; u -= Math.floor(u);
    const fx = u * tw - 0.5, fy = g.vv[i] * th - 0.5;
    const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(th - 2, Math.floor(fy)));
    const ax = fx - x0, ay = Math.max(0, Math.min(1, fy - y0));
    const xa = ((x0 % tw) + tw) % tw, xb = (xa + 1) % tw;
    const i00 = (y0 * tw + xa) * 3, i10 = (y0 * tw + xb) * 3, i01 = ((y0 + 1) * tw + xa) * 3, i11 = ((y0 + 1) * tw + xb) * 3;
    const lam = g.light[i], nz = g.nzA[i];
    const lit = lam > 0 ? Math.pow(lam, gas ? 0.7 : 0.9) : 0;
    let shade = 0.035 + 0.965 * lit;
    if (gas) shade *= 0.6 + 0.4 * Math.sqrt(nz);
    const o = i * 4;
    for (let q = 0; q < 3; q++) {
      const c = (td[i00 + q] * (1 - ax) + td[i10 + q] * ax) * (1 - ay) + (td[i01 + q] * (1 - ax) + td[i11 + q] * ax) * ay;
      let val = c * shade;
      if (atm) val += atm.c[q] * Math.pow(1 - nz, 2.6) * atm.k * Math.max(0.12, lit);
      if (heat > 0) val += [255, 70, 20][q] * heat * (1 - lit) * (0.35 + 0.65 * (c / 255)) * 0.9;
      out[o + q] = val;
    }
    out[o + 3] = g.mask[i] === 1 ? 170 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 토성 고리: 위에서 본 원판 그림(가까이 둥근 빈틈들). 그릴 때 세로로 눌러서 비스듬히 보이게
const ringCache = new Map();
export function ringImage(outer) {
  const key = outer;
  if (ringCache.has(key)) return ringCache.get(key);
  const size = outer * 2, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const inner = 0.5;   // 바깥 반지름 대비 안쪽 시작
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x + 0.5 - outer, y + 0.5 - outer) / outer;
    if (r < inner || r > 1) continue;
    const t = (r - inner) / (1 - inner);
    let a = 0.35 + 0.5 * vnoise(t * 90, 0.5, 1e6, 31) * smooth(0, 0.08, t) * smooth(1, 0.92, t);
    a *= 0.75 + 0.25 * Math.sin(t * 220);
    if (t > 0.62 && t < 0.67) a *= 0.08;          // 카시니 간극
    if (t < 0.18) a *= 0.35;                       // 희미한 C 고리
    const col = mixc(hex('#cbb68e'), hex('#efe2c4'), smooth(0.2, 0.6, t));
    const i = (y * size + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, 0, 0);
  if (ringCache.size > 3) ringCache.delete(ringCache.keys().next().value);
  ringCache.set(key, c);
  return c;
}
