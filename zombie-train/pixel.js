// 픽셀 아트 렌더러: 낮은 해상도 버퍼에 픽셀을 직접 찍는다(안티에일리어싱 없음).
// 방은 원근 투영으로 짓고(벽·바닥·천장은 픽셀마다 광선을 역산해 질감을 입힘), 마지막에 디더링 조명을 씌운다.

// ---------- 색 ----------
export const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
const cR = (c) => c & 255, cG = (c) => (c >> 8) & 255, cB = (c) => (c >> 16) & 255;
const pack = (r, g, b) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
export const mix = (a, b, k) => pack(cR(a) + (cR(b) - cR(a)) * k, cG(a) + (cG(b) - cG(a)) * k, cB(a) + (cB(b) - cB(a)) * k);
const mul = (c, k) => pack(cR(c) * k, cG(c) * k, cB(c) * k);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];
// 0~1 해시와 부드러운 값 노이즈
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// 단계 수를 줄인 명암(디더링으로 계단 사이를 메움)
const steps = (k, n, x, y) => Math.floor(k * n + bayer(x, y)) / n;

// ---------- 버퍼 ----------
export class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); this.id = new Uint16Array(w * h); this.cur = 0; }
  px(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) { this.d[y * this.w + x] = c; this.id[y * this.w + x] = this.cur; } }
  get(x, y) { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const v = typeof c === 'function' ? c(xx, yy) : c; if (v) { this.d[yy * this.w + xx] = v; this.id[yy * this.w + xx] = this.cur; } }
  }
  // 다각형 채우기(픽셀 중심 기준, 가장자리 섞임 없음). c는 색이거나 (x, y) → 색(0이면 건너뜀)
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.ceil(y0 - 0.5)); y1 = Math.min(this.h - 1, Math.floor(y1 - 0.5));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5; xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) { const v = typeof c === 'function' ? c(x, y) : c; if (v) { this.d[y * this.w + x] = v; this.id[y * this.w + x] = this.cur; } }
      }
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.px(x0, y0, typeof c === 'function' ? c(x0, y0) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) this.px(x, y, typeof c === 'function' ? c(x, y, u, v) : c);
    }
  }
  blit(s, x, y, tint = 0, mask = null) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < s.h; j++) {
      const yy = y + j; if (yy < 0 || yy >= this.h) continue;
      for (let i = 0; i < s.w; i++) {
        const xx = x + i; if (xx < 0 || xx >= this.w) continue;
        const v = s.d[j * s.w + i]; if (!v) continue;
        this.d[yy * this.w + xx] = tint ? mix(v, tint >>> 0, tint >>> 0 === 0xffffffff ? 0.7 : 0.3) : v;
        if (mask) mask[yy * this.w + xx] = 0;
      }
    }
  }
  over(src, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    const d = this.d, s = src.d, w = this.w;
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++) for (let x = Math.max(0, x0), i = y * w + x; x < Math.min(w, x1); x++, i++) { const v = s[i]; if (v) d[i] = v; }
  }
}
// 픽셀 아트 외곽선: 나중에 그린(더 가까운) 물체의 가장자리, 투명한 곳과 맞닿은 가장자리를 어둡게
const INK = rgb('#1c1014');
export function inkEdges(b) {
  const { w, h, d, id } = b, out = d.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = d[i];
    if (!c) continue;
    const a = id[i];
    let edge = false;
    if (x > 0) { const n = i - 1; if (!d[n] || id[n] < a) edge = true; }
    if (!edge && x < w - 1) { const n = i + 1; if (!d[n] || id[n] < a) edge = true; }
    if (!edge && y > 0) { const n = i - w; if (!d[n] || id[n] < a) edge = true; }
    if (!edge && y < h - 1) { const n = i + w; if (!d[n] || id[n] < a) edge = true; }
    if (edge) out[i] = mix(mul(c, 0.42), INK, 0.35);
  }
  b.d.set(out);
}
// 실루엣에 바깥 테두리를 두른다
function outline(s, col) {
  const out = new Buf(s.w + 2, s.h + 2);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const v = s.d[y * s.w + x]; if (v) out.d[(y + 1) * out.w + x + 1] = v; }
  const o = out.d.slice();
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    if (o[y * out.w + x]) continue;
    if ((x > 0 && o[y * out.w + x - 1]) || (x < out.w - 1 && o[y * out.w + x + 1]) || (y > 0 && o[(y - 1) * out.w + x]) || (y < out.h - 1 && o[(y + 1) * out.w + x])) out.d[y * out.w + x] = col;
  }
  return out;
}

// ---------- 팔레트 ----------
const C = Object.fromEntries(Object.entries({
  woodD: '#3c2618', wood: '#5e3b24', woodM: '#74492b', woodL: '#93603a', woodH: '#b07a4a',
  cream: '#cbb68c', creamD: '#a99269', creamL: '#ddcca4', stain: '#7e6a4a',
  metal: '#5a5e63', metalD: '#34373b', metalL: '#8b9096', iron: '#2c2b2e', ironL: '#4a484c',
  blanket: '#d6c196', blanketD: '#ad9670', blanketL: '#ecdfbd', sheet: '#e9e2d0', pillow: '#efe9da', pillowD: '#c9c0aa',
  clothA: '#a8463a', clothB: '#e7dabb', rugA: '#6e2f2a', rugB: '#2e3a58', rugC: '#c49a4a',
  ceil: '#59614f', ceilD: '#3f4539', ceilL: '#6f7862', floor: '#4a3020', floorD: '#2f1d13', floorL: '#5f3e29',
  paper: '#e3d8bb', paperD: '#b9ac8c', ink: '#4a4036', red: '#c0392b', brass: '#c9a24a', brassD: '#8a6a2a',
  catO: '#3b2a5c', cat: '#a68ee6', catL: '#c4b1f5', catD: '#8670cc', catW: '#efe8ff', pink: '#f4a3c4', catN: '#e8789e',
  zO: '#14150f', zSkin: '#8c9a7a', zSkinD: '#67745a', zSkinL: '#a9b593', zShirt: '#4a3f36', zShirtD: '#2f2822', zEye: '#f1f5b0', zMouth: '#2a1414', zBlood: '#5e1e18',
}).map(([k, v]) => [k, rgb(v)]));
const BOOKS = ['#7a2e2a', '#2e4a6a', '#3e6a3a', '#8a6a2a', '#5a3a6a', '#a0522d', '#2f5f5f', '#6b4226', '#9c8a5a', '#405060'].map(rgb);

