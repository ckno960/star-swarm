// 픽셀 아트: 낮은 해상도 버퍼에 픽셀을 직접 찍어 캔버스로 만든다(안티에일리어싱 없음).
import { HATS, SHIRTS, personH, ppm } from './logic.js';

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
const cR = (c) => c & 255, cG = (c) => (c >> 8) & 255, cB = (c) => (c >> 16) & 255;
const pack = (r, g, b, a = 255) => ((a << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
const mix = (a, b, k) => pack(cR(a) + (cR(b) - cR(a)) * k, cG(a) + (cG(b) - cG(a)) * k, cB(a) + (cB(b) - cB(a)) * k);
const mul = (c, k) => pack(cR(c) * k, cG(c) * k, cB(c) * k);
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];

class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  px(x, y, c) { x |= 0; y |= 0; if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const v = typeof c === 'function' ? c(xx, yy) : c; if (v) this.d[yy * this.w + xx] = v; }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry; if (u * u + v * v <= 1) this.px(x, y, typeof c === 'function' ? c(x, y, u, v) : c);
    }
  }
  canvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const g = c.getContext('2d'), im = g.createImageData(this.w, this.h);
    new Uint32Array(im.data.buffer).set(this.d); g.putImageData(im, 0, 0);
    return c;
  }
}
function outline(s, col) {
  const o = s.d.slice();
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (o[y * s.w + x]) continue;
    if ((x > 0 && o[y * s.w + x - 1]) || (x < s.w - 1 && o[y * s.w + x + 1]) || (y > 0 && o[(y - 1) * s.w + x]) || (y < s.h - 1 && o[(y + 1) * s.w + x])) s.d[y * s.w + x] = col;
  }
}

// ---------- 시간대 팔레트 ----------
export const PAL = {
  day: { sky0: '#5a96d8', sky1: '#bfe0f2', far: '#93a8bc', farWin: '#aebfce', farLit: '#aebfce', haze: 0.0, sun: '#fff6c8', light: 1, winOff: '#3a4656', winLit: '#e8d8a0', road: '#4c4c52', walk: '#b9b2a4', walk2: '#a8a094', curb: '#8a857a', tree: '#4a8a3e', treeD: '#2e6a2e' },
  dusk: { sky0: '#3a2a62', sky1: '#f2955a', far: '#6a5478', farWin: '#7a6488', farLit: '#f0b060', haze: 0.15, sun: '#ffb070', light: 0.82, winOff: '#2c2a3a', winLit: '#f4c070', road: '#3c3640', walk: '#8a7c78', walk2: '#7a6e6c', curb: '#6a5e5c', tree: '#3a5a3a', treeD: '#243c26' },
  night: { sky0: '#070b1c', sky1: '#1c2846', far: '#161c2c', farWin: '#1c2436', farLit: '#e8c060', haze: 0.0, sun: '#e8e8d8', light: 0.42, winOff: '#141822', winLit: '#f2d47a', road: '#1e1e26', walk: '#3a3a44', walk2: '#33333c', curb: '#2a2a30', tree: '#1a2a20', treeD: '#101a14' },
};
const BRICK = ['#a4533a', '#b88a5a', '#7a8a9a'];

