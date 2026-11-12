// 파칭코 타이쿤: 규칙과 수치 (화면과 분리, node --test로 검사)
// 구슬이 자동으로 떨어져 아래 칸의 배수만큼 돈을 번다. 가운데 스타트 구멍에 들어가면 릴이 돌고,
// 숫자 셋이 맞으면 잭팟 + 피버(일정 시간 수익 배수, 발사 속도 2배).

// 아래 칸 배수. 럭키 램프(불 켜진 칸)가 칸 사이를 옮겨 다니며, 그 칸에 들어가면 ×8
export const SLOTS = [1, 0.5, 2, 0.5, 0.2, 0.5, 2, 0.5, 1];
export const LUCKY_MULT = 8, LUCKY_SEC = 1.2;
export const luckySlot = (t) => Math.floor(t / LUCKY_SEC) % SLOTS.length;
export const START_MULT = 3;          // 스타트 구멍에 들어간 구슬
export const EXPECTED_MULT = 1.65;    // 구슬 하나의 평균 배수(실제 판에서 5천 개를 떨어뜨려 잰 값 + 럭키 칸)
export const HOLD_MAX = 4;            // 릴 보류(실제 파칭코처럼 최대 4개)
export const FEVER_SEC = 12;
export const OFFLINE_CAP = 8 * 3600, OFFLINE_RATE = 0.5;

export const UPGRADES = [
  { id: 'value', name: '구슬 가치', icon: '💎', max: 999, base: 10, growth: 1.15, desc: '구슬 하나의 값 +1 (25·50·100레벨마다 ×2)' },
  { id: 'rate', name: '자동 발사', icon: '⚙️', max: 30, base: 25, growth: 1.32, desc: '초당 구슬 +0.25' },
  { id: 'gold', name: '황금 구슬', icon: '🟡', max: 10, base: 150, growth: 1.9, desc: '황금 구슬(값 ×10) 확률 +2%' },
  { id: 'luck', name: '행운', icon: '🍀', max: 12, base: 300, growth: 1.75, desc: '잭팟 확률 상승' },
  { id: 'fever', name: '피버 배수', icon: '🔥', max: 10, base: 800, growth: 2.0, desc: '피버 중 수익 배수 +1' },
];
const up = (id) => UPGRADES.find((u) => u.id === id);
export function upgradeCost(s, id) { const u = up(id), lv = s.up[id] || 0; return lv >= u.max ? Infinity : Math.ceil(u.base * u.growth ** lv); }
export function buyUpgrade(s, id) { const c = upgradeCost(s, id); if (!(s.money >= c)) return false; s.money -= c; s.up[id]++; return true; }

export const MILESTONES = [25, 50, 100, 200, 300, 400];
export const prestigeMult = (s) => 1 + 0.1 * s.medals;
export const ballValue = (s) => (1 + s.up.value) * 2 ** MILESTONES.filter((m) => s.up.value >= m).length * prestigeMult(s);
export const dropRate = (s) => (0.5 + 0.25 * s.up.rate) * (s.fever > 0 ? 2 : 1);
export const goldChance = (s) => 0.02 * s.up.gold;
export const jackpotChance = (s) => 1 / Math.max(8, 30 - 1.8 * s.up.luck);
export const feverMult = (s) => (s.fever > 0 ? 5 + s.up.fever : 1);

// 구슬이 칸에 들어갔을 때 버는 돈
export function payout(s, mult, gold = false) {
  const v = ballValue(s) * mult * (gold ? 10 : 1) * feverMult(s);
  s.money += v; s.total += v; s.balls++;
  return v;
}

// ---------- 릴 ----------
// 스타트 구멍: 보류에 쌓는다(가득 차면 버려짐)
export function holdSpin(s) { if (s.hold >= HOLD_MAX) return false; s.hold++; return true; }
// 릴 한 번: 잭팟(셋 다 같음) / 리치(앞 둘만 같음: 아깝게 빗나감) / 꽝
export function spin(s, rnd = Math.random) {
  if (s.hold <= 0) return null;
  s.hold--; s.spins++;
  const d = () => 1 + Math.floor(rnd() * 9);
  const r = rnd(), a = d();
  if (r < jackpotChance(s)) return { digits: [a, a, a], jackpot: true, reach: true };
  if (r < jackpotChance(s) + 0.22) { const c = a % 9 + 1; return { digits: [a, a, c], jackpot: false, reach: true }; }
  let b = d(); if (b === a) b = b % 9 + 1;
  return { digits: [a, b, d()], jackpot: false, reach: false };
}
// 잭팟: 큰 보너스 + 피버 시작(피버 중이면 시간 연장)
export function jackpot(s) {
  const bonus = ballValue(s) * 150 * (5 + s.up.fever) / 5;
  s.money += bonus; s.total += bonus; s.jackpots++;
  s.fever = Math.min(FEVER_SEC * 3, s.fever + FEVER_SEC);
  return bonus;
}
export function stepFever(s, dt) { s.fever = Math.max(0, s.fever - dt); }

// ---------- 환생(가게 확장) ----------
// 이번 가게에서 번 돈으로 메달을 받고 처음부터. 메달 하나당 수익 +10%
export const medalsFor = (total) => Math.floor(Math.sqrt(total / 50000));
export const canPrestige = (s) => medalsFor(s.total) >= 1;
export function prestige(s) {
  const m = medalsFor(s.total);
  if (m < 1) return 0;
  s.medals += m; s.shops++;
  s.money = 0; s.total = 0; s.fever = 0; s.hold = 0;
  for (const u of UPGRADES) s.up[u.id] = 0;
  return m;
}

// ---------- 오프라인 ----------
export const perSecond = (s) => ballValue(s) * EXPECTED_MULT * (0.5 + 0.25 * s.up.rate) * (1 + goldChance(s) * 9);
export function offlineEarnings(s, seconds) {
  const sec = Math.max(0, Math.min(OFFLINE_CAP, seconds)), v = perSecond(s) * sec * OFFLINE_RATE;
  s.money += v; s.total += v;
  return { seconds: sec, money: v };
}

// ---------- 숫자 ----------
const UNITS = ['', '만', '억', '조', '경', '해', '자', '양'];
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 10000) return n < 100 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  let i = 0; while (n >= 10000 && i < UNITS.length - 1) { n /= 10000; i++; }
  return `${n >= 100 ? Math.floor(n) : n.toFixed(n >= 10 ? 1 : 2)}${UNITS[i]}`;
}

// ---------- 저장 ----------
export const SAVE_KEY = 'pachinko.save';
export const defaultSave = () => ({ money: 0, total: 0, balls: 0, spins: 0, jackpots: 0, medals: 0, shops: 0, hold: 0, fever: 0, up: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), lastSeen: Date.now(), sound: true, vibrate: true, seenIntro: false });
export function loadSave(storage) { try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) { const b = defaultSave(); return { ...b, ...d, up: { ...b.up, ...(d.up || {}) }, fever: 0 }; } } catch { /* 새로 */ } return defaultSave(); }
export function storeSave(storage, s) { try { s.lastSeen = Date.now(); storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