// ---------- 고양이 / 좀비 스프라이트 ----------
// 고양이 머리(앞발 포함), 영상처럼 크게. mood: sleep | awake | happy | scared | eat
export function catSprite(mood, frame = 0) {
  const W = 32, H = 25, s = new Buf(W, H), cx = 16, cy = 13;
  const flat = mood === 'scared', k = C.catO;
  const ear = (pts) => s.poly(pts, (x, y) => (y < 4 ? C.catL : C.cat));
  ear(flat ? [[2, 11], [2, 3], [11, 6]] : [[2, 11], [5, 0], [13, 5]]);
  ear(flat ? [[30, 11], [30, 3], [21, 6]] : [[30, 11], [27, 0], [19, 5]]);
  s.poly(flat ? [[4, 8], [4, 5], [8, 6.5]] : [[5, 8], [6, 3], [10, 6]], C.pink);
  s.poly(flat ? [[28, 8], [28, 5], [24, 6.5]] : [[27, 8], [26, 3], [22, 6]], C.pink);
  // 머리: 위는 밝게, 아래는 그늘(3단)
  s.ellipse(cx, cy, 13.5, 9.6, (x, y, u, v) => (v > 0.62 ? C.catD : u < -0.25 && v < -0.15 ? C.catL : C.cat));
  s.px(8, 6, C.catW); s.px(9, 6, C.catW); s.px(7, 7, C.catW);   // 머리 윤기
  s.ellipse(cx, cy + 4.5, 5.2, 3.2, C.catW);
  if (mood === 'sleep') for (const ox of [0, 12]) { s.px(8 + ox, 13, k); s.px(9 + ox, 14, k); s.px(10 + ox, 14, k); s.px(11 + ox, 14, k); s.px(12 + ox, 13, k); }
  else if (mood === 'happy') for (const ox of [0, 12]) { s.px(8 + ox, 14, k); s.px(9 + ox, 13, k); s.px(10 + ox, 12, k); s.px(11 + ox, 13, k); s.px(12 + ox, 14, k); }
  else if (mood === 'scared') for (const ox of [0, 12]) { s.rect(8 + ox, 10, 5, 5, C.catW); s.rect(10 + ox, 12, 2, 2, k); }
  else for (const ox of [0, 12]) { s.rect(9 + ox, 10, 3, 5, k); s.px(9 + ox, 10, C.catW); s.px(10 + ox, 11, C.catW); }
  for (const bx of [6, 24]) { s.rect(bx, 16, 3, 1, C.pink); }
  s.rect(15, 15, 2, 1, C.catN);
  if (mood === 'scared' || (mood === 'eat' && frame)) { s.rect(14, 17, 4, 3, C.zMouth); s.px(14, 17, C.catW); s.px(17, 17, C.catW); }
  else { s.px(14, 17, k); s.px(15, 18, k); s.px(16, 18, k); s.px(17, 17, k); }
  // 수염
  for (const [x0, dir] of [[4, -1], [28, 1]]) { s.px(x0, 15, C.catW); s.px(x0 + dir, 15, C.catW); s.px(x0, 17, C.catW); s.px(x0 + dir, 18, C.catW); }
  // 앞발(이불 위에 올림)
  for (const px of [8, 24]) { s.ellipse(px, 22, 4, 2.6, (x, y, u, v) => (v > 0.4 ? C.catD : C.catL)); s.px(px - 1, 23, k); s.px(px + 1, 23, k); }
  return outline(s, C.catO);
}
// 앉은 몸통 + 꼬리(깨어 있을 때 머리 아래에 둔다)
export function catBody(frame = 0) {
  const s = new Buf(34, 18);
  s.ellipse(16, 9, 10.5, 8.5, (x, y, u, v) => (v > 0.55 ? C.catD : u < -0.3 ? C.catL : C.cat));
  s.ellipse(16, 8, 4.5, 6, C.catW);
  const sw = frame ? 1 : 0;
  for (let i = 0; i < 10; i++) { const a = i / 9; s.rect(25 + a * 7, 14 - Math.sin(a * Math.PI) * (8 + sw * 2) - a * 3, 3, 3, i > 7 ? C.catL : C.cat); }
  return outline(s, C.catO);
}
// 창문에 들러붙은 좀비(가로 w). slap: 손 위치 번갈아
export function zombieSprite(w, slap = 0, variant = 0) {
  const h = Math.round(w * 0.95), s = new Buf(w, h), U = w / 40;
  const skin = variant % 2 ? rgb('#93a07f') : C.zSkin, skinD = variant % 2 ? rgb('#6c7a5e') : C.zSkinD;
  const shirt = [C.zShirt, rgb('#3b4656'), rgb('#5a3a30')][variant % 3];
  // 몸통
  s.poly([[w * 0.08, h], [w * 0.18, h * 0.66], [w * 0.82, h * 0.66], [w * 0.92, h]], (x, y) => (hash(x, y, 9) < 0.08 ? C.zShirtD : x > w * 0.62 ? mix(shirt, C.zShirtD, 0.5) : shirt));
  s.poly([[w * 0.38, h * 0.66], [w * 0.5, h * 0.82], [w * 0.62, h * 0.66]], skinD);
  s.rect(w * 0.42, h * 0.56, w * 0.16, h * 0.12, skinD);
  // 머리
  s.ellipse(w * 0.5, h * 0.4, w * 0.25, h * 0.27, (x, y, u, v) => {
    if (vnoise(x * 0.35, y * 0.35, 3 + variant) > 0.72) return skinD;
    if (hash(x, y, 4) < 0.05) return C.zBlood;
    return u + v * 0.6 > 0.55 ? skinD : u < -0.4 && v < 0 ? C.zSkinL : skin;
  });
  // 머리카락 몇 가닥
  for (let i = 0; i < 7 * U; i++) { const x = w * (0.32 + hash(i, 1, variant) * 0.36); s.line(x, h * 0.14, x + (hash(i, 2) - 0.5) * 4 * U, h * (0.22 + hash(i, 3) * 0.08), C.zO); }
  // 눈구멍과 빛나는 눈
  for (const ex of [0.4, 0.6]) { s.ellipse(w * ex, h * 0.38, 3.2 * U, 2.4 * U, C.zO); s.rect(w * ex - U * 0.6, h * 0.38 - U * 0.6, Math.max(1, U * 1.2), Math.max(1, U * 1.2), C.zEye); }
  // 벌린 입과 이
  s.ellipse(w * 0.5, h * 0.53, 4.2 * U, 3 * U, C.zMouth);
  for (let i = -2; i <= 2; i++) s.px(w * 0.5 + i * U * 1.4, h * 0.53 - 2.2 * U, rgb('#d8d0a8'));
  // 유리에 짓눌린 손바닥
  for (const [hx, up] of [[0.13, slap ? 0.06 : 0], [0.87, slap ? 0 : 0.06]]) {
    const cy = h * (0.42 - up);
    s.ellipse(w * hx, cy, 4.4 * U, 4.6 * U, (x, y, u, v) => (u > 0.4 ? skinD : C.zSkinL));
    for (let f = -1.5; f <= 1.5; f++) s.rect(w * hx + f * 2.2 * U - U * 0.7, cy - 9 * U, Math.max(1, U * 1.5), 5.5 * U, C.zSkinL);
    s.rect(w * hx - U, cy + 3 * U, 2 * U, 2 * U, C.zBlood);
  }
  return outline(s, C.zO);
}

// ---------- 방 ----------
// 세계 좌표: X는 좌우(-1~1), Y는 높이(바닥 0, 천장 CEIL), D는 카메라에서의 깊이(뒷벽 BACK)
export const HALF = 1, CEIL = 2.4, EYE = 2.0, BACK = 3.6;
export const WIN = { x0: -0.74, x1: 0.74, y0: 1.02, y1: 2.14 };

