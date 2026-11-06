// 뮤턴트 시티: 규칙과 수치 (화면과 분리, node --test로 검사)
// 몸을 바꾸는 변이체가 되어 도시를 누빈다. 사람을 흡수해 체력·진화 점수(EP)를 얻고,
// 군인을 흡수하면 군인으로 변장한다. 소란을 피우면 경계 단계가 오르고 헬기가 출동한다.

export const WEAPONS = [
  { id: 'fist', name: '주먹', icon: '👊', dmg: 22, range: 2.0, arc: 1.2, cd: 0.35, knock: 4 },
  { id: 'blade', name: '칼날 팔', icon: '🗡️', dmg: 55, range: 2.6, arc: 1.4, cd: 0.45, knock: 2 },
  { id: 'hammer', name: '거대 주먹', icon: '🔨', dmg: 40, range: 4.2, arc: Math.PI * 2, cd: 0.9, knock: 12 },
];
export const KINDS = {
  civ: { hp: 20, speed: 1.4, ep: 8, heal: 25, name: '시민' },
  soldier: { hp: 60, speed: 2.2, ep: 15, heal: 30, name: '군인' },
  infected: { hp: 50, speed: 3.0, ep: 20, heal: 35, name: '감염체' },
};
export const HIVE_HP = 400;
export const HELI_HP = 260;

// ---------- 진화(업그레이드) ----------
export const UPGRADES = [
  { id: 'hp', name: '강화 세포', icon: '❤️', max: 5, cost: [40, 80, 140, 220, 320], desc: '최대 체력 +40' },
  { id: 'dmg', name: '근육 변이', icon: '💪', max: 5, cost: [50, 100, 170, 260, 380], desc: '공격력 +20%' },
  { id: 'move', name: '도약 근육', icon: '🦘', max: 3, cost: [60, 140, 260], desc: '달리기·점프·벽 타기 +15%' },
  { id: 'regen', name: '재생', icon: '🩸', max: 3, cost: [70, 160, 300], desc: '초당 회복 +2' },
];
export const maxHp = (s) => 200 + 40 * (s.up.hp || 0);
export const dmgMul = (s) => 1 + 0.2 * (s.up.dmg || 0);
export const moveMul = (s) => 1 + 0.15 * (s.up.move || 0);
export const regen = (s) => 3 + 2 * (s.up.regen || 0);
export const upgradeCost = (s, id) => { const u = UPGRADES.find((x) => x.id === id), lv = s.up[id] || 0; return lv >= u.max ? Infinity : u.cost[lv]; };
export function buyUpgrade(s, id) {
  const c = upgradeCost(s, id);
  if (!(s.ep >= c)) return false;
  s.ep -= c; s.up[id] = (s.up[id] || 0) + 1;
  return true;
}
export const weaponDmg = (s, w) => Math.round(WEAPONS[w].dmg * dmgMul(s));

// ---------- 흡수와 변장 ----------
// 흡수: 체력 회복, EP, 군인이면 변장. 흡수 장면을 군인이 보면(변장 중이 아니면) 경계 +1
export function absorb(s, kind, seenBySoldier) {
  const k = KINDS[kind];
  s.hp = Math.min(maxHp(s), s.hp + k.heal);
  s.ep += k.ep; s.totalEp += k.ep; s.absorbed++;
  if (kind === 'soldier') s.disguise = true;
  if (seenBySoldier && !s.disguise) raiseAlert(s, 1);
  return k;
}
// 수상한 행동(공격, 벽 타기, 활공)을 군인이 보면 변장이 들킨다
export function suspicious(s, seenBySoldier) {
  if (!seenBySoldier) return false;
  const wasDisguised = s.disguise;
  s.disguise = false;
  raiseAlert(s, wasDisguised ? 2 : 1);
  return wasDisguised;
}

// ---------- 경계 단계 ----------
// 0~5. 군인 눈에 띄지 않으면 8초 뒤부터 6초마다 한 단계씩 내려간다. 3단계부터 헬기.
export const ALERT_COOL = 8, ALERT_STEP = 6;
export function raiseAlert(s, n = 1) { s.alert = Math.min(5, s.alert + n); s.calm = 0; }
export function stepAlert(s, dt, seen) {
  if (seen && !s.disguise) { s.calm = 0; return s.alert; }
  s.calm += dt;
  if (s.alert > 0 && s.calm >= ALERT_COOL + ALERT_STEP) { s.alert--; s.calm = ALERT_COOL; }
  return s.alert;
}
export const helisWanted = (alert) => Math.max(0, Math.min(2, alert - 2));
export const soldiersWanted = (alert) => 8 + alert * 3;

// ---------- 체력 ----------
export function damage(s, n) {
  s.hp = Math.max(0, s.hp - n);
  s.hurtT = 0;
  return s.hp <= 0;
}
// 맞은 지 3초가 지나면 저절로 회복
export function stepRegen(s, dt) {
  s.hurtT += dt;
  if (s.hurtT > 3 && s.hp > 0) s.hp = Math.min(maxHp(s), s.hp + regen(s) * dt);
}
// 쓰러지면 옥상에서 다시 깨어나고 EP의 20%를 잃는다. 경계는 풀린다
export function respawn(s) {
  s.ep = Math.floor(s.ep * 0.8); s.hp = maxHp(s); s.alert = 0; s.calm = 0; s.disguise = false; s.deaths++;
}

// ---------- 둥지 ----------
// 감염체 둥지를 부수면 큰 EP. 다 부수면 새 둥지가 생긴다
export function hiveDestroyed(s) { s.hives++; s.ep += 120; s.totalEp += 120; raiseAlert(s, 1); }

// ---------- 저장 ----------
export const SAVE_KEY = 'mutant.save';
export const defaultSave = () => ({ hp: 200, ep: 0, totalEp: 0, absorbed: 0, kills: 0, hives: 0, deaths: 0, alert: 0, calm: 0, disguise: false, hurtT: 9, up: { hp: 0, dmg: 0, move: 0, regen: 0 }, weapon: 0, sound: true, vibrate: true, seenIntro: false });
export function loadSave(storage) {
  try { const d = JSON.parse(storage.getItem(SAVE_KEY)); if (d) { const s = { ...defaultSave(), ...d, up: { ...defaultSave().up, ...(d.up || {}) } }; s.alert = 0; s.disguise = false; s.hp = Math.max(s.hp, maxHp(s) * 0.5); return s; } } catch { /* 새로 */ }
  return defaultSave();
}
export function storeSave(storage, s) { try { storage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 */ } }
