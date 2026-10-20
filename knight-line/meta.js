// 코인 경제와 저장 데이터. 순수 로직(DOM, localStorage 접근 없음).
// 원칙: 코인은 잘 푼 사람이 받고, 퍼즐을 대신 풀어 주는 데는 쓰지 않는다.
export const STAR_COINS = [0, 5, 15, 35]; // 별 개수별 누적 보상. 처음 더 높은 별을 받을 때 차액만 준다
export const GOLD_COINS = 30;
export const DAILY_COINS = 30;
export const HINT_COST = 15;
export const FREE_HINT_UNTIL = 5;         // 처음 몇 스테이지는 연습 삼아 힌트 무료
export const BONUS_EVERY = 10;
export const DAILY_EPOCH = Date.UTC(2026, 9, 20); // 오늘의 퍼즐 #1

export const SHOP = [
  { id: 'knight.basic', cat: 'knight', name: '기본 기사', price: 0 },
  { id: 'knight.cat', cat: 'knight', name: '고양이 기사', price: 150 },
  { id: 'knight.ninja', cat: 'knight', name: '닌자', price: 200 },
  { id: 'knight.skull', cat: 'knight', name: '해골 기사', price: 250 },
  { id: 'knight.gold', cat: 'knight', name: '황금 갑옷', price: 300 },
  { id: 'effect.basic', cat: 'effect', name: '기본 잔상', price: 0 },
  { id: 'effect.stardust', cat: 'effect', name: '별가루 폭발', price: 100 },
  { id: 'effect.fire', cat: 'effect', name: '불꽃 잔상', price: 150 },
  { id: 'effect.lightning', cat: 'effect', name: '번개', price: 200 },
  { id: 'theme.dungeon', cat: 'theme', name: '던전', price: 0 },
  { id: 'theme.snow', cat: 'theme', name: '설원', price: 200 },
  { id: 'theme.desert', cat: 'theme', name: '사막', price: 200 },
  { id: 'theme.lava', cat: 'theme', name: '용암 성', price: 200 },
];
export const CATEGORIES = { knight: '기사', effect: '효과', theme: '테마' };

// 도감: 몬스터 종류 키 → 이름. golden은 종류와 관계없이 황금 몬스터로 따로 센다
export const BESTIARY = [
  { key: '0', name: '슬라임' }, { key: '1', name: '박쥐' }, { key: '2', name: '유령' },
  { key: '3', name: '갑옷 오크' }, { key: 'golden', name: '황금 몬스터' },
];
export const BADGES = [10, 50, 100];
const TITLES = [[0, '견습 기사'], [50, '기사'], [200, '용맹한 기사'], [500, '몬스터 헌터']];

export function defaultSave() {
  return {
    cleared: 0, stage: 1, coins: 0, bonusDone: 0,
    stars: {}, golds: {},
    owned: SHOP.filter(i => i.price === 0).map(i => i.id),
    equip: { knight: 'knight.basic', effect: 'effect.basic', theme: 'theme.dungeon' },
    kills: {},
    daily: { lastDay: 0, streak: 0, results: {} },
  };
}

// get(key) → 문자열 또는 null. 예전 버전의 낱개 키(knightLine.cleared 등)도 이어받는다
export function loadSave(get) {
  const base = defaultSave();
  try {
    const raw = get('knightLine.save');
    if (raw) {
      const s = JSON.parse(raw);
      return { ...base, ...s, equip: { ...base.equip, ...s.equip }, daily: { ...base.daily, ...s.daily } };
    }
  } catch { /* 깨진 저장은 새로 시작 */ }
  const num = k => Number(get(`knightLine.${k}`)) || 0;
  return { ...base, cleared: num('cleared'), stage: num('stage') || 1, coins: num('coins'), bonusDone: num('bonus') };
}

export function starsFor({ hints, undos }) {
  if (hints) return 1;
  return undos ? 2 : 3;
}