export function createRoom(AW, AH) {
  const f = AW * 0.9, cx = AW / 2, hy = Math.round(AH * 0.19);
  const P = (X, Y, D) => [cx + (f * X) / D, hy - (f * (Y - EYE)) / D];
  const back = new Buf(AW, AH), front = new Buf(AW, AH);
  const winHole = new Uint8Array(AW * AH);

  // 축에 맞춘 면 하나: 픽셀마다 광선-평면 교차로 세계 좌표를 되찾아 shader(X, Y, D, x, y)에 넘긴다
  let seq = 10;
  function face(b, axis, val, a0, a1, b0, b1, shader) {
    b.cur = ++seq;
    let pts;
    if (axis === 'D') pts = [P(a0, b0, val), P(a1, b0, val), P(a1, b1, val), P(a0, b1, val)];
    else if (axis === 'Y') pts = [P(a0, val, b0), P(a1, val, b0), P(a1, val, b1), P(a0, val, b1)];
    else pts = [P(val, a0, b0), P(val, a1, b0), P(val, a1, b1), P(val, a0, b1)];
    b.poly(pts, (x, y) => {
      const px = x + 0.5, py = y + 0.5;
      let X, Y, D;
      if (axis === 'D') { D = val; X = ((px - cx) * D) / f; Y = EYE + ((hy - py) * D) / f; }
      else if (axis === 'Y') { D = (f * (EYE - val)) / (py - hy); X = ((px - cx) * D) / f; Y = val; }
      else { D = (f * val) / (px - cx); X = val; Y = EYE + ((hy - py) * D) / f; }
      return typeof shader === 'function' ? shader(X, Y, D, x, y) : shader;
    });
  }
  function box(b, x0, x1, y0, y1, d0, d1, sh) {
    if (x1 < 0 && sh.side) face(b, 'X', x1, y0, y1, d0, d1, sh.side);
    if (x0 > 0 && sh.side) face(b, 'X', x0, y0, y1, d0, d1, sh.side);
    if (y1 < EYE && sh.top) face(b, 'Y', y1, x0, x1, d0, d1, sh.top);
    if (sh.front) face(b, 'D', d0, x0, x1, y0, y1, sh.front);
  }
  const grain = (base, x, y, k = 0.1) => (hash(x, y >> 2, 7) < 0.12 ? mul(base, 1 - k * 1.6) : hash(x, y >> 3, 8) > 0.94 ? mul(base, 1 + k) : base);

  // --- 껍데기: 픽셀마다 광선이 처음 닿는 면 ---
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const dx = (x + 0.5 - cx) / f, dy = (hy - y - 0.5) / f;
    const dSide = dx !== 0 ? HALF / Math.abs(dx) : Infinity;
    const dFloor = dy < 0 ? EYE / -dy : Infinity, dCeil = dy > 0 ? (CEIL - EYE) / dy : Infinity;
    const D = Math.min(BACK, dSide, dFloor, dCeil), X = dx * D, Y = EYE + dy * D;
    let c;
    if (D === BACK) c = backWall(X, Y, x, y);
    else if (D === dSide) c = sideWall(X, Y, D, x, y);
    else if (D === dFloor) c = floorTex(X, D, x, y);
    else c = ceilTex(X, D, x, y);
    if (c === 0) winHole[y * AW + x] = 1;
    back.d[y * AW + x] = c;
    back.id[y * AW + x] = D === BACK ? 1 : D === dSide ? 2 : D === dFloor ? 3 : 4;
  }
  function backWall(X, Y, x, y) {
    // 창문(모서리 둥근 열차 창): 구멍은 0, 둘레는 금속 틀
    const r = 0.14, ix = Math.max(WIN.x0 + r - X, 0, X - (WIN.x1 - r)), iy = Math.max(WIN.y0 + r - Y, 0, Y - (WIN.y1 - r));
    const dIn = Math.hypot(ix, iy);
    if (X > WIN.x0 && X < WIN.x1 && Y > WIN.y0 && Y < WIN.y1 && dIn < r) return 0;
    const ox = Math.max(WIN.x0 - 0.07 + r - X, 0, X - (WIN.x1 + 0.07 - r)), oy = Math.max(WIN.y0 - 0.07 + r - Y, 0, Y - (WIN.y1 + 0.07 - r));
    if (X > WIN.x0 - 0.07 && X < WIN.x1 + 0.07 && Y > WIN.y0 - 0.07 && Y < WIN.y1 + 0.07 && Math.hypot(ox, oy) < r) return Y > (WIN.y0 + WIN.y1) / 2 + 0.45 || X < WIN.x0 + 0.02 ? C.metalL : dIn < r + 0.03 ? C.metalD : C.metal;
    if (Y > 2.28) return grain(C.metalD, x, y);
    if (Y < 0.55) { const p = Math.floor((X + 1) / 0.5); return Math.abs(((X + 1) / 0.5) - p - 0.5) > 0.44 ? C.woodD : grain(C.wood, x, y, 0.08); }
    if (Y < 0.62) return Y > 0.59 ? C.woodH : C.woodL;
    const pl = Math.floor((X + 1) / 0.19), fr = (X + 1) / 0.19 - pl;
    if (fr < 0.08) return C.woodD;
    return grain(mix(C.woodM, C.woodL, hash(pl, 3) * 0.5), x, y, 0.12);
  }
  function sideWall(X, Y, D, x, y) {
    if (Y < 0.85) { const b = D / 0.13, i = Math.floor(b); return b - i < 0.12 ? C.woodD : grain(mix(C.wood, C.woodM, hash(i, X > 0 ? 5 : 6)), x, y); }
    if (Y < 0.93) return Y > 0.9 ? C.woodH : C.woodL;
    const pd = D / 0.5, pi = Math.floor(pd);
    if (pd - pi < 0.05 || Math.abs(Y - 1.72) < 0.02) return C.creamD;
    if ((pd - pi < 0.14 || pd - pi > 0.92) && (Math.abs(Y - 1.0) < 0.03 || Math.abs(Y - 1.66) < 0.03 || Math.abs(Y - 1.78) < 0.03 || Math.abs(Y - 2.3) < 0.03)) return C.metalD;
    const st = vnoise(D * 3, Y * 4, X > 0 ? 1 : 2) + vnoise(D * 9, Y * 9, 3) * 0.3;
    if (Y > 2.34) return C.ceilD;
    return st > 1.0 ? C.stain : st > 0.85 ? mix(C.cream, C.stain, steps(0.5, 2, x, y)) : grain(C.cream, x, y, 0.05);
  }
  function floorTex(X, D, x, y) {
    if (X > -0.44 && X < 0.44 && D > 1.0 && D < 1.92) {
      const ax = Math.abs(X), border = ax > 0.36 || D < 1.07 || D > 1.85;
      if (ax > 0.42 || D < 1.02 || D > 1.9) return hash(x, y) < 0.5 ? C.rugC : C.clothB;
      if (border) return (Math.floor(D * 18) + Math.floor(X * 18)) % 2 ? C.rugC : C.rugA;
      const u = ax / 0.36, v = Math.abs((D - 1.46) / 0.39);
      return u + v < 0.55 ? C.rugA : u + v < 0.7 ? C.rugC : (Math.floor(X * 12 + 9) + Math.floor(D * 12)) % 3 === 0 ? mix(C.rugB, C.rugA, 0.4) : C.rugB;
    }
    const bi = Math.floor((X + 1) / 0.21), fr = (X + 1) / 0.21 - bi, j = (D + hash(bi, 8) * 1.3) / 0.9;
    if (fr < 0.07 || j - Math.floor(j) < 0.012 * D) return C.floorD;
    return grain(mix(C.floor, C.floorL, hash(bi, Math.floor(j)) * 0.7), x, y, 0.12);
  }
  function ceilTex(X, D, x, y) {
    const ax = Math.abs(X), k = D / 0.36, i = Math.floor(k);
    if (ax < 0.13) return Math.floor(D * 14) % 2 ? C.metalD : C.metal;
    if (k - i < 0.07) return C.ceilD;
    if (k - i < 0.2 && Math.abs(ax - 0.3) < 0.03) return C.metalL;
    return mix(C.ceil, C.ceilD, steps(Math.min(1, ax * ax * 0.9), 4, x, y));
  }

  // --- 뒤쪽 물건 ---
  // 액자(뒷벽 왼쪽)
  face(back, 'D', BACK - 0.01, -0.95, -0.79, 1.42, 1.66, (X, Y, D, x, y) => (X < -0.935 || X > -0.805 || Y < 1.435 || Y > 1.645 ? C.brassD : Y < 1.5 ? rgb('#5d7a4a') : rgb('#a7b8c2')));
  // 침대 머리판(금속)
  for (const px of [-0.6, 0.5]) face(back, 'D', 3.56, px, px + 0.05, 0, 1.0, (X) => (X < px + 0.02 ? C.metalL : C.metal));
  for (const ry of [0.62, 0.94]) face(back, 'D', 3.56, -0.6, 0.55, ry, ry + 0.04, C.metalL);
  // 침대: 틀, 매트리스, 베개, 이불
  box(back, -0.62, 0.56, 0.1, 0.42, 1.85, 3.55, { front: (X, Y, D, x, y) => grain(Y > 0.38 ? C.woodL : C.wood, x, y) });
  for (const lx of [-0.6, 0.48]) face(back, 'D', 1.86, lx, lx + 0.06, 0, 0.12, C.woodD);
  face(back, 'Y', 0.6, -0.62, 0.56, 3.1, 3.55, C.sheet);
  box(back, -0.46, 0.4, 0.6, 0.78, 3.15, 3.5, { top: (X, Y, D, x, y) => (Math.abs(X + 0.03) > 0.4 || D > 3.46 ? C.pillowD : grain(C.pillow, x, y, 0.04)), front: (X, Y, D, x, y) => (Y < 0.64 ? C.pillowD : C.pillow) });
  const blanket = (X, Y, D, x, y) => {
    const fold = Math.sin(X * 10 + Math.sin(D * 6) * 1.6) * 0.5 + vnoise(X * 4, D * 4, 11) - 0.5;
    const k = steps(Math.max(0, Math.min(1, 0.55 + fold * 0.55)), 3, x, y);
    const c = k < 0.34 ? C.blanketD : k > 0.67 ? C.blanketL : C.blanket;
    return hash(x, y, 2) < 0.06 ? mul(c, 0.94) : (x + y) % 2 && hash(x >> 1, y, 5) < 0.2 ? mul(c, 1.04) : c;
  };
  face(back, 'Y', 0.64, -0.64, 0.58, 1.8, 3.12, blanket);
  face(back, 'D', 3.12, -0.64, 0.58, 0.6, 0.67, C.blanketL);   // 접힌 이불 끝
  face(back, 'D', 1.8, -0.64, 0.58, 0.14, 0.64, (X, Y, D, x, y) => {
    const hem = 0.18 + Math.sin(X * 17) * 0.03 + Math.sin(X * 5.3) * 0.04;
    if (Y < hem) return 0;
    const k = Math.sin(X * 22 + 1) * 0.5 + 0.5;
    return Y < hem + 0.025 ? C.blanketD : k > 0.75 ? C.blanketL : k < 0.2 ? C.blanketD : C.blanket;
  });
  // 난로(오른쪽 뒤 구석): 불 창은 비워 두고 매 프레임 그린다
  const stove = { x0: 0.64, x1: 0.98, y0: 0.08, y1: 0.8, d0: 2.95, d1: 3.5, door: { x0: 0.7, x1: 0.92, y0: 0.22, y1: 0.5 } };
  for (const [lx, ld] of [[0.66, 2.97], [0.93, 2.97]]) face(back, 'D', ld, lx, lx + 0.04, 0, 0.09, C.iron);
  face(back, 'X', 0.62, 0.08, 0.8, 2.95, 3.5, (X, Y, D, x, y) => grain(Y > 0.74 ? C.ironL : C.iron, x, y, 0.15));
  face(back, 'Y', 0.8, 0.62, 0.98, 2.95, 3.5, (X, Y, D, x, y) => (Math.hypot(X - 0.81, D - 3.22) < 0.1 ? C.metalD : C.ironL));
  face(back, 'D', 2.95, 0.62, 0.98, 0.08, 0.8, (X, Y, D, x, y) => {
    const dr = stove.door;
    if (X > dr.x0 && X < dr.x1 && Y > dr.y0 && Y < dr.y1) return 0;
    if (X > dr.x0 - 0.03 && X < dr.x1 + 0.03 && Y > dr.y0 - 0.03 && Y < dr.y1 + 0.03) return C.ironL;
    if (Y > 0.72) return C.ironL;
    return grain(hash(x, y, 3) < 0.06 ? rgb('#5a3424') : C.iron, x, y, 0.15);
  });
  // 주전자
  { const [kx, ky] = P(0.81, 0.88, 3.2), r = f * 0.085 / 3.2; back.ellipse(kx, ky, r * 1.2, r, (x, y, u, v) => (u < -0.3 ? C.metalL : v > 0.4 ? C.metalD : C.metal)); back.rect(kx - r * 1.9, ky - r * 0.4, r * 0.8, 1, C.metal); back.rect(kx - 1, ky - r - 1, 2, 1, C.iron); }
  // 연통
  face(back, 'D', 3.25, 0.77, 0.86, 0.8, CEIL, (X, Y, D, x, y) => (Math.floor(Y * 6) !== Math.floor((Y - 0.02) * 6) ? C.ironL : X < 0.79 ? C.ironL : C.iron));
  // 오른쪽 벽: 선반(통조림 자리), 지도와 신문
  face(back, 'Y', 1.3, 0.8, 0.995, 1.85, 2.9, (X, Y, D, x, y) => grain(C.woodL, x, y));
  face(back, 'X', 0.8, 1.26, 1.3, 1.85, 2.9, C.woodD);
  const papers = [[1.9, 2.35, 1.5, 1.95, 0], [2.4, 2.8, 1.6, 2.15, 1], [2.05, 2.4, 1.92, 2.24, 2], [2.95, 3.45, 1.35, 1.95, 3]];
  for (const [d0, d1, y0, y1, k] of papers) face(back, 'X', 0.993 - k * 0.001, y0, y1, d0, d1, (X, Y, D, x, y) => {
    if (Y > y1 - 0.03 && Math.abs(D - (d0 + d1) / 2) < 0.025) return C.red;   // 압정
    const u = (D - d0) / (d1 - d0), v = (y1 - Y) / (y1 - y0);
    if (k === 1 || k === 3) {   // 지도: 길과 강
      if (Math.abs(v - 0.5 - Math.sin(u * 9) * 0.15) < 0.03) return rgb('#6a8aa6');
      if (Math.abs(u - 0.3 - v * 0.3) < 0.025 || Math.abs(v - 0.3) < 0.02) return C.red;
      return hash(x, y, k) < 0.1 ? C.paperD : rgb('#d9cfa8');
    }
    if (v < 0.18) return v < 0.12 && u > 0.1 && u < 0.9 ? C.ink : C.paper;
    return Math.floor(v * 14) % 2 && u > 0.08 && u < 0.92 && hash(Math.floor(u * 12), Math.floor(v * 14), k) > 0.25 ? C.paperD : C.paper;
  });
  face(back, 'X', 0.99, 2.12, 2.18, 1.0, 3.55, C.metalD);   // 배관
  face(back, 'X', 0.99, 2.22, 2.27, 1.0, 3.55, C.metal);

  // --- 앞쪽 물건 ---
  // 왼쪽 벽 책장
  face(front, 'X', -0.79, 0, 2.12, 1.8, 3.2, (X, Y, D, x, y) => grain(C.woodD, x, y));
  const shelves = [0.04, 0.52, 1.0, 1.48, 1.96];
  for (let si = 0; si < shelves.length - 1; si++) {
    let d = 1.83;
    while (d < 3.12) {
      const r = hash(si, Math.round(d * 100), 21), w = 0.035 + r * 0.05, top = shelves[si] + 0.04 + 0.26 + hash(si, Math.round(d * 100), 22) * 0.12;
      if (r > 0.86) {   // 유리병(톱니바퀴)
        face(front, 'X', -0.8, shelves[si] + 0.04, shelves[si] + 0.3, d, d + 0.12, (X, Y, D, x, y) => (Y > shelves[si] + 0.27 ? C.brassD : Math.hypot(D - d - 0.06, Y - shelves[si] - 0.14) < 0.05 ? (hash(x, y) < 0.5 ? C.brass : C.brassD) : mix(C.woodD, rgb('#9fb4b0'), 0.45)));
        d += 0.14; continue;
      }
      const col = BOOKS[Math.floor(hash(si, Math.round(d * 100), 23) * BOOKS.length)];
      face(front, 'X', -0.8, shelves[si] + 0.04, Math.min(top, shelves[si + 1] - 0.02), d, d + w, (X, Y, D, x, y) => (Math.abs(Y - top + 0.06) < 0.015 || Math.abs(Y - shelves[si] - 0.1) < 0.015 ? C.brass : D - d < 0.008 ? mul(col, 0.7) : col));
      d += w + 0.004;
    }
  }
  for (const sy of shelves) face(front, 'X', -0.78, sy, sy + 0.04, 1.8, 3.2, C.woodL);
  face(front, 'D', 1.8, -1.0, -0.78, 0, 2.12, C.woodM);
  // 발판 의자(오른쪽 앞): 방석
  for (const [lx, ld] of [[0.44, 1.08], [0.92, 1.08]]) face(front, 'D', ld, lx, lx + 0.04, 0, 0.3, C.woodD);
  box(front, 0.4, 0.98, 0.3, 0.48, 1.05, 1.42, {
    side: (X, Y, D, x, y) => (Y < 0.34 ? C.woodD : grain(C.blanketD, x, y)),
    top: (X, Y, D, x, y) => { const u = ((X - 0.4) % 0.2) / 0.2, v = ((D - 1.05) % 0.17) / 0.17; return Math.hypot(u - 0.5, v - 0.5) < 0.09 ? C.woodD : u < 0.06 || v < 0.08 ? C.blanketD : u + v < 0.7 ? C.blanketL : C.blanket; },
    front: (X, Y, D, x, y) => (Y < 0.34 ? C.woodM : grain(C.blanket, x, y)),
  });
  // 바구니(바닥 가운데 앞): 공구가 꽂혀 있음
  box(front, 0.0, 0.32, 0, 0.24, 1.12, 1.28, {
    top: (X, Y, D, x, y) => (hash(x, y, 12) < 0.3 ? C.woodM : C.woodD),
    front: (X, Y, D, x, y) => { const a = Math.floor(X * 34), b = Math.floor(Y * 28); return Y > 0.21 ? C.woodH : (a + b) % 2 ? C.woodL : (a % 2 ? C.woodM : C.wood); },
  });
  { front.cur = 900;
    const tools = [[0.07, 0.4, -0.04], [0.16, 0.46, 0.02], [0.25, 0.39, 0.05]];
    for (const [tx, ty, lean] of tools) {
      const [x0, y0] = P(tx, 0.18, 1.2), [x1, y1] = P(tx + lean, ty, 1.2);
      front.line(x0, y0, x1, y1, C.metalL); front.line(x0 + 1, y0, x1 + 1, y1, C.metal);
      front.ellipse(x1, y1 - 1, 3.2, 2.6, C.metal); front.px(x1 - 1, y1 - 2, C.metalL);
    }
    const [hx, hy2] = P(0.16, 0.3, 1.13); front.rect(hx - 9, hy2, 4, 3, C.red); front.rect(hx + 5, hy2 + 1, 5, 2, rgb('#e2c03a'));
  }
  // 식탁(왼쪽 앞): 체크무늬 식탁보
  for (const lx of [-0.9, -0.16]) face(front, 'D', 1.08, lx, lx + 0.05, 0, 0.62, C.woodM);
  const check = (X, D, x, y) => ((Math.floor((X + 2) / 0.08) + Math.floor(D / 0.08)) % 2 ? C.clothB : mix(C.clothA, C.clothB, (Math.floor((X + 2) / 0.08) % 2) * 0.45));
  box(front, -0.98, -0.05, 0.62, 0.8, 1.05, 1.5, {
    side: (X, Y, D, x, y) => (Y < 0.62 + Math.sin(D * 40) * 0.02 + 0.02 ? 0 : check(D, Y, x, y)),
    top: (X, Y, D, x, y) => check(X, D, x, y),
    front: (X, Y, D, x, y) => (Y < 0.62 + Math.sin(X * 40) * 0.02 + 0.02 ? 0 : mul(check(X, Y + 1, x, y), 0.92)),
  });
  // 펼친 책
  face(front, 'Y', 0.805, -0.52, -0.16, 1.09, 1.25, (X, Y, D, x, y) => (Math.abs(X + 0.34) < 0.012 ? C.paperD : Math.floor(D * 60) % 3 === 0 && Math.abs(X + 0.34) > 0.04 ? C.paperD : C.paper));
  // 라디오
  const radio = { x0: -0.95, x1: -0.7, y0: 0.8, y1: 0.96, d0: 1.3, d1: 1.44 };
  box(front, radio.x0, radio.x1, radio.y0, radio.y1, radio.d0, radio.d1, {
    side: C.woodD, top: C.woodL,
    front: (X, Y, D, x, y) => (Y > 0.93 ? C.woodL : X < -0.83 ? ((x + y) % 2 ? C.metalD : C.metal) : Y > 0.87 ? rgb('#3a2a10') : C.woodM),
  });
  // 스탠드(전구는 매 프레임)
  const lampAt = P(-0.5, 0.81, 1.42), bulb = P(-0.42, 1.32, 1.4);
  { front.cur = 901;
    const u = f / 1.4, [lx, ly] = lampAt, [bx, by] = bulb;
    front.ellipse(lx, ly, u * 0.07, u * 0.025, (x, y, uu, vv) => (vv < -0.2 ? C.metalL : C.metalD));
    front.line(lx, ly - 1, lx - u * 0.03, by + u * 0.12, C.metalD); front.line(lx + 1, ly - 1, lx + 1 - u * 0.03, by + u * 0.12, C.metal);
    front.line(lx - u * 0.03, by + u * 0.12, bx - 2, by - u * 0.06, C.metalD); front.line(lx + 1 - u * 0.03, by + u * 0.12, bx - 1, by - u * 0.06, C.metal);
    front.poly([[bx - u * 0.1, by - u * 0.01], [bx - u * 0.05, by - u * 0.075], [bx + u * 0.05, by - u * 0.075], [bx + u * 0.1, by - u * 0.01]], (x, y) => (x < bx - u * 0.04 ? C.metalL : C.metal));
  }
  // 머그(연필)
  { const [mx, my] = P(-0.25, 0.81, 1.38); front.rect(mx - 2, my - 4, 5, 5, C.pillow); front.px(mx, my - 2, rgb('#e2a43a')); for (let i = 0; i < 3; i++) front.line(mx - 1 + i, my - 5, mx - 2 + i * 2, my - 9, [C.red, rgb('#e2c03a'), rgb('#3a6ae2')][i]); }

  // 화면 좌표로 쓰는 자리들
  const winRect = (() => { const a = P(WIN.x0, WIN.y1, BACK), b = P(WIN.x1, WIN.y0, BACK); return { x: Math.round(a[0]), y: Math.round(a[1]), w: Math.round(b[0] - a[0]), h: Math.round(b[1] - a[1]) }; })();
  const doorPts = [P(stove.door.x0, stove.door.y1, stove.d0), P(stove.door.x1, stove.door.y0, stove.d0)];
  const fireRect = { x: Math.round(doorPts[0][0]), y: Math.round(doorPts[0][1]), w: Math.round(doorPts[1][0] - doorPts[0][0]), h: Math.round(doorPts[1][1] - doorPts[0][1]) };
  const catAt = P(-0.03, 0.7, 3.2);   // 고양이 머리 아래쪽(앞발)이 이불 끝에 닿는 자리
  const catSit = P(-0.03, 0.64, 2.55);
  const bucket = P(0.76, 0, 2.78), cans = [];
  for (let i = 0; i < 10; i++) { const d = 1.95 + (i % 5) * 0.18, row = Math.floor(i / 5); cans.push({ p: P(0.86 + row * 0.08, 1.3, d + row * 0.08), s: f / (d + row * 0.08) }); }
  const dial = P(-0.76, 0.9, 1.3);
  const lights = { lamp: bulb, stove: P(0.81, 0.36, 2.95), win: P(0, 1.55, BACK) };
  // 빛의 퍼짐(화면 거리) 미리 계산
  // 빛 웅덩이는 4단계 고리로 끊고, 고리 경계만 2×2 체크로 섞는다(픽셀 아트식 조명)
  const D2 = [0.25, 0.75, 1, 0.5];
  const fall = (p, r) => { const a = new Float32Array(AW * AH); for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) { const d = Math.hypot(x - p[0], (y - p[1]) * 1.1) / r, v = d < 1 ? (1 - d) * (1 - d) : 0; a[y * AW + x] = Math.floor(v * 4 + D2[(x & 1) + ((y & 1) << 1)] * 0.6) / 4; } return a; };
  const lampF = fall(bulb, AW * 0.7), stoveF = fall(lights.stove, AW * 0.42), winF = fall(lights.win, AW * 0.95);
  inkEdges(back); inkEdges(front);
  return { AW, AH, f, cx, hy, P, back, front, winHole, winRect, fireRect, catAt, catSit, bucket, cans, dial, bulb, lights, lampF, stoveF, winF };
}

