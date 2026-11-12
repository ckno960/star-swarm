// 럭키 셀: 슬롯머신 로그라이크 규칙 (화면과 분리, node --test로 검사)
// 5×3 슬롯을 직접 돌려 기한마다 불어나는 빚을 갚는다. 라운드 사이에 부적을 사서 확률·배당을 바꾼다.
// 빚을 못 갚으면 끝. 끝나면 별을 받아 영구 강화를 산다(환생).

export const COLS = 5, ROWS = 3;
export const SYMBOLS = [
  { id: 'lemon', icon: '🍋', w: 6, v: 10 }, { id: 'cherry', icon: '🍒', w: 6, v: 10 }, { id: 'clover', icon: '🍀', w: 5, v: 15 },
  { id: 'bell', icon: '🔔', w: 4, v: 20 }, { id: 'diamond', icon: '💎', w: 3, v: 30 }, { id: 'seven', icon: '7️⃣', w: 2, v: 50 },
  { id: 'skull', icon: '💀', w: 1.5, v: 0 }, { id: 'wild', icon: '🃏', w: 0, v: 0 },
];
export const sym = (id) => SYMBOLS.find((s) => s.id === id);
// 패턴 종류와 기본 배수
export const KINDS = { h3: { name: '가로 3', m: 1, g: 'h' }, h4: { name: '가로 4', m: 3, g: 'h' }, h5: { name: '가로 5', m: 6, g: 'h' }, v3: { name: '세로', m: 1, g: 'v' }, d3: { name: '대각선', m: 1, g: 'd' }, zig: { name: '지그재그', m: 5, g: 'z' }, full: { name: '잭팟', m: 30, g: 'j' } };

// ---------- 부적 ----------
// val: 무늬 값 더하기, wt: 무늬 확률 곱하기, pay: 무늬 배당 곱하기, kind: 패턴 묶음(h·v·d·z) 배당 곱하기
export const CHARMS = [
  { id: 'candy', icon: '🍬', name: '레몬 사탕', price: 20, val: { lemon: 15 }, desc: '🍋 값 +15' },
  { id: 'bomb', icon: '🧨', name: '체리 폭죽', price: 20, val: { cherry: 15 }, desc: '🍒 값 +15' },
  { id: 'four', icon: '☘️', name: '네잎클로버', price: 25, wt: { clover: 2 }, desc: '🍀가 2배 자주 나와요' },
  { id: 'goldbell', icon: '🛎️', name: '황금 종', price: 30, pay: { bell: 2 }, desc: '🔔 배당 ×2' },
  { id: 'ring', icon: '💍', name: '다이아 반지', price: 35, val: { diamond: 40 }, desc: '💎 값 +40' },
  { id: 'lucky7', icon: '🎰', name: '럭키 세븐', price: 40, wt: { seven: 2.5 }, desc: '7️⃣이 2.5배 자주 나와요' },
  { id: 'lamp', icon: '🏮', name: '가로등', price: 30, kind: { h: 2 }, desc: '가로 패턴 배당 ×2' },
  { id: 'ladder', icon: '🪜', name: '사다리', price: 25, kind: { v: 3 }, desc: '세로 패턴 배당 ×3' },
  { id: 'bolt', icon: '⚡', name: '번개', price: 25, kind: { d: 3 }, desc: '대각선 패턴 배당 ×3' },
  { id: 'glasses', icon: '🕶️', name: '지그재그 안경', price: 30, kind: { z: 3 }, desc: '지그재그 배당 ×3' },
  { id: 'lever', icon: '🕹️', name: '여분 레버', price: 35, spins: 2, desc: '라운드마다 스핀 +2' },
  { id: 'piggy', icon: '🐷', name: '돼지 저금통', price: 30, interest: 0.1, desc: '라운드가 끝나면 가진 코인의 10% 이자(최대 50)' },
  { id: 'cat', icon: '🐱', name: '복고양이', price: 20, flat: 4, desc: '스핀할 때마다 +4 코인' },
  { id: 'dice', icon: '🎲', name: '선수 주사위', price: 25, first: 3, desc: '라운드 첫 스핀 배당 ×3' },
  { id: 'hourglass', icon: '⏳', name: '막판 모래시계', price: 30, last: 4, desc: '라운드 마지막 스핀 배당 ×4' },
  { id: 'horseshoe', icon: '🧲', name: '말굽 자석', price: 30, dry: 1, desc: '꽝이 날 때마다 다음 당첨 배당 +100%(쌓임)' },
  { id: 'joker', icon: '🃏', name: '조커', price: 45, wild: 2, desc: '어떤 무늬로도 쳐 주는 🃏가 릴에 섞여요' },
  { id: 'holy', icon: '🧿', name: '액막이', price: 25, holy: true, desc: '💀 저주를 막고, 막을 때마다 +30 코인' },
  { id: 'ticket', icon: '🎟️', name: '복권', price: 30, lotto: 0.15, desc: '당첨 줄마다 15% 확률로 배당 ×5' },
  { id: 'mirror', icon: '🪞', name: '거울', price: 40, mirror: true, desc: '가로 4·5줄이 한 번 더 지급돼요' },
];
export const charm = (id) => CHARMS.find((c) => c.id === id);

