// 그림 장면: 받은 일러스트(배경·소년·코기·창밖)를 겹쳐 그린다. 좌표는 배경 그림(704×1520) 기준.
import { zombieSprite } from './pixel.js?v=2';

export const BG = {
  w: 704, h: 1520,
  win: { x: 263, y: 504, w: 178, h: 214 },
  fire: { x: 548, y: 912, w: 44, h: 58 },
  lamps: [{ x: 186, y: 1022, r: 260, k: 1 }, { x: 90, y: 418, r: 150, k: 0.6 }],
  stove: { x: 572, y: 945, r: 200 },
  sleep: { x: 200, y: 765, k: 0.8 },          // 자는 소년(베개를 배경 베개에 맞춤)
  sit: { cx: 322, by: 900, k: 0.72 },         // 앉은 소년
  corgi: { cx: 480, by: 1088, k: 0.3 },
};
const FILES = ['bg', 'front_day', 'front_dusk', 'front_night', 'front_station', 'front_station_night',
  'boy_sleep_1', 'boy_sleep_2', 'boy_idle_1', 'boy_idle_2', 'boy_blink', 'boy_happy', 'boy_scared', 'boy_eat_1', 'boy_eat_2', 'boy_cold', 'corgi'];
export const IMG = {};
export function loadImages(v = 1) {
  return Promise.all(FILES.map((n) => new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; ok(); };
    im.onerror = () => no(new Error(n));
    im.src = `./img/${n}.${n.startsWith('front_') ? 'jpg' : 'png'}?v=${v}`;
  })));
}

// 코드로 그린 좀비(픽셀 버퍼) → 캔버스
const zCache = {};
function zombieCanvas(variant, slap) {
  const key = `${variant}:${slap}`;
  if (zCache[key]) return zCache[key];
  const s = zombieSprite(48, slap, variant), c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const g = c.getContext('2d'), im = g.createImageData(s.w, s.h);
  new Uint32Array(im.data.buffer).set(s.d);
  g.putImageData(im, 0, 0);
  const w = document.createElement('canvas'); w.width = s.w; w.height = s.h;   // 맞았을 때 하얀 판
  const wg = w.getContext('2d'); wg.drawImage(c, 0, 0); wg.globalCompositeOperation = 'source-in'; wg.fillStyle = '#fff'; wg.fillRect(0, 0, s.w, s.h);
  return (zCache[key] = { c, w });
}

// ---------- 앞 창밖: 레일이 앞으로 흘러간다 ----------
// 앞을 본 그림(512×512, 소실점 VX·VY). 화면의 한 줄은 깊이 z = 1/(y−VY).
// 그림의 침목 간격이 고르지 않아서, 가장 선명한 앞쪽의 침목 한 칸(깊이 z0~z0+P)만 잘라
// 모든 깊이에 원근대로 이어 붙인다. 시간에 따라 깊이를 밀면 이음새 없이 계속 다가온다.
const FV = { size: 512, vx: 256, vy: 259, z0: 1 / (470 - 259), period: 0.00106, fadeTop: 300, fadeBot: 360 };
const frontCache = {};
let corridor = null;
function corridorMask() {
  if (corridor) return corridor;
  corridor = document.createElement('canvas'); corridor.width = corridor.height = FV.size;
  const m = corridor.getContext('2d');
  for (let i = 6; i >= 0; i--) {   // 가장자리를 겹겹이 옅게(흐림 효과 대신)
    const e = i * 7;
    m.globalAlpha = i === 0 ? 1 : 0.16;
    m.fillStyle = '#fff'; m.beginPath(); m.moveTo(FV.vx, FV.vy + 4); m.lineTo(26 - e, FV.size); m.lineTo(488 + e, FV.size); m.closePath(); m.fill();
  }
  // 먼 쪽(안개)은 원래 그림을 살린다: 소실점 근처에서 서서히 사라지게
  m.globalCompositeOperation = 'destination-in';
  const gr = m.createLinearGradient(0, FV.fadeTop, 0, FV.fadeBot);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  m.globalAlpha = 1; m.fillStyle = gr; m.fillRect(0, 0, FV.size, FV.size);
  return corridor;
}
function frontView(name, phase, moving) {
  const src = IMG[name];
  let c = frontCache[name];
  if (!c) {
    const mk = () => { const e = document.createElement('canvas'); e.width = e.height = FV.size; return e; };
    c = frontCache[name] = { r: mk(), t: mk() };
  }
  const R = c.r.getContext('2d');
  R.clearRect(0, 0, FV.size, FV.size); R.drawImage(src, 0, 0, FV.size, FV.size);
  if (!moving) return c.r;
  const T = c.t.getContext('2d'), P = FV.period, d = phase * P, k = src.width / FV.size;
  T.globalCompositeOperation = 'source-over'; T.clearRect(0, 0, FV.size, FV.size);
  // 깊이 z를 침목 한 칸 안으로 접어 그 줄을 가져온다
  const bandY = (z) => FV.vy + 1 / (FV.z0 + ((((z - FV.z0) % P) + P) % P));
  for (let y = FV.fadeTop; y < FV.size; y++) {
    const z = 1 / (y - FV.vy) + d, ys = bandY(z), r = (ys - FV.vy) / (y - FV.vy);
    T.drawImage(src, (FV.vx - FV.vx * r) * k, ys * k, FV.size * r * k, Math.max(0.6, r) * k, 0, y, FV.size, 1.02);
  }
  T.globalCompositeOperation = 'destination-in'; T.drawImage(corridorMask(), 0, 0);
  R.drawImage(c.t, 0, 0);
  return c.r;
}