// ---------- 창밖 ----------
const SKY = {
  day: [rgb('#9fb0b5'), rgb('#d6cdb2')], dusk: [rgb('#4b3a5e'), rgb('#e8925a')], night: [rgb('#070b18'), rgb('#1c2538')],
};
const CITY = Array.from({ length: 64 }, (_, i) => ({ w: 5 + Math.floor(hash(i, 1) * 9), h: 0.12 + hash(i, 2) * 0.32, broken: hash(i, 3) < 0.4 }));
const CITY_W = CITY.reduce((a, b) => a + b.w + 1, 0);
const WALKERS = Array.from({ length: 40 }, (_, i) => ({ x: hash(i, 11) * 700, ph: hash(i, 12) * 6, v: 0.6 + hash(i, 13) * 0.8, d: hash(i, 14) }));

export function drawOutside(b, room, o) {
  const { x: X0, y: Y0, w: W, h: H } = room.winRect;
  const dl = o.daylight, duskK = dl > 0 && dl < 1 ? 1 - Math.abs(dl - 0.5) * 2 : 0;
  const top = dl >= 1 ? SKY.day[0] : mix(mix(SKY.night[0], SKY.day[0], dl), SKY.dusk[0], duskK * 0.7);
  const bot = dl >= 1 ? SKY.day[1] : mix(mix(SKY.night[1], SKY.day[1], dl), SKY.dusk[1], duskK * 0.8);
  const hz = Math.round(H * 0.6);
  const fogC = mix(rgb('#202838'), rgb('#cfc9b8'), dl);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = X0 + x, sy = Y0 + y;
    if (!room.winHole[sy * room.AW + sx]) continue;
    let c;
    if (y < hz) {
      c = mix(top, bot, steps(y / hz, 6, sx, sy));
      if (dl < 0.4 && hash(x + Math.floor(o.scroll * 0.02), y, 5) > 0.992) c = rgb('#e8e8f0');
    } else {
      const g = (y - hz) / (H - hz);
      const ground = mix(mix(rgb('#1a1c18'), rgb('#6a6450'), dl), mix(rgb('#0e0f0c'), rgb('#4a4436'), dl), g);
      c = hash(Math.floor(x + o.scroll * (1 + g * 1.5)), y, 6) < 0.15 ? mul(ground, 0.8) : ground;
      if (y > H - 4) c = hash(Math.floor(x + o.scroll * 2.6), y, 7) < 0.4 ? mix(ground, rgb('#8a8678'), dl * 0.6) : mul(ground, 0.7);
    }
    b.d[sy * b.w + sx] = c;
  }
  // 달
  if (dl < 0.5) b.ellipse(X0 + W * 0.78, Y0 + H * 0.16, 3, 3, (x, y, u, v) => (u + v > 0.5 ? rgb('#b8b8a8') : rgb('#ecead8')));
  // 무너진 도시(멀리, 천천히)
  const cityC = mix(rgb('#0a0e18'), mix(bot, rgb('#4a5058'), 0.55), dl);
  let cxp = -((o.scroll * 0.12) % CITY_W);
  for (let i = 0; cxp < W; i = (i + 1) % CITY.length) {
    const bl = CITY[i], h = Math.round(bl.h * hz);
    for (let x = 0; x < bl.w; x++) for (let y = 0; y < h; y++) {
      if (bl.broken && x > bl.w / 2 && y < (x - bl.w / 2) * 1.5) continue;
      const lit = dl < 0.3 && hash(i * 31 + x, y, 9) > 0.97;
      clipPx(b, room, X0 + cxp + x, Y0 + hz - y, lit ? rgb('#e8b04a') : (x % 3 === 1 && y % 3 === 1 && hash(i, x * 7 + y) < 0.5 ? mul(cityC, 0.8) : cityC));
    }
    cxp += bl.w + 1;
  }
  // 전봇대와 전선
  const poleGap = 70, poleC = mix(rgb('#06070a'), rgb('#2e2a26'), dl);
  for (let k = -1; k < W / poleGap + 2; k++) {
    const px = Math.round(k * poleGap - (o.scroll % poleGap));
    for (let y = Math.round(H * 0.18); y < H - 2; y++) clipPx(b, room, X0 + px, Y0 + y, poleC);
    for (let x = -3; x <= 3; x++) clipPx(b, room, X0 + px + x, Y0 + Math.round(H * 0.22), poleC);
    for (let x = 0; x < poleGap; x++) { const sag = Math.sin((x / poleGap) * Math.PI) * 4; clipPx(b, room, X0 + px + x, Y0 + Math.round(H * 0.22 + sag), mix(poleC, top, 0.4)); }
  }
  // 정차한 역
  if (o.station) {
    const plat = mix(rgb('#2a2a2c'), rgb('#9a958a'), dl);
    for (let y = Math.round(H * 0.74); y < H; y++) for (let x = 0; x < W; x++) clipPx(b, room, X0 + x, Y0 + y, y < H * 0.77 ? rgb('#c9a83a') : hash(x, y, 4) < 0.1 ? mul(plat, 0.85) : plat);
    for (let x = 0; x < W; x++) for (let y = 0; y < 3; y++) clipPx(b, room, X0 + x, Y0 + y, mix(rgb('#141414'), rgb('#5a5650'), dl));
    for (const px of [0.12, 0.88]) for (let y = 0; y < H * 0.75; y++) clipPx(b, room, X0 + Math.round(W * px), Y0 + y, poleC);
    for (let y = 0; y < 5; y++) for (let x = 0; x < W * 0.44; x++) clipPx(b, room, X0 + Math.round(W * 0.28 + x), Y0 + Math.round(H * 0.12) + y, y === 0 || y === 4 ? rgb('#e8e8e0') : rgb('#1f5e3a'));
  }
  // 어슬렁거리는 좀비들(밤일수록 많다)
  const n = Math.round(4 + o.crowd * 14), sp = o.station ? 0.2 : 1;
  for (let i = 0; i < n; i++) {
    const z = WALKERS[i], wx = ((z.x - o.scroll * sp + o.t * z.v * 3) % 700 + 700) % 700;
    if (wx > W + 4) continue;
    const yb = Y0 + hz + 2 + Math.round(z.d * (H - hz - 6)), bob = Math.floor(o.t * 3 + z.ph) % 2;
    const sc = z.d > 0.5 ? 2 : 1, bodyC = mix(rgb('#0b0c0a'), rgb('#3a3a32'), dl * 0.7), headC = mix(rgb('#1a2018'), rgb('#7d8a6c'), dl);
    for (let y = 0; y < 5 * sc; y++) for (let x = 0; x < 2 * sc; x++) clipPx(b, room, X0 + wx + x, yb - y - bob, bodyC);
    for (let y = 0; y < 2 * sc; y++) for (let x = 0; x < 2 * sc; x++) clipPx(b, room, X0 + wx + x, yb - 5 * sc - y - bob, headC);
    for (let x = 0; x < 2 * sc; x++) clipPx(b, room, X0 + wx + 2 * sc + x, yb - 4 * sc - bob, headC);
  }
  // 안개
  for (let y = 0; y < H; y++) {
    const k = Math.max(0, 1 - Math.abs(y - hz) / (H * 0.3)) * 0.55;
    for (let x = 0; x < W; x++) if (bayer(X0 + x, Y0 + y) < k * (0.6 + 0.4 * vnoise((x + o.t * 4) * 0.08, y * 0.2, 2))) clipPx(b, room, X0 + x, Y0 + y, fogC);
  }
  // 비
  if (o.rain) for (let i = 0; i < W * H * 0.04; i++) {
    const x = Math.floor(hash(i, 1, 33) * W + o.t * 30) % W, y = Math.floor(hash(i, 2, 33) * H + o.t * 160) % H;
    clipPx(b, room, X0 + x, Y0 + y, mix(rgb('#6a7080'), rgb('#c8ccd0'), dl)); clipPx(b, room, X0 + x - 1, Y0 + y - 2, mix(rgb('#4a5060'), rgb('#a8acb0'), dl));
  }
}
function clipPx(b, room, x, y, c) {
  x |= 0; y |= 0;
  const r = room.winRect;
  if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h || !room.winHole[y * room.AW + x]) return;
  b.d[y * b.w + x] = c;
}