// ---------- 사람 ----------
const spriteCache = new Map();
// h: 키(픽셀), frame: 걸음 0~3, tint: 밝기(밤·노을), walking: 걷는 중
export function personSprite(t, h, frame, tint, walking) {
  const f = walking ? Math.floor(frame) % 4 : 0, key = `${t.hat}|${t.shirt}|${t.acc}|${t.pants}|${t.skin}|${t.hair}|${h}|${f}|${tint.toFixed(2)}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const pad = Math.max(2, Math.round(h * 0.25)), top = t.acc === 'umbrella' ? Math.round(h * 0.28) : 1;
  const w = Math.max(3, Math.round(h * 0.38)), W = w + pad * 2, H = h + top + 1, s = new Buf(W, H);
  const T = (hex) => mul(rgb(hex), tint);
  const skin = T(t.skin), hair = T(t.hair), shirt = T(SHIRTS.find((x) => x.id === t.shirt).c), pants = T(t.pants), shoe = T('#1c1a1a');
  const cx = Math.floor(W / 2), y0 = top;
  const hh = Math.max(2, Math.round(h * 0.17)), hw = Math.max(2, Math.round(h * 0.15));
  const tw = Math.max(3, Math.round(h * 0.3)), torso0 = y0 + hh + (h >= 14 ? 1 : 0), torso1 = y0 + Math.round(h * 0.55);
  const legW = Math.max(1, Math.round(tw / 2) - (tw >= 4 ? 0 : 0));
  // 다리(걸을 때 앞뒤로)
  const swing = walking ? [0, 1, 0, -1][f] : 0;
  const legTop = torso1, legBot = y0 + h - 1;
  const lx = cx - Math.ceil(tw / 2), rx = cx + Math.floor(tw / 2) - legW;
  s.rect(lx - swing, legTop, legW, legBot - legTop, pants);
  s.rect(rx + swing, legTop, legW, legBot - legTop, (x, y) => (h >= 12 && x === rx + swing + legW - 1 ? mul(pants, 0.8) : pants));
  s.rect(lx - swing - (h >= 14 ? 1 : 0), legBot, legW + (h >= 14 ? 1 : 0), 1, shoe);
  s.rect(rx + swing, legBot, legW + (h >= 14 ? 1 : 0), 1, shoe);
  // 몸통과 팔
  s.rect(cx - Math.ceil(tw / 2), torso0, tw, torso1 - torso0, (x) => (h >= 12 && x === cx + Math.floor(tw / 2) - 1 ? mul(shirt, 0.82) : shirt));
  const armLen = Math.round(h * 0.33), arm = mul(shirt, 0.88);
  for (const [ax, sw] of [[cx - Math.ceil(tw / 2) - 1, swing], [cx + Math.floor(tw / 2), -swing]]) {
    s.rect(ax, torso0 + (h >= 14 ? 1 : 0) + Math.max(0, sw), 1, armLen - 1, arm);
    s.px(ax, torso0 + armLen + Math.max(0, sw), skin);
  }
  // 목, 머리, 머리카락
  s.rect(cx - Math.floor(hw / 2), y0, hw, hh, skin);
  if (h >= 14) s.px(cx - Math.floor(hw / 2) + hw - 1, y0 + hh - 1, mul(skin, 0.85));
  s.rect(cx - Math.floor(hw / 2), y0, hw, Math.max(1, Math.round(hh * 0.35)), hair);
  if (h >= 12) { s.px(cx - Math.floor(hw / 2) - 0, y0 + 1, hair); }
  if (t.acc === 'glasses' && h >= 9) s.rect(cx - Math.floor(hw / 2), y0 + Math.round(hh * 0.45), hw, 1, T('#101014'));
  else if (h >= 16) { s.px(cx - 1, y0 + Math.round(hh * 0.5), T('#2a1a14')); s.px(cx + 1, y0 + Math.round(hh * 0.5), T('#2a1a14')); }
  // 모자
  const hat = HATS.find((x) => x.id === t.hat);
  if (hat.c) {
    const hc = T(hat.c), hTop = y0 - (t.hat === 'black' ? 1 : 0);
    s.rect(cx - Math.floor(hw / 2), hTop, hw, Math.max(1, Math.round(hh * 0.45)), hc);
    if (t.hat === 'black') s.rect(cx - Math.floor(hw / 2) - 1, hTop + Math.max(1, Math.round(hh * 0.45)), hw + 2, 1, hc);
    else s.rect(cx - Math.floor(hw / 2), y0 + Math.max(1, Math.round(hh * 0.45)) - 1, hw + 1, 1, mul(hc, 0.8));
  }
  // 소지품
  if (t.acc === 'case') { const by = torso0 + armLen - 1; s.rect(cx + Math.floor(tw / 2) - 1, by, Math.max(2, Math.round(h * 0.18)), Math.max(2, Math.round(h * 0.12)), T('#5a3a1a')); }
  if (t.acc === 'bag') { s.rect(cx - Math.ceil(tw / 2) - Math.max(1, Math.round(h * 0.1)) - 1, torso0 + 1, Math.max(1, Math.round(h * 0.12)), Math.max(2, Math.round(h * 0.25)), T('#3a5a3a')); }
  if (t.acc === 'umbrella') {
    const ur = Math.max(3, Math.round(h * 0.34)), uy = top + 1, ux = cx + 1;
    s.ellipse(ux, uy + ur * 0.55, ur, ur * 0.55, (x, y) => (y <= uy + ur * 0.55 ? (hash(x, 0, 3) < 0.5 ? T('#2a2a38') : T('#3a3a4c')) : 0));
    s.rect(ux, uy + Math.round(ur * 0.5), 1, torso0 - uy - Math.round(ur * 0.5) + 2, T('#2a2a2a'));
  }
  if (h >= 12) outline(s, pack(18, 14, 18, 200));
  c = s.canvas();
  spriteCache.set(key, c);
  return c;
}
// 브리핑용 큰 초상(사람을 크게 다시 그림)
export function portrait(t) { return personSprite(t, 40, 0, 1, false); }

// ---------- 차 ----------
const carCache = new Map();
export function carSprite(color, d, dir, tint) {
  const k = ppm(d), len = Math.round(4.4 * k), hgt = Math.round(1.5 * k), key = `${color}|${len}|${dir}|${tint.toFixed(2)}`;
  if (carCache.has(key)) return carCache.get(key);
  const s = new Buf(len, hgt + 2), body = mul(rgb(color), tint), glass = mul(rgb('#8ab0c8'), tint), dark = mul(rgb('#141416'), tint);
  const roof0 = Math.round(len * 0.22), roof1 = Math.round(len * 0.72), mid = Math.round(hgt * 0.45);
  s.rect(0, mid, len, hgt - mid - 1, (x, y) => (y === mid ? mix(body, rgb('#ffffff'), 0.25) : body));
  s.rect(roof0, 1, roof1 - roof0, mid, body);
  s.rect(roof0 + 2, 2, Math.round((roof1 - roof0) / 2) - 3, mid - 2, glass);
  s.rect(roof0 + Math.round((roof1 - roof0) / 2) + 1, 2, Math.round((roof1 - roof0) / 2) - 3, mid - 2, glass);
  const wr = Math.max(2, Math.round(hgt * 0.22));
  for (const wx of [Math.round(len * 0.2), Math.round(len * 0.8)]) s.ellipse(wx, hgt - wr + 1, wr, wr, (x, y, u, v) => (u * u + v * v < 0.25 ? mul(rgb('#8a8a8a'), tint) : dark));
  s.rect(dir > 0 ? len - 2 : 0, mid + 1, 2, 2, rgb(tint < 0.6 ? '#fff4b0' : '#f4f0d0'));
  outline(s, pack(16, 14, 16, 200));
  const c = s.canvas(); carCache.set(key, c); return c;
}

// ---------- 배경 ----------
// 정적인 층: back(하늘·먼 빌딩), mid(맞은편 건물, 창 안쪽 포함), frames(창틀), street(거리), front(가로등 등 앞쪽)
export function buildWorld(L, time, seed = 1) {
  const P = PAL[time], { AW, AH } = L;
  const back = new Buf(AW, AH), mid = new Buf(AW, AH), frames = new Buf(AW, AH), street = new Buf(AW, AH), front = new Buf(AW, AH);
  const C = (h) => rgb(h);
  // 하늘(띠 디더링)
  const s0 = C(P.sky0), s1 = C(P.sky1), skyB = L.farBase;
  for (let y = 0; y < skyB; y++) for (let x = 0; x < AW; x++) { const k = Math.min(1, y / (skyB * 0.95)); back.d[y * AW + x] = mix(s0, s1, Math.floor(k * 7 + bay(x, y)) / 7); }
  if (time === 'night') for (let i = 0; i < 90; i++) back.px(hash(i, 1, seed) * AW, hash(i, 2, seed) * skyB * 0.8, hash(i, 3) < 0.3 ? C('#ffffff') : C('#8a92b0'));
  const sunX = AW * (time === 'dusk' ? 0.7 : 0.82), sunY = time === 'dusk' ? skyB * 0.62 : skyB * 0.25;
  back.ellipse(sunX, sunY, time === 'day' ? 9 : 7, time === 'day' ? 9 : 7, (x, y, u, v) => (time === 'night' && u > 0.25 ? 0 : C(P.sun)));
  if (time !== 'night') for (let i = 0; i < 5; i++) { const cx = hash(i, 4, seed) * AW, cy = skyB * (0.15 + hash(i, 5, seed) * 0.4), w = 18 + hash(i, 6, seed) * 26; for (let k = 0; k < 4; k++) back.ellipse(cx + (k - 1.5) * w * 0.3, cy - (k % 2) * 3, w * 0.28, 4 + (k % 2) * 2, mix(C('#ffffff'), s1, time === 'dusk' ? 0.5 : 0.15)); }
  // 먼 빌딩(실루엣, 작은 창, 옥상 물탱크·안테나)
  const far = C(P.far);
  for (const b of L.far) {
    const top = b.top, col = mix(far, s1, 0.12 + hash(b.x, 1) * 0.12);
    back.rect(b.x, top, b.w, L.farBase + 60 - top, col);
    back.rect(b.x, top, b.w, 1, mix(col, C('#ffffff'), 0.15));
    for (let y = top + 4; y < L.farBase + 50; y += 5) for (let x = b.x + 2; x < b.x + b.w - 2; x += 4) back.rect(x, y, 2, 2, time !== 'day' && hash(x, y, 7) < 0.35 ? C(P.farLit) : C(P.farWin));
    if (hash(b.x, 2) < 0.4) { back.rect(b.x + 4, top - 6, 7, 5, mul(col, 0.8)); back.rect(b.x + 5, top - 1, 1, 1, mul(col, 0.7)); back.rect(b.x + 9, top - 1, 1, 1, mul(col, 0.7)); }
    if (hash(b.x, 3) < 0.35) back.rect(b.x + b.w - 5, top - 9, 1, 9, mul(col, 0.7));
  }
  // 맞은편 건물 3채
  const lightK = P.light;
  for (const b of L.mid) {
    const base = C(BRICK[b.i]), wall = mul(base, 0.6 + 0.4 * lightK);
    mid.rect(b.x, b.top, b.w, L.midBase - b.top, (x, y) => {
      if (b.i === 0) { const row = Math.floor((y - b.top) / 3), off = row % 2 ? 3 : 0; return (y - b.top) % 3 === 0 || (x - b.x + off) % 6 === 0 ? mul(wall, 0.82) : (hash(x, y, 9) < 0.06 ? mul(wall, 0.92) : wall); }
      if (b.i === 1) return (x - b.x) % 22 === 0 || (y - b.top) % 30 === 0 ? mul(wall, 0.85) : wall;
      return (x - b.x) % 12 === 0 ? mul(wall, 0.8) : (hash(x >> 2, y >> 3, 4) < 0.12 ? mul(wall, 0.92) : wall);
    });
    mid.rect(b.x - 2, b.top - 3, b.w + 4, 4, mul(wall, 0.75));                        // 옥상 난간
    mid.rect(b.x + b.w - 18, b.top - 9, 12, 6, mul(C('#8a8a90'), lightK));            // 실외기
    // 1층 가게: 차양과 간판
    const shopY = L.midBase - 22;
    mid.rect(b.x, shopY, b.w, 22, mul(wall, 0.7));
    mid.rect(b.x + 6, shopY + 7, b.w - 12, 15, mul(C('#2a3240'), lightK + 0.1));
    const aw = C(['#c84a3a', '#3a8a5a', '#d8a83a'][b.i]);
    mid.rect(b.x + 4, shopY + 2, b.w - 8, 5, (x) => ((x >> 2) % 2 ? mul(aw, lightK) : mul(C('#f0ece0'), lightK)));
    if (time === 'night') mid.rect(b.x + 8, shopY + 9, b.w - 16, 11, C('#f2d880'));
    // 창 안쪽(불 켜진 방은 따뜻한 색, 블라인드·화분 약간)
    for (const w of b.wins) {
      const lit = time === 'day' ? true : w.lit, inner = lit ? (time === 'day' ? mix(C('#6a7a8a'), C('#a8b8c8'), 0.3) : C(P.winLit)) : C(P.winOff);
      mid.rect(w.x, w.y, w.w, w.h, (x, y) => (time === 'day' && (x - w.x + (y - w.y)) % 9 < 2 ? mix(inner, C('#ffffff'), 0.25) : y > w.y + w.h - 3 ? mul(inner, 0.8) : inner));
      if (lit && time !== 'day' && hash(w.x, w.y) < 0.4) mid.rect(w.x + 2, w.y + 2, 2, 3, mul(C('#fff0b0'), 1));
    }
    // 창틀: 테두리, 가운데 창살, 창턱, 커튼 자락
    for (const w of b.wins) {
      const fr = mul(C('#e8e4d8'), 0.55 + 0.45 * lightK), sh = mul(fr, 0.7);
      frames.rect(w.x - 1, w.y - 1, w.w + 2, 1, fr); frames.rect(w.x - 1, w.y + w.h, w.w + 2, 1, fr);
      frames.rect(w.x - 1, w.y, 1, w.h, fr); frames.rect(w.x + w.w, w.y, 1, w.h, sh);
      frames.rect(w.x + Math.floor(w.w / 2), w.y, 1, w.h, fr);
      frames.rect(w.x - 2, w.y + w.h + 1, w.w + 4, 2, mul(fr, 0.85));
      if (hash(w.x, w.y, 2) < 0.5) { const cc = mul(C(['#c86a5a', '#d8c08a', '#6a8ab8'][Math.floor(hash(w.x, 3) * 3)]), 0.6 + 0.4 * lightK); frames.rect(w.x, w.y, 2, w.h, cc); frames.rect(w.x + w.w - 2, w.y, 2, w.h, cc); }
    }
  }
  // 거리: 먼 인도, 도로(차선·횡단보도), 가까운 인도
  const walk = C(P.walk), walk2 = C(P.walk2), road = C(P.road), curb = C(P.curb);
  street.rect(0, L.farSide, AW, L.road0 - L.farSide, (x, y) => ((x >> 3) + (y >> 2)) % 2 ? walk : walk2);
  street.rect(0, L.road0 - 2, AW, 2, curb);
  street.rect(0, L.road0, AW, L.road1 - L.road0, (x, y) => (hash(x, y, 5) < 0.05 ? mul(road, 1.15) : road));
  const midY = Math.round((L.road0 + L.road1) / 2);
  for (let x = 0; x < AW; x += 24) street.rect(x, midY, 12, 1, mul(C('#e8e4d0'), 0.5 + 0.5 * lightK));
  for (let i = 0; i < 6; i++) street.rect(AW * 0.62 + i * 7, L.road0 + 2, 4, L.road1 - L.road0 - 4, mul(C('#e8e4d0'), 0.5 + 0.5 * lightK));
  street.rect(0, L.road1, AW, 2, curb);
  street.rect(0, L.road1 + 2, AW, AH - L.road1 - 2, (x, y) => ((x >> 4) + (y >> 3)) % 2 ? walk : walk2);
  // 먼 인도 가로수
  for (let x = 20; x < AW; x += 70) {
    street.rect(x, L.farSide - 6, 2, 10, mul(C('#5a3e2a'), lightK + 0.1));
    street.ellipse(x + 1, L.farSide - 14, 9, 8, (px, py, u, v) => (u + v < -0.3 ? mul(C(P.tree), 1.15) : hash(px, py, 6) < 0.25 ? C(P.treeD) : C(P.tree)));
  }
  // 가까운 인도 가로등(앞쪽 층)
  for (let x = 46; x < AW; x += 110) {
    front.rect(x, L.road1 - 30, 2, AH - L.road1 + 30, mul(C('#3a3a40'), 0.6 + 0.4 * lightK));
    front.rect(x - 5, L.road1 - 32, 10, 3, mul(C('#3a3a40'), 0.6 + 0.4 * lightK));
    front.rect(x - 3, L.road1 - 29, 6, 1, time === 'day' ? C('#c8c8c0') : C('#fff2b0'));
  }
  return { back: back.canvas(), mid: mid.canvas(), frames: frames.canvas(), street: street.canvas(), front: front.canvas(), pal: P };
}

// 사람 밝기: 밤엔 가로등 아래·불 켜진 창만 밝다
export function personTint(p, L, time) {
  const P = PAL[time];
  if (time === 'day') return 1;
  if (p.zone === 'window') { const b = L.mid[p.b], w = b.wins.find((wn) => wn.floor === p.floor && p.x > wn.x - 2 && p.x < wn.x + wn.w + 2); return w && w.lit ? (time === 'night' ? 0.95 : 0.9) : P.light; }
  if (p.zone === 'street') return time === 'night' ? 0.58 : 0.85;
  return P.light;
}
export { personH };