// ---------- 환생(별) ----------
export const META = [
  { id: 'purse', icon: '👛', name: '쌈짓돈', max: 5, cost: [2, 4, 7, 11, 16], desc: '시작 코인 +15' },
  { id: 'arm', icon: '💪', name: '단련된 팔', max: 2, cost: [6, 15], desc: '라운드마다 스핀 +1' },
  { id: 'pocket', icon: '🧥', name: '속주머니', max: 2, cost: [5, 12], desc: '부적 칸 +1' },
  { id: 'coupon', icon: '🏷️', name: '단골 쿠폰', max: 3, cost: [3, 6, 10], desc: '상점 가격 −10%' },
  { id: 'reroll', icon: '🔁', name: '덤', max: 1, cost: [8], desc: '상점마다 첫 다시 뽑기 무료' },
];
export const metaCost = (save, id) => { const m = META.find((x) => x.id === id), lv = save.meta[id] || 0; return lv >= m.max ? Infinity : m.cost[lv]; };
export function buyMeta(save, id) { const c = metaCost(save, id); if (!(save.stars >= c)) return false; save.stars -= c; save.meta[id] = (save.meta[id] || 0) + 1; return true; }
// 끝난 판에서 받는 별: 넘긴 기한 수의 삼각수(1, 3, 6, 10 ...)
export const starsFor = (cleared) => (cleared * (cleared + 1)) / 2;

// ---------- 판(런) ----------
export const ROUNDS = 3, BASE_SPINS = 5, BASE_SLOTS = 5;
export const debtFor = (n) => Math.round((60 * 1.62 ** (n - 1)) / 5) * 5;
export function newRun(save) {
  const m = save.meta;
  return { deadline: 1, round: 1, coins: 15 * (m.purse || 0), debt: debtFor(1), spinsLeft: 0, spinNo: 0, charms: [], shop: [], rerolls: 0, dry: 0, earned: 0, bestSpin: 0, over: null, slots: BASE_SLOTS + (m.pocket || 0), armSpins: m.arm || 0, discount: 0.1 * (m.coupon || 0), freeReroll: !!m.reroll, phase: 'spin' };
}
const has = (run, key) => run.charms.map(charm).filter((c) => c[key] !== undefined);
export const spinsPerRound = (run) => BASE_SPINS + run.armSpins + has(run, 'spins').reduce((a, c) => a + c.spins, 0);
export function startRound(run) { run.spinsLeft = spinsPerRound(run); run.spinNo = 0; run.phase = 'spin'; }

// 무늬 확률(부적 반영)
export function weights(run) {
  const w = {};
  for (const s of SYMBOLS) w[s.id] = s.w;
  for (const c of run.charms.map(charm)) { for (const k in c.wt || {}) w[k] *= c.wt[k]; if (c.wild) w.wild += c.wild; }
  return w;
}
export function genGrid(run, rnd = Math.random) {
  const w = weights(run), ids = Object.keys(w), total = ids.reduce((a, k) => a + w[k], 0), grid = [];
  for (let c = 0; c < COLS; c++) { const col = []; for (let r = 0; r < ROWS; r++) { let x = rnd() * total, id = ids[0]; for (const k of ids) { x -= w[k]; if (x < 0) { id = k; break; } } col.push(id); } grid.push(col); }
  return grid;   // grid[열][행]
}