// ---------- 한 프레임 ----------
// o: { t, daylight, scroll, crowd, rain, station, zombie:{k(0~1 다가옴), slap, hit, sprite}, fire(0~1), fuel, food, barricade(0~1), plates, lampOn, radioOn, cat:{sprite, body, dx, dy, tint} }
export function compose(out, room, o) {
  const { AW, AH } = room, d = out.d;
  d.fill(rgb('#000000'));
  drawOutside(out, room, o);
  // 창에 붙은 좀비
  if (o.zombie) {
    const r = room.winRect, z = o.zombie, sp = z.sprite;
    const k = z.k, w = sp.w * (0.25 + 0.75 * k), sx = r.x + r.w / 2 - w / 2 + (z.hit ? Math.sin(o.t * 90) * 2 : 0);
    const sy = r.y + r.h - sp.h * (0.25 + 0.75 * k) * 0.92 + (k < 1 ? (1 - k) * -r.h * 0.25 : Math.sin(o.t * 6) * 1);
    if (k >= 1) out.blit(sp, sx, sy, z.hit ? 0xffffffff : 0, null);
    else blitScaled(out, sp, sx, sy, 0.25 + 0.75 * k, room);
    clipWindow(out, room, sx - 2, sy - 2, sp.w + 4, sp.h + 4, o);
  }
  out.over(room.back);
  // 유리: 반사광 몇 줄, 금, 철판
  const r = room.winRect, glass = rgb('#dfe8ee');
  for (let i = 0; i < r.h; i++) { const x = r.x + 4 + i * 0.6, y = r.y + r.h - 1 - i; if (room.winHole[(y | 0) * AW + (x | 0)] && (i % 9 < 2)) out.px(x, y, mix(out.get(x, y), glass, 0.35)); }
  drawBarricade(out, room, o);
  // 난로 불
  const fr = room.fireRect;
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
    const fx = fr.x + x, fy = fr.y + y;
    if (out.get(fx, fy) !== rgb('#000000') && room.back.d[fy * AW + fx]) continue;
    const v = (y / fr.h) * 1.3 - 0.3 + vnoise(x * 0.5, y * 0.4 - o.t * 6, 4) * 0.6;
    const k = o.fire * v;
    out.d[fy * AW + fx] = k > 0.85 ? rgb('#ffe58a') : k > 0.6 ? rgb('#ff9a2a') : k > 0.35 ? rgb('#c8401a') : y > fr.h * 0.7 ? (hash(x, y, Math.floor(o.t * 2)) < 0.3 ? rgb('#5a1a0a') : rgb('#1a0c08')) : rgb('#120a08');
  }
  for (let x = 1; x < fr.w; x += 3) for (let y = 0; y < fr.h; y++) out.px(fr.x + x, fr.y + y, C.ironL);
  // 석탄 양동이
  { const [bx, by] = room.bucket, s = room.f / 2.78, w = Math.round(s * 0.22), h = Math.round(s * 0.2), lvl = Math.min(1, o.fuel / 10);
    out.rect(bx - w / 2, by - h, w, h, (x, y) => (x < bx - w / 2 + 1 ? C.metalL : y < by - h + 1 ? C.metalL : C.metal));
    const coal = Math.round(h * 0.9 * lvl);
    for (let i = 0; i < coal * w * 0.7; i++) { const x = bx - w / 2 + 1 + hash(i, 1, 44) * (w - 2), y = by - h - coal * 0.5 + hash(i, 2, 44) * coal; out.px(x, y, hash(i, 3, 44) < 0.3 ? rgb('#4a4a50') : rgb('#16161a')); }
    out.line(bx - w / 2, by - h, bx - w / 2 + w * 0.4, by - h - h * 0.7, C.metalD); out.line(bx - w / 2 + w * 0.4, by - h - h * 0.7, bx + w / 2, by - h, C.metalD);
  }
  // 통조림(선반)
  for (let i = 0; i < Math.min(10, Math.floor(o.food)); i++) {
    const c = room.cans[i], w = Math.max(3, Math.round(c.s * 0.07)), h = Math.max(4, Math.round(c.s * 0.1)), x = Math.round(c.p[0] - w / 2), y = Math.round(c.p[1] - h);
    out.rect(x, y, w, h, (px, py) => (py === y ? C.metalL : py - y > h * 0.35 && py - y < h * 0.75 ? (i % 3 === 0 ? C.red : i % 3 === 1 ? rgb('#3a7a4a') : rgb('#d8a53a')) : px === x ? C.metalL : C.metal));
  }
  // 고양이
  if (o.cat) {
    const c = o.cat;
    if (c.body) out.blit(c.body, room.catSit[0] - 16 + c.dx, room.catSit[1] - c.body.h + c.dy, c.tint);
    const at = c.body ? [room.catSit[0], room.catSit[1] - c.body.h + 6] : room.catAt;
    out.blit(c.sprite, at[0] - c.sprite.w / 2 + c.dx, at[1] - c.sprite.h + c.dy, c.tint);
  }
  out.over(room.front);
  // 라디오 다이얼, 전구
  if (o.radioOn) { const [x, y] = room.dial; out.rect(x - 2, y - 1, 4, 2, rgb('#ffcf6a')); }
  const [bx, by] = room.bulb;
  out.ellipse(bx, by + 1, 3.6, 3, o.lampOn ? rgb('#fff2b8') : rgb('#8a8670'));
  // 조명
  light(out, room, o);
}
function blitScaled(out, sp, x0, y0, k, room) {
  const w = Math.round(sp.w * k), h = Math.round(sp.h * k);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = sp.d[Math.floor(y / k) * sp.w + Math.floor(x / k)]; if (v) clipPxRaw(out, room, x0 + x, y0 + y, v); }
}
function clipPxRaw(b, room, x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= b.w || y >= b.h || !room.winHole[y * room.AW + x]) return; b.d[y * b.w + x] = c; }
// 좀비가 창 구멍 밖으로 삐져나오지 않게: 구멍이 아닌 곳은 방이 덮는다(out.over가 처리) → 여기선 아무것도 안 함
function clipWindow() {}