// 스테이지 클리어 정산. 저장 데이터를 바꾸고 받은 코인 내역을 돌려준다
export function recordClear(save, { stage, stars, golden, monsters }) {
  const rewards = [];
  const prev = save.stars[stage] ?? 0;
  if (stars > prev) {
    save.stars[stage] = stars;
    rewards.push({ label: `별 ${'★'.repeat(stars)} 첫 달성`, coins: STAR_COINS[stars] - STAR_COINS[prev] });
  }
  if (golden && !save.golds[stage]) {
    save.golds[stage] = true;
    rewards.push({ label: '황금 몬스터 마지막 처치', coins: GOLD_COINS });
  }
  if (stage > save.cleared) save.cleared = stage;
  recordKills(save, monsters);
  for (const r of rewards) save.coins += r.coins;
  return rewards;
}

export function recordKills(save, monsters) {
  for (const m of monsters) {
    const k = m.golden ? 'golden' : String(m.kind);
    save.kills[k] = (save.kills[k] ?? 0) + 1;
  }
}

export function bonusAvailable(save, stage) {
  return stage % BONUS_EVERY === 0 && stage > save.bonusDone;
}

// 보너스 파친코 공 개수 = 그 10개 스테이지에서 모은 별 수 (최소 10개)
export function bonusBalls(save, stage) {
  let sum = 0;
  for (let n = stage - BONUS_EVERY + 1; n <= stage; n++) sum += save.stars[n] ?? 0;
  return Math.max(10, sum);
}

export function canHintFree(stage, daily) {
  return !daily && stage <= FREE_HINT_UNTIL;
}

export function spend(save, coins) {
  if (save.coins < coins) return false;
  save.coins -= coins;
  return true;
}

export function buy(save, id) {
  const item = SHOP.find(i => i.id === id);
  if (!item) return { ok: false, reason: '없는 상품' };
  if (save.owned.includes(id)) return { ok: false, reason: '이미 가지고 있어요' };
  if (!spend(save, item.price)) return { ok: false, reason: '코인이 부족해요' };
  save.owned.push(id);
  save.equip[item.cat] = id;
  return { ok: true };
}

export function equip(save, id) {
  const item = SHOP.find(i => i.id === id);
  if (!item || !save.owned.includes(id)) return false;
  save.equip[item.cat] = id;
  return true;
}

export function totalKills(save) {
  return Object.values(save.kills).reduce((a, b) => a + b, 0);
}

export function titleFor(save) {
  if (BESTIARY.every(b => (save.kills[b.key] ?? 0) >= BADGES.at(-1))) return '전설의 기사';
  const total = totalKills(save);
  return TITLES.filter(([need]) => total >= need).at(-1)[1];
}

// 기기의 날짜(자정 기준)로 오늘의 퍼즐 번호를 정한다
export function dayIndex(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - DAILY_EPOCH) / 86400000) + 1;
}

// 오늘의 퍼즐 정산. 하루 첫 클리어에만 코인을 주고, 어제도 깼으면 연속 보너스를 더한다
export function recordDaily(save, day, { stars, undos, hints }) {
  const d = save.daily;
  const prev = d.results[day];
  if (!prev || stars > prev.stars) d.results[day] = { stars, undos, hints };
  if (prev) return [];
  d.streak = d.lastDay === day - 1 ? d.streak + 1 : 1;
  d.lastDay = day;
  const rewards = [{ label: '오늘의 퍼즐 클리어', coins: DAILY_COINS }];
  const bonus = Math.min(d.streak - 1, 7) * 5;
  if (bonus) rewards.push({ label: `${d.streak}일 연속`, coins: bonus });
  for (const r of rewards) save.coins += r.coins;
  return rewards;
}

export function shareText(day, { stars, undos, hints }) {
  const starText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  return `나이트 라인 오늘의 퍼즐 #${day} ${starText} 되돌리기 ${undos}${hints ? ` 힌트 ${hints}` : ''}`;
}