// 칸들이 한 무늬로 맞는지(🃏는 아무 무늬나, 💀는 💀끼리만). 맞으면 그 무늬 id
function match(grid, cells) {
  let id = null;
  for (const [c, r] of cells) { const s = grid[c][r]; if (s === 'wild') continue; if (id === null) id = s; else if (id !== s) return null; }
  if (id === 'skull') return cells.every(([c, r]) => grid[c][r] === 'skull') ? 'skull' : null;
  return id || 'seven';   // 전부 🃏면 7로 쳐 준다
}
// 당첨 줄 찾기
export function findLines(grid) {
  const out = [], add = (kind, cells) => { const id = match(grid, cells); if (id) out.push({ kind, cells, sym: id }); return !!id; };
  const all = []; for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) all.push([c, r]);
  if (add('full', all)) return out;
  for (let r = 0; r < ROWS; r++) {   // 가로: 가장 긴 줄 하나
    const run = (c0, n) => Array.from({ length: n }, (_, i) => [c0 + i, r]);
    add('h5', run(0, 5)) || add('h4', run(0, 4)) || add('h4', run(1, 4)) || add('h3', run(0, 3)) || add('h3', run(1, 3)) || add('h3', run(2, 3));
  }
  for (let c = 0; c < COLS; c++) add('v3', [[c, 0], [c, 1], [c, 2]]);
  for (let c = 0; c <= COLS - 3; c++) { add('d3', [[c, 0], [c + 1, 1], [c + 2, 2]]); add('d3', [[c, 2], [c + 1, 1], [c + 2, 0]]); }
  add('zig', [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]]); add('zig', [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]]);
  return out;
}
// 줄 하나의 배당
export function linePay(run, line, rnd = Math.random) {
  if (line.sym === 'skull') return { pay: 0, lotto: false };
  const cs = run.charms.map(charm), k = KINDS[line.kind];
  let v = sym(line.sym).v, m = k.m;
  for (const c of cs) { v += (c.val && c.val[line.sym]) || 0; m *= (c.pay && c.pay[line.sym]) || 1; m *= (c.kind && c.kind[k.g]) || 1; }
  if (cs.some((c) => c.mirror) && (line.kind === 'h4' || line.kind === 'h5')) m *= 2;
  const lotto = cs.some((c) => c.lotto && rnd() < c.lotto);
  return { pay: Math.round(v * m * (lotto ? 5 : 1)), lotto };
}
// 스핀 한 번: 판을 만들고, 줄마다 배당, 스핀 배수, 저주를 계산해 코인에 반영
export function spin(run, rnd = Math.random, forced = null) {
  if (run.spinsLeft <= 0 || run.phase !== 'spin') return null;
  run.spinsLeft--; run.spinNo++;
  const grid = forced || genGrid(run, rnd), cs = run.charms.map(charm), lines = findLines(grid);
  const wins = [], skulls = lines.filter((l) => l.sym === 'skull');
  let sum = 0;
  for (const l of lines) { if (l.sym === 'skull') continue; const p = linePay(run, l, rnd); wins.push({ ...l, ...p }); sum += p.pay; }
  // 스핀 배수: 첫 스핀, 마지막 스핀, 꽝 쌓임
  let mult = 1; const tags = [];
  for (const c of cs) {
    if (c.first && run.spinNo === 1) { mult *= c.first; tags.push(`${c.icon} ×${c.first}`); }
    if (c.last && run.spinsLeft === 0) { mult *= c.last; tags.push(`${c.icon} ×${c.last}`); }
  }
  const dryOn = cs.some((c) => c.dry);
  if (dryOn && sum > 0 && run.dry > 0) { mult *= 1 + run.dry; tags.push(`🧲 ×${1 + run.dry}`); }
  if (dryOn) run.dry = sum > 0 ? 0 : run.dry + 1;
  const flat = cs.reduce((a, c) => a + (c.flat || 0), 0);
  let total = Math.round(sum * mult) + flat, curse = 0, blocked = 0;
  if (skulls.length) {   // 저주: 💀 줄마다 가진 코인의 절반을 잃는다
    if (cs.some((c) => c.holy)) { blocked = 30 * skulls.length; total += blocked; }
    else { const after = run.coins + total; curse = after - Math.floor(after * 0.5 ** skulls.length); }
  }
  run.coins += total - curse; run.earned += total; run.bestSpin = Math.max(run.bestSpin, total);
  return { grid, wins, skulls, sum, mult, tags, flat, total, curse, blocked };
}