function drawBarricade(out, room, o) {
  const r = room.winRect, lv = o.plates, hp = o.barricade;
  const plate = (x, y, w, h) => {
    out.rect(x, y, w, h, (px, py) => (py === Math.round(y) ? C.metalL : hash(px, py, 8) < 0.08 ? rgb('#7a4a2a') : C.metal));
    for (const [bx, by] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]]) out.px(bx, by, C.metalD);
  };
  if (lv >= 1) plate(r.x - 1, r.y + r.h - 5, r.w + 2, 5);
  if (lv >= 2) plate(r.x - 1, r.y - 1, r.w + 2, 4);
  if (lv >= 3) plate(r.x - 1, r.y, 5, r.h);
  if (lv >= 4) plate(r.x + r.w - 4, r.y, 5, r.h);
  if (lv >= 5) { out.line(r.x + 4, r.y + 4, r.x + r.w - 5, r.y + r.h - 6, C.metalD); out.line(r.x + 4, r.y + r.h - 6, r.x + r.w - 5, r.y + 4, C.metalD); }
  // 금: 내구도가 줄수록 늘어난다
  const cracks = hp >= 0.95 ? 0 : Math.ceil((1 - hp) * 7);
  const ox = r.x + r.w * 0.58, oy = r.y + r.h * 0.45;
  for (let i = 0; i < cracks; i++) {
    let x = ox, y = oy; const a = hash(i, 1, 55) * Math.PI * 2;
    for (let s = 0; s < 4; s++) { const nx = x + Math.cos(a + (hash(i, s, 56) - 0.5)) * r.w * 0.12, ny = y + Math.sin(a + (hash(i, s, 57) - 0.5)) * r.h * 0.12; out.line(x, y, nx, ny, (px, py) => (room.winHole[py * room.AW + px] ? rgb('#e8f0f4') : 0)); x = nx; y = ny; }
  }
  if (hp <= 0) out.ellipse(ox, oy, r.w * 0.16, r.h * 0.18, (x, y, u, v) => (u * u + v * v > 0.7 && room.winHole[y * room.AW + x] ? rgb('#e8f0f4') : 0));
}

