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
const FILES = ['bg', 'out_day', 'out_dusk', 'out_night', 'out_station_day', 'out_station_night',
  'boy_sleep_1', 'boy_sleep_2', 'boy_idle_1', 'boy_idle_2', 'boy_blink', 'boy_happy', 'boy_scared', 'boy_eat_1', 'boy_eat_2', 'boy_cold', 'corgi'];
export const IMG = {};
export function loadImages(v = 1) {
  return Promise.all(FILES.map((n) => new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; ok(); };
    im.onerror = () => no(new Error(n));
    im.src = `./img/${n}.${n.startsWith('out_') ? 'jpg' : 'png'}?v=${v}`;
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
  const strip = (im, a, speed) => {
    if (!im || a <= 0.01) return;
    const h = W.h * 1.25, w = (im.width * h) / im.height, y = W.y - (h - W.h) * 0.55;
    let x = W.x - (((o.scroll * speed) % w) + w) % w;
    g.globalAlpha = a;
    for (; x < W.x + W.w; x += w) g.drawImage(im, x, y, w + 1, h);
    g.globalAlpha = 1;
  };
  if (o.station) { strip(IMG.out_station_night, 1, 0); strip(IMG.out_station_day, dl, 0); }
  else { strip(IMG.out_night, 1, 1); strip(IMG.out_day, dl, 1); strip(IMG.out_dusk, dusk, 1); }
  if (o.rain) {
    g.strokeStyle = dl > 0.5 ? 'rgba(220,226,232,0.55)' : 'rgba(150,170,200,0.5)'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < 46; i++) { const x = W.x + ((i * 53.7 + o.t * 60) % W.w), y = W.y + ((i * 97.3 + o.t * 420) % W.h); g.moveTo(x, y); g.lineTo(x - 4, y - 12); }
    g.stroke();
  }
  // 창에 붙은 좀비
  if (o.zombie) {
    const z = o.zombie, sp = zombieCanvas(z.variant, z.slap), k = 0.3 + 0.7 * z.k;
    const w = W.w * 0.86 * k, h = (w * sp.c.height) / sp.c.width;
    const x = W.x + W.w / 2 - w / 2 + (z.hit ? Math.sin(o.t * 90) * 4 : 0);
    const y = z.k < 1 ? W.y + W.h * 0.55 - h * 0.5 * k : W.y + W.h - h * 0.9 + Math.sin(o.t * 6) * 2;
    g.imageSmoothingEnabled = false;
    g.drawImage(sp.c, x, y, w, h);
    if (z.hit) { g.globalAlpha = 0.7; g.drawImage(sp.w, x, y, w, h); g.globalAlpha = 1; }
    g.imageSmoothingEnabled = true;
  }
  // 유리 반사, 금, 철판
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath(); g.moveTo(W.x + 20, W.y + W.h); g.lineTo(W.x + 70, W.y); g.lineTo(W.x + 95, W.y); g.lineTo(W.x + 45, W.y + W.h); g.fill();
  const cracks = o.barricade >= 0.95 ? 0 : Math.ceil((1 - o.barricade) * 7);
  if (cracks) {
    g.strokeStyle = 'rgba(235,242,246,0.85)'; g.lineWidth = 1.6;
    const ox = W.x + W.w * 0.6, oy = W.y + W.h * 0.42;
    for (let i = 0; i < cracks; i++) {
      let x = ox, y = oy; const a = i * 2.39 + 0.4;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += Math.cos(a + Math.sin(i * 7 + s) * 0.5) * W.w * 0.11; y += Math.sin(a + Math.cos(i * 5 + s) * 0.5) * W.h * 0.1; g.lineTo(x, y); }
      g.stroke();
    }
    if (o.barricade <= 0) { g.beginPath(); g.ellipse(ox, oy, W.w * 0.15, W.h * 0.13, 0, 0, Math.PI * 2); g.stroke(); }
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