// ---------- 라운드 끝, 기한 ----------
// 스핀을 다 쓰면 이자를 받고: 기한의 마지막 라운드면 빚을 갚거나 끝, 아니면 상점으로
export function endRound(run) {
  const ev = { interest: 0 };
  for (const c of has(run, 'interest')) { const i = Math.min(50, Math.floor(run.coins * c.interest)); ev.interest += i; run.coins += i; }
  if (run.round >= ROUNDS) {
    if (run.coins < run.debt) { run.over = { cleared: run.deadline - 1, short: run.debt - run.coins }; run.phase = 'over'; ev.dead = true; return ev; }
    run.coins -= run.debt; ev.paid = run.debt;
    run.deadline++; run.round = 1; run.debt = debtFor(run.deadline);
  } else run.round++;
  run.phase = 'shop'; run.rerolls = 0;
  return ev;
}
// 빚을 미리 갚기: 남은 라운드를 건너뛰고 다음 기한으로(남은 라운드마다 보너스 코인)
export function payEarly(run) {
  if (run.phase !== 'shop' || run.round === 1 || run.coins < run.debt) return null;
  const skipped = ROUNDS - run.round + 1, bonus = skipped * Math.round(run.debt * 0.15);
  run.coins += bonus - run.debt; const paid = run.debt;
  run.deadline++; run.round = 1; run.debt = debtFor(run.deadline);
  return { paid, bonus, skipped };
}

// ---------- 상점 ----------
export const priceOf = (run, id) => Math.max(1, Math.round(charm(id).price * (1 + 0.3 * (run.deadline - 1)) * (1 - run.discount)));
export const rerollCost = (run) => (run.freeReroll && run.rerolls === 0 ? 0 : 5 * (run.rerolls + (run.freeReroll ? 0 : 1)) * run.deadline);
export function rollShop(run, rnd = Math.random) {
  const pool = CHARMS.filter((c) => !run.charms.includes(c.id)).map((c) => c.id), out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  run.shop = out;
  return out;
}
export function buyCharm(run, i) {
  const id = run.shop[i]; if (!id) return false;
  const p = priceOf(run, id);
  if (run.coins < p || run.charms.length >= run.slots) return false;
  run.coins -= p; run.charms.push(id); run.shop[i] = null;
  return true;
}
export function sellCharm(run, id) { const i = run.charms.indexOf(id); if (i < 0) return 0; run.charms.splice(i, 1); const v = Math.floor(priceOf(run, id) / 2); run.coins += v; return v; }
export function reroll(run, rnd = Math.random) { const c = rerollCost(run); if (run.coins < c) return false; run.coins -= c; run.rerolls++; rollShop(run, rnd); return true; }

// ---------- 저장 ----------
export const SAVE_KEY = 'luckycell.save';
export const defaultSave = () => ({ stars: 0, totalStars: 0, best: 0, runs: 0, meta: {}, run: null, sound: true, vibrate: true, seenIntro: false });
// 판이 끝나면 별을 받고 기록을 남긴다
export function finishRun(save, run) {
  const got = Math.max(1, starsFor(run.over.cleared));   // 첫 기한에서 져도 위로의 별 하나
  save.stars += got; save.totalStars += got; save.best = Math.max(save.best, run.over.cleared); save.runs++; save.run = null;
  return got;
}
export function loadSave(storage) { try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) return { ...defaultSave(), ...d, meta: { ...(d.meta || {}) } }; } catch { /* 새로 */ } return defaultSave(); }
export function storeSave(storage, s) { try { storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