// 조명: 주변광 + 스탠드 + 난로 + 창빛, 단계로 끊고 바이어 디더링
function light(out, room, o) {
  const { AW, AH, lampF, stoveF, winF, winHole } = room, d = out.d, dl = o.daylight;
  const amb = [0.42 + 0.34 * dl, 0.38 + 0.34 * dl, 0.48 + 0.22 * dl];
  const lamp = o.lampOn ? [0.75, 0.55, 0.28] : [0, 0, 0];
  const fl = o.fire * (0.85 + 0.15 * Math.sin(o.t * 13) * Math.sin(o.t * 7.3));
  const st = [1.1 * fl, 0.55 * fl, 0.22 * fl];
  const wn = [0.3 * dl, 0.3 * dl, 0.28 * dl];
  const fr = room.fireRect, glowOn = o.fire > 0;
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const i = y * AW + x;
    if (winHole[i] && !room.back.d[i] && isOutside(out, room, x, y)) continue;
    if (glowOn && x >= fr.x && x < fr.x + fr.w && y >= fr.y && y < fr.y + fr.h) continue;
    const a = lampF[i], s = stoveF[i], w = winF[i];
    const lr = amb[0] + lamp[0] * a + st[0] * s + wn[0] * w;
    const lg = amb[1] + lamp[1] * a + st[1] * s + wn[1] * w;
    const lb = amb[2] + lamp[2] * a + st[2] * s + wn[2] * w;
    const c = d[i];
    d[i] = pack(cR(c) * lr, cG(c) * lg, cB(c) * lb);
  }
  // 전구는 밝게 그대로
  const [bx, by] = room.bulb;
  if (o.lampOn) { out.ellipse(bx, by + 1, 3.6, 3, rgb('#ffe9a0')); out.ellipse(bx - 0.5, by + 0.5, 2, 1.6, rgb('#fffbe6')); }
  if (o.radioOn) { const [x, y] = room.dial; out.rect(x - 2, y - 1, 4, 2, rgb('#ffcf6a')); }
}
// 창 구멍 안의 픽셀이 바깥 풍경인지(철판·금은 방 안 물건이라 조명을 받는다)
function isOutside(out, room, x, y) {
  const r = room.winRect, lv = room._plates || 0;
  return !(lv >= 1 && y >= r.y + r.h - 5) && !(lv >= 2 && y < r.y + 3) && !(lv >= 3 && x < r.x + 4) && !(lv >= 4 && x >= r.x + r.w - 4);
}