// 앞 그림(512) 좌표 → 배경 좌표(역 간판 글자 자리 등)
export function frontToBg(x, y) {
  const W = BG.win, fm = (W.w * 1.4) / FV.size;
  return [W.x + W.w / 2 + (x - FV.vx) * fm, W.y + W.h * 0.45 + (y - FV.vy) * fm];
}
export const SIGN = { x: 380, y: 148, w: 90 };   // 역 그림의 초록 간판

let light = null;
// o: { t, daylight, scroll, rain, station, zombie:{k, hit, slap, variant}, fireOn, plates, barricade(0~1), boy, corgi:{dx, dy, sx, sy} }
export function drawScene(g, o) {
  const W = BG.win;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, BG.w, BG.h);
  // --- 창밖 ---
  g.save();
  g.beginPath(); g.rect(W.x - 2, W.y - 2, W.w + 4, W.h + 4); g.clip();
  const dl = o.daylight, dusk = dl > 0 && dl < 1 ? 1 - Math.abs(dl - 0.5) * 2 : 0;
  // 소실점을 창 가운데 조금 위에 두고 그림을 창보다 넉넉하게 놓는다
  const FW = W.w * 1.4, fm = FW / FV.size, vpx = W.x + W.w / 2, vpy = W.y + W.h * 0.45 + (o.station ? 0 : Math.sin(o.t * 9) * 0.6);
  const fx0 = vpx - FV.vx * fm, fy0 = vpy - FV.vy * fm;
  const moving = !o.station && o.speed > 0, phase = ((o.scroll / 17) % 1 + 1) % 1;
  const layer = (name, a) => { if (!IMG[name] || a <= 0.01) return; g.globalAlpha = a; g.drawImage(frontView(name, phase, moving), fx0, fy0, FW, FW); g.globalAlpha = 1; };
  // 위에 덮이는 그림이 완전히 불투명하면 아래 그림은 건너뛴다(창밖은 매 프레임 다시 계산해서 무겁다)
  if (o.station) { if (dl < 0.99) layer('front_station_night', 1); layer('front_station', dl); }
  else { if (dl < 0.99) layer('front_night', 1); layer('front_day', dl); layer('front_dusk', dusk); }
  if (o.rain) {
    g.strokeStyle = dl > 0.5 ? 'rgba(220,226,232,0.55)' : 'rgba(150,170,200,0.5)'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < 46; i++) { const x = W.x + ((i * 53.7 + o.t * 60) % W.w), y = W.y + ((i * 97.3 + o.t * 420) % W.h); g.moveTo(x, y); g.lineTo(x - 4, y - 12); }
    g.stroke();
  }
  // 창에 붙은 좀비
  if (o.zombie) {
    const z = o.zombie, sp = zombieCanvas(z.variant, z.slap), k = 0.08 + 0.92 * z.k * z.k;
    const w = W.w * 0.86 * k, h = (w * sp.c.height) / sp.c.width;
    // 레일 저 앞(소실점)에서 다가와 창에 붙는다
    const ex = W.x + W.w / 2, ey = W.y + W.h - h * 0.9;
    const x = (z.k < 1 ? vpx + (ex - vpx) * z.k * z.k : ex) - w / 2 + (z.hit ? Math.sin(o.t * 90) * 4 : 0);
    const y = z.k < 1 ? vpy + (ey + h * 0.5 - vpy) * z.k * z.k - h * 0.5 : ey + Math.sin(o.t * 6) * 2;
    g.imageSmoothingEnabled = false;
    g.drawImage(sp.c, x, y, w, h);
    if (z.hit) { g.globalAlpha = 0.7; g.drawImage(sp.w, x, y, w, h); g.globalAlpha = 1; }
    g.imageSmoothingEnabled = true;
  }
  // 유리 반사, 금, 철판
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath(); g.moveTo(W.x + 20, W.y + W.h); g.lineTo(W.x + 70, W.y); g.lineTo(W.x + 95, W.y); g.lineTo(W.x + 45, W.y + W.h); g.fill();
  // 유리 금: 배경 그림의 픽셀 크기(약 3)에 맞춘 각진 점선, 창밖이 비쳐 보이게 옅게
  const cracks = o.barricade >= 0.95 ? 0 : Math.ceil((1 - o.barricade) * 6);
  if (cracks) {
    const PX = 3, dots = new Set();
    const seg = (x0, y0, x1, y1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / PX);
      for (let i = 0; i <= n; i++) dots.add(`${Math.round((x0 + (x1 - x0) * i / n) / PX)},${Math.round((y0 + (y1 - y0) * i / n) / PX)}`);
    };
    const ox = W.x + W.w * 0.6, oy = W.y + W.h * 0.42;
    for (let i = 0; i < cracks; i++) {
      let x = ox, y = oy; const a = i * 2.39 + 0.4;
      for (let k = 0; k < 4; k++) {
        const nx = x + Math.cos(a + Math.sin(i * 7 + k) * 0.5) * W.w * 0.085, ny = y + Math.sin(a + Math.cos(i * 5 + k) * 0.5) * W.h * 0.08;
        seg(x, y, nx, ny); x = nx; y = ny;
      }
    }
    if (o.barricade <= 0) for (let k = 0; k < 24; k++) { const t0 = (k / 24) * Math.PI * 2, t1 = ((k + 1) / 24) * Math.PI * 2; seg(ox + Math.cos(t0) * W.w * 0.13, oy + Math.sin(t0) * W.h * 0.11, ox + Math.cos(t1) * W.w * 0.13, oy + Math.sin(t1) * W.h * 0.11); }
    g.fillStyle = 'rgba(20,26,32,0.28)';
    for (const d of dots) { const [px, py] = d.split(',').map(Number); g.fillRect(px * PX + 1, py * PX + 1, PX, PX); }
    g.fillStyle = 'rgba(226,236,240,0.55)';
    for (const d of dots) { const [px, py] = d.split(',').map(Number); g.fillRect(px * PX, py * PX, PX, PX); }
  }
  const plate = (x, y, w, h) => {
    g.fillStyle = '#5c5a58'; g.fillRect(x, y, w, h);
    g.fillStyle = '#7a4a2a'; g.globalAlpha = 0.35; g.fillRect(x, y + h * 0.6, w, h * 0.4); g.globalAlpha = 1;
    g.fillStyle = '#8c8a86'; g.fillRect(x, y, w, 2);
    g.fillStyle = '#2e2d2c'; for (const [bx, by] of [[x + 4, y + 4], [x + w - 7, y + 4], [x + 4, y + h - 7], [x + w - 7, y + h - 7]]) g.fillRect(bx, by, 3, 3);
  };
  const lv = o.plates;
  if (lv >= 1) plate(W.x - 2, W.y + W.h - 26, W.w + 4, 28);
  if (lv >= 2) plate(W.x - 2, W.y - 2, W.w + 4, 22);
  if (lv >= 3) plate(W.x - 2, W.y, 24, W.h);
  if (lv >= 4) plate(W.x + W.w - 22, W.y, 24, W.h);
  if (lv >= 5) { g.strokeStyle = '#3a3836'; g.lineWidth = 7; g.beginPath(); g.moveTo(W.x + 20, W.y + 20); g.lineTo(W.x + W.w - 20, W.y + W.h - 28); g.moveTo(W.x + 20, W.y + W.h - 28); g.lineTo(W.x + W.w - 20, W.y + 20); g.stroke(); }
  g.restore();
  // --- 방 ---
  g.drawImage(IMG.bg, 0, 0);
  // 난로: 꺼지면 불창을 덮고, 켜져 있으면 불빛이 일렁인다
  const F = BG.fire;
  if (!o.fireOn) {
    g.fillStyle = 'rgba(18,12,10,0.92)'; g.fillRect(F.x, F.y, F.w, F.h);
    g.fillStyle = 'rgba(120,40,16,0.5)'; g.fillRect(F.x + 6, F.y + F.h - 10, F.w - 12, 5);
  } else {
    const fl = 0.5 + 0.5 * Math.sin(o.t * 11) * Math.sin(o.t * 6.7);
    const gr = g.createRadialGradient(F.x + F.w / 2, F.y + F.h * 0.6, 4, F.x + F.w / 2, F.y + F.h * 0.6, 90);
    gr.addColorStop(0, `rgba(255,170,70,${0.18 + 0.12 * fl})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(F.x - 90, F.y - 90, F.w + 180, F.h + 180); g.globalCompositeOperation = 'source-over';
  }
  // --- 소년 ---
  const b = o.boy;
  if (b && IMG[b.img]) {
    const im = IMG[b.img];
    if (b.img.startsWith('boy_sleep')) { const S = BG.sleep; g.drawImage(im, S.x, S.y + b.dy, im.width * S.k, im.height * S.k); }
    else { const S = BG.sit, w = im.width * S.k, h = im.height * S.k; g.drawImage(im, S.cx - w / 2 + b.dx, S.by - h + b.dy, w, h); }
  }
  // --- 코기(앞모습 한 장을 움직임으로 살림) ---
  const c = o.corgi;
  if (c && IMG.corgi) {
    const im = IMG.corgi, S = BG.corgi, w = im.width * S.k * c.sx, h = im.height * S.k * c.sy;
    g.drawImage(im, S.cx - w / 2 + c.dx, S.by - h + c.dy, w, h);
  }
  // --- 밤 조명: 어둡게 덮고 스탠드·난로 자리만 밝게 ---
  const dark = (1 - dl) * 0.62;
  if (dark > 0.01) {
    if (!light) { light = document.createElement('canvas'); light.width = 176; light.height = 380; }
    const L = light.getContext('2d'), s = 176 / BG.w;
    L.globalCompositeOperation = 'source-over'; L.clearRect(0, 0, 176, 380);
    L.fillStyle = `rgba(12,16,42,${dark})`; L.fillRect(0, 0, 176, 380);
    L.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, k) => { const gr = L.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s); gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(0.5, `rgba(0,0,0,${k * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = gr; L.fillRect(0, 0, 176, 380); };
    for (const lp of BG.lamps) hole(lp.x, lp.y, lp.r, lp.k);
    if (o.fireOn) hole(BG.stove.x, BG.stove.y, BG.stove.r * (0.95 + 0.05 * Math.sin(o.t * 9)), 0.85);
    hole(W.x + W.w / 2, W.y + W.h / 2, 120, 0.35);
    g.drawImage(light, 0, 0, BG.w, BG.h);
    // 스탠드 불빛을 따뜻하게
    g.globalCompositeOperation = 'lighter';
    for (const lp of BG.lamps) { const gr = g.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, lp.r * 0.8); gr.addColorStop(0, `rgba(255,180,90,${0.16 * dark * lp.k})`); gr.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = gr; g.fillRect(lp.x - lp.r, lp.y - lp.r, lp.r * 2, lp.r * 2); }
    g.globalCompositeOperation = 'source-over';
  }
}
