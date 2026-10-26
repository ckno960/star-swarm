// 행성 키우기 — 인공위성을 쏘아 올릴수록 위성이 행성 둘레를 돌며 행성이 무거워지고, 그 중력에 끌려 지구와 부딪히는 방치형 게임.
// 화면과 분리된 순수 로직: 경제, 스테이지, 물리(크기·자유 낙하·속도), 지구에 미치는 영향, 달력·계절, 뉴스, 저장.

export const START_KM = 384400;     // 처음 중심 거리(달까지 거리)
export const COST_GROWTH = 1.15;    // 같은 발사대를 하나 더 살 때마다 값 ×1.15
export const MILESTONES = [25, 50, 100, 200];   // 이만큼 모으면 그 발사대 생산 ×2씩
export const OFFLINE_CAP = 8 * 3600;
export const TAP_BASE_COST = 50;
export const TAP_COST_GROWTH = 12;
export const STAGE_BONUS = 1.25;    // 스테이지를 깰 때마다 모든 발사 ×1.25

// 회수 기간(값 ÷ 생산)이 모두 100초 안팎이라, 위 단계일수록 한 번에 크게 늘어난다
export const LAUNCHERS = [
  { id: 'cube', name: '큐브위성 발사', desc: '손바닥만 한 작은 위성을 줄줄이 쏘아 올려요', cost: 15, rate: 0.15 },
  { id: 'small', name: '소형 로켓 발사장', desc: '작은 로켓으로 관측 위성을 올려요', cost: 100, rate: 1 },
  { id: 'weather', name: '기상위성', desc: '구름을 지켜보던 위성을 행성 궤도로', cost: 1100, rate: 11 },
  { id: 'comms', name: '통신위성 군단', desc: '수백 기의 통신위성을 한꺼번에', cost: 12000, rate: 120 },
  { id: 'station', name: '우주정거장 조립', desc: '거대한 정거장을 통째로 궤도에 올려요', cost: 1.3e5, rate: 1300 },
  { id: 'elevator', name: '우주 엘리베이터', desc: '승강기로 위성 재료를 끝없이 올려요', cost: 1.4e6, rate: 14000 },
  { id: 'asteroid', name: '소행성 포획선', desc: '소행성을 붙잡아 행성의 위성으로 만들어요', cost: 2e7, rate: 2e5 },
  { id: 'factory', name: '궤도 공장', desc: '궤도에서 위성을 직접 찍어 내요', cost: 3.3e8, rate: 3.3e6 },
  { id: 'moonlet', name: '위성 견인선', desc: '작은 달을 통째로 끌고 가요', cost: 5e9, rate: 5e7 },
  { id: 'ring', name: '인공 고리 건설', desc: '행성을 두르는 거대한 고리를 지어요', cost: 7.5e10, rate: 7.5e8 },
];

// ---------- 경제 ----------
export const prestigeMult = (save) => STAGE_BONUS ** ((save.stage || 1) - 1);
export function milestoneMult(owned) {
  return 2 ** MILESTONES.filter((m) => owned >= m).length;
}
export function launcherCost(i, owned) {
  return Math.ceil(LAUNCHERS[i].cost * COST_GROWTH ** owned);
}
export function launcherRate(save, i) {
  const n = save.owned[i] || 0;
  return LAUNCHERS[i].rate * n * milestoneMult(n) * prestigeMult(save);
}
export function totalRate(save) {
  return LAUNCHERS.reduce((s, _, i) => s + launcherRate(save, i), 0);
}
export const tapPower = (save) => 2 ** (save.tapLv || 0) * prestigeMult(save);
export const tapCost = (lv) => Math.ceil(TAP_BASE_COST * TAP_COST_GROWTH ** lv);
export function nextGain(save, i) {
  const n = save.owned[i] || 0;
  return LAUNCHERS[i].rate * prestigeMult(save) * ((n + 1) * milestoneMult(n + 1) - n * milestoneMult(n));
}
export function buyLauncher(save, i) {
  const c = launcherCost(i, save.owned[i] || 0);
  if (save.money < c) return false;
  save.money -= c;
  save.owned[i] = (save.owned[i] || 0) + 1;
  return true;
}
export function buyTap(save) {
  const c = tapCost(save.tapLv || 0);
  if (save.money < c) return false;
  save.money -= c;
  save.tapLv = (save.tapLv || 0) + 1;
  return true;
}
// 보이는 발사대: 가진 것 + 다음 하나(값의 절반을 모으면 공개)
export function visibleLaunchers(save) {
  let n = 0;
  while (n < LAUNCHERS.length && (save.owned[n] || 0) > 0) n++;
  if (n < LAUNCHERS.length && (n === 0 || save.money >= LAUNCHERS[n].cost * 0.5 || save.seen > n)) n++;
  save.seen = Math.max(save.seen || 0, n);
  return Math.max(n, save.seen);
}
// 위성을 쏘면: 행성 쪽 질량이 늘고, 쏜 만큼 발사 계약금(원)을 받는다
export function addLaunch(save, tons) {
  const t = Math.max(0, tons), end = stageConfig(save.stage).endMass;
  save.mass = Math.min(end, save.mass + t);
  save.money += t;
  save.sent += t;
}

// ---------- 스테이지 ----------
// 스테이지마다 행성이 이 천체만큼 자라면 충돌한다. 앞 스테이지는 짧고, 뒤로 갈수록 길다
export const BASE_TYPES = [
  { id: 'pluto', name: '명왕성' }, { id: 'europa', name: '유로파' }, { id: 'moon', name: '달' }, { id: 'io', name: '이오' },
  { id: 'mercury', name: '수성' }, { id: 'titan', name: '타이탄' }, { id: 'ganymede', name: '가니메데' }, { id: 'mars', name: '화성' },
  { id: 'venus', name: '금성' }, { id: 'neptune', name: '해왕성' }, { id: 'uranus', name: '천왕성' }, { id: 'saturn', name: '토성' },
  { id: 'jupiter', name: '목성' },
];
export const STAGE_PLAN = [
  { end: 'moon', mass: 2e3 },
  { end: 'mars', mass: 6e4 },
  { end: 'venus', mass: 3e6 },
  { end: 'neptune', mass: 2e8 },
  { end: 'saturn', mass: 2e10 },
  { end: 'jupiter', mass: 3e12 },
];
const stageCache = new Map();
export function stageConfig(s = 1) {
  s = Math.max(1, s | 0);
  if (stageCache.has(s)) return stageCache.get(s);
  const plan = STAGE_PLAN[Math.min(s, STAGE_PLAN.length) - 1];
  const endMass = s > STAGE_PLAN.length ? plan.mass * 4 ** (s - STAGE_PLAN.length) : plan.mass;
  const endIndex = BASE_TYPES.findIndex((t) => t.id === plan.end);
  const n = endIndex + 1;
  // 마지막 천체에는 진행도 0.9에 닿고, 그 뒤로는 그 크기로 떨어진다
  const types = BASE_TYPES.slice(0, n).map((t, i) => ({ ...t, from: n === 1 ? 0 : (i / (n - 1)) * 0.9 }));
  const end = BODY_DATA[plan.end];
  const cfg = { stage: s, endMass, types, endId: plan.end, endName: BASE_TYPES[endIndex].name, contactX: (EARTH.radiusKm + end.radiusKm) / START_KM };
  stageCache.set(s, cfg);
  return cfg;
}
export const BLEND = 0.025;   // 다음 천체로 바뀌기 직전 이만큼 서서히 섞인다
export function planetStage(p, cfg = stageConfig(1)) {
  const T = cfg.types;
  let i = 0;
  while (i + 1 < T.length && p >= T[i + 1].from) i++;
  const next = T[i + 1];
  const blend = next ? Math.max(0, Math.min(1, (p - (next.from - BLEND)) / BLEND)) : 0;
  return { type: T[i], next: next || null, blend };
}
// 진행도 0~1: 쏘아 올린 양의 자릿수
export function progress(mass, cfg = stageConfig(1)) {
  return Math.max(0, Math.min(1, Math.log10(1 + mass) / Math.log10(1 + cfg.endMass)));
}

// ---------- 물리 ----------
export const G = 6.674e-11;
export const EARTH = { radiusKm: 6371, massKg: 5.972e24 };
export const MOON = { massKg: 7.342e22, distKm: 384400 };
export const BODY_DATA = {
  pluto: { radiusKm: 1188, massKg: 1.303e22 },
  europa: { radiusKm: 1561, massKg: 4.80e22 },
  moon: { radiusKm: 1737, massKg: 7.342e22 },
  io: { radiusKm: 1822, massKg: 8.93e22 },
  mercury: { radiusKm: 2440, massKg: 3.301e23 },
  titan: { radiusKm: 2575, massKg: 1.345e23 },
  ganymede: { radiusKm: 2634, massKg: 1.482e23 },
  mars: { radiusKm: 3390, massKg: 6.417e23 },
  venus: { radiusKm: 6052, massKg: 4.867e24 },
  neptune: { radiusKm: 24622, massKg: 1.024e26 },
  uranus: { radiusKm: 25362, massKg: 8.681e25 },
  saturn: { radiusKm: 58232, massKg: 5.683e26 },
  jupiter: { radiusKm: 69911, massKg: 1.898e27 },
};
export const MOON_ANGULAR_DIAMETER = 0.5181 * Math.PI / 180;

// 지금 행성의 반지름(km)과 질량(kg). 천체 사이는 로그로 이어진다
export function bodyAt(p, cfg = stageConfig(1)) {
  const st = planetStage(p, cfg), a = BODY_DATA[st.type.id], b = st.next ? BODY_DATA[st.next.id] : a;
  const k = st.next ? Math.max(0, Math.min(1, (p - st.type.from) / (st.next.from - st.type.from))) : 0;
  return { radiusKm: a.radiusKm * (b.radiusKm / a.radiusKm) ** k, massKg: a.massKg * (b.massKg / a.massKg) ** k, stage: st };
}
// 자유 낙하: 정지 상태 거리 D0에서 거리 비 x = D/D0까지 걸린 시간의 비율(전체 낙하 시간 대비)
export function fallTimeFraction(x) {
  return (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x))) / (Math.PI / 2);
}
// 진행도 → 중심 거리 비: 낙하 궤적 위에서 진행도만큼 시간이 흐른 자리
export function fallX(p, cfg = stageConfig(1)) {
  if (p <= 0) return 1;
  if (p >= 1) return cfg.contactX;
  const target = p * fallTimeFraction(cfg.contactX);
  let lo = cfg.contactX, hi = 1;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (fallTimeFraction(mid) > target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const centerDistanceKm = (p, cfg = stageConfig(1)) => START_KM * fallX(p, cfg);
// "지구까지": 두 천체 표면 사이 거리(0이 되면 충돌)
export function distanceKm(p, cfg = stageConfig(1)) {
  if (p >= 1) return 0;
  return Math.max(0, centerDistanceKm(p, cfg) - EARTH.radiusKm - bodyAt(p, cfg).radiusKm);
}
// 접근 속도(km/s): v = √(2G(M지구+M행성)(1/D − 1/D0))
export function speedKms(p, cfg = stageConfig(1)) {
  const D = centerDistanceKm(p, cfg) * 1000, D0 = START_KM * 1000, M = EARTH.massKg + bodyAt(p, cfg).massKg;
  return Math.sqrt(Math.max(0, 2 * G * M * (1 / D - 1 / D0))) / 1000;
}
// 보이는 크기: 각반지름 θ = asin(R/D), 화면 반지름 = 초점거리 × tan θ
export function angularRadius(p, cfg = stageConfig(1)) {
  return Math.asin(Math.min(0.999, bodyAt(p, cfg).radiusKm / centerDistanceKm(p, cfg)));
}
export const screenRadius = (p, focal, cfg = stageConfig(1)) => focal * Math.tan(angularRadius(p, cfg));
export const focalPx = (screenWidth, hfovDeg = 60) => (screenWidth / 2) / Math.tan(hfovDeg * Math.PI / 360);
export const moonTimes = (p, cfg = stageConfig(1)) => (2 * angularRadius(p, cfg)) / MOON_ANGULAR_DIAMETER;
export const earthMasses = (p, cfg = stageConfig(1)) => bodyAt(p, cfg).massKg / EARTH.massKg;

// ---------- 지구에 미치는 영향(과학적 근사) ----------
// 조석력 ∝ M/D³ → 달 대비 배수. 바다의 평형 조석 h = 1.5 (M/M지구) R지구⁴/D³ (달이면 약 0.54m).
// 땅도 조석으로 오르내린다(러브 수 h₂ ≈ 0.6). 조석 마찰 에너지는 조석력의 제곱에 비례(지금 지구 3.7TW)하고,
// 그 열이 지표에 더해지는 복사 강제력 ΔF = P/지구 표면적, 기온 상승 ΔT ≈ 0.8 K/(W/m²) × ΔF.
// 지진은 조석 응력이 단층을 건드려 일어난다고 보고 규모 ≈ 4 + 1.5 log₁₀(조석력 배수)로 어림.
// 계절: 행성의 조석 토크가 지구 자전축을 흔들어(세차·장동) 계절의 기온 차가 커진다.
// 로슈 한계: 더 가벼운 쪽이 찢기는 거리 d = 2.44 R_무거운쪽 (ρ_무거운쪽/ρ_가벼운쪽)^(1/3).
const density = (b) => b.massKg / ((4 / 3) * Math.PI * (b.radiusKm * 1000) ** 3);
export function effects(p, cfg = stageConfig(1)) {
  const b = bodyAt(p, cfg), D = centerDistanceKm(p, cfg);
  const tideRatio = (b.massKg / MOON.massKg) * (MOON.distKm / D) ** 3;
  const tideM = 1.5 * (b.massKg / EARTH.massKg) * EARTH.radiusKm ** 4 / D ** 3 * 1000;
  const groundM = tideM * 0.6;
  const quake = tideRatio > 1 ? 4 + 1.5 * Math.log10(tideRatio) : 0;
  const tidalTW = 3.7 * tideRatio ** 2;
  const forcing = (tidalTW * 1e12) / 5.1e14;
  const tempRise = 0.8 * forcing;
  const seasonAmp = 1 + 0.35 * Math.log10(Math.max(1, tideRatio));
  const earthTorn = b.massKg > EARTH.massKg;
  const heavy = earthTorn ? b : EARTH, light = earthTorn ? EARTH : b;
  const rocheKm = 2.44 * heavy.radiusKm * Math.cbrt(density(heavy) / density(light));
  return { tideRatio, tideM, groundM, quake, tidalTW, forcing, tempRise, seasonAmp, rocheKm, insideRoche: D < rocheKm, earthTorn, centerKm: D };
}

// ---------- 달력과 계절: 1초 = 1일 ----------
const DAY_MS = 86400000;
export const dayOfYear = (date) => Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY_MS);
export function calendar(save) {
  const date = new Date((save.startDay || 0) * DAY_MS + Math.floor(save.days || 0) * DAY_MS);
  return { date, y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), doy: dayOfYear(date), dayIndex: Math.floor(save.days || 0) };
}
// 행성이 자전축을 흔들수록 계절이 앞뒤로 출렁인다(실제 날짜보다 계절이 이르거나 늦게 옴)
export function seasonDay(doy, days, seasonAmp) {
  const wobble = (seasonAmp - 1) * 25 * Math.sin(days / 47);
  return ((doy + wobble) % 365 + 365) % 365;
}
// 봄(3~5월)·여름(6~8월)·가을(9~11월)·겨울(12~2월), 경계 앞뒤 12일은 서서히 섞인다
export function seasonWeights(sd) {
  const edges = [[59, 'spring'], [151, 'summer'], [243, 'autumn'], [334, 'winter']];
  const w = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const order = ['winter', 'spring', 'summer', 'autumn', 'winter'];
  let idx = 0;
  while (idx < 4 && sd >= edges[idx][0]) idx++;
  const cur = order[idx];
  w[cur] = 1;
  for (let k = 0; k < 4; k++) {
    const e = edges[k][0], dist = sd - e;
    if (Math.abs(dist) < 12) {
      const a = (dist + 12) / 24, before = order[k], after = order[k + 1];
      w.spring = w.summer = w.autumn = w.winter = 0;
      w[before] = 1 - a; w[after] = a;
    }
  }
  return w;
}
export const SEASON_NAME = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
export function seasonName(w) {
  return SEASON_NAME[Object.keys(w).reduce((a, b) => (w[a] >= w[b] ? a : b))];
}
// 바다가 열을 머금는 데 시간이 걸려(열관성), 실제 기온은 평형값을 향해 약 240일에 걸쳐 따라간다
export const THERMAL_DAYS = 240;
export function relaxWarming(current, equilibrium, days) {
  return equilibrium + (current - equilibrium) * Math.exp(-Math.max(0, days) / THERMAL_DAYS);
}
// 서울쯤의 평년 기온(1월 약 −2°C, 7월 말 약 27°C), 계절 기온 차가 커지면 여름은 더 덥고 겨울은 더 춥다
export function temperatureC(sd, eff, warm = eff.tempRise) {
  const season = -14.5 * Math.cos((2 * Math.PI * (sd - 15)) / 365);
  return 12.5 + season * eff.seasonAmp + Math.min(warm, 5000);
}

// ---------- 뉴스 ----------
export const BROADCASTS = [375000, 365000, 350000, 320000, 280000, 240000, 200000, 160000, 120000, 80000, 50000, 25000, 10000, 2000];
export function formatKm(km) { return Math.round(km).toLocaleString('en-US'); }
export function formatSpeed(kms) { return kms < 1 ? `${Math.round(kms * 1000)}m/s` : `${kms < 10 ? kms.toFixed(2) : kms.toFixed(1)}km/s`; }
export function formatTimes(x) { return x < 10 ? x.toFixed(1) : formatNumber(x); }
export function formatMeters(m) { return m < 1 ? `${Math.round(m * 100)}cm` : m < 1000 ? `${m < 10 ? m.toFixed(1) : Math.round(m)}m` : `${formatTimes(m / 1000)}km`; }
export function formatTemp(t) { return t > 1000 ? '측정 불가' : `${t >= 0 ? '+' : ''}${t < 10 && t > -10 ? t.toFixed(1) : Math.round(t)}°C`; }
export function massText(p, cfg = stageConfig(1)) {
  const em = earthMasses(p, cfg);
  if (em >= 1) return `지구 질량의 ${formatTimes(em)}배`;
  const pct = em * 100;
  return `지구 질량의 ${pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}
const quakeText = (q) => (q > 10 ? '측정 한계를 넘는' : `규모 ${q.toFixed(1)}`);

// 지금 조건을 만족하지만 아직 안 나온 뉴스들(오래된 것부터). seen: 이미 나온 뉴스 id 목록
export function pendingNews(p, cfg, seen, warm = null) {
  const has = new Set(seen || []);
  const out = [];
  const e = effects(p, cfg), km = distanceKm(p, cfg), name = planetStage(p, cfg).type.name;
  const v = formatSpeed(speedKms(p, cfg)), mt = formatTimes(moonTimes(p, cfg)), mass = massText(p, cfg), ratio = formatTimes(e.tideRatio);
  const add = (id, cond, head, lines) => { if (cond && !has.has(id)) out.push({ id, head, lines }); };
  // 거리
  let dIdx = -1;
  BROADCASTS.forEach((d, i) => { if (km <= d) dIdx = i; });
  if (dIdx >= 0) {
    const d = BROADCASTS[dIdx], at = `${formatKm(d)}km`;
    const lines = {
      375000: ['인공위성을 거느리며 자라는 천체가 관측됐습니다.', `지금은 ${name}만 한 크기, ${mass}입니다.`, '쏘아 올린 위성이 이 천체의 위성이 되면서 질량을 키우고 있습니다.'],
      365000: [`천체가 지구 쪽으로 움직이기 시작했습니다. 거리 ${at}.`, `서로의 중력에 끌려 ${v}로 다가오고 있습니다.`],
      350000: [`${name}급으로 자란 천체, 지구까지 ${at}입니다.`, `접근 속도는 ${v}. 가까워질수록 중력이 세져 더 빨라집니다.`],
      320000: [`질량은 ${mass}.`, `하늘에서는 보름달의 ${mt}배 크기로 보입니다.`],
      280000: [`${at} 지점을 통과했습니다.`, `접근 속도 ${v}. 조석력은 달의 ${ratio}배입니다.`],
      240000: [`${name}급 행성, 지구까지 ${at}.`, `보름달의 ${mt}배 크기로 보입니다.`],
      200000: [`행성이 달 궤도 안쪽 깊숙이 들어왔습니다. 거리 ${at}.`, `접근 속도 ${v}, 질량은 ${mass}.`],
      160000: [`지구까지 ${at}.`, `하늘의 행성은 보름달의 ${mt}배, 조석력은 달의 ${ratio}배입니다.`],
      120000: [`${at}. 정부는 전 지구 대피 명령을 내렸습니다.`, `접근 속도 ${v}.`],
      80000: [`지구까지 ${at}. 하늘의 절반을 행성이 덮었습니다.`, `보름달의 ${mt}배, ${v}로 떨어지고 있습니다.`],
      50000: [`${at}. 대기권 밖에서 파편이 불덩이가 되어 쏟아집니다.`, `접근 속도 ${v}.`],
      25000: [`긴급 속보입니다. 지구까지 ${at}.`, `속도 ${v}. 충돌까지 얼마 남지 않았습니다.`],
      10000: [`${at}… 충돌이 임박했습니다.`, '시청자 여러분, 지금까지 함께해 주셔서 감사했습니다.'],
      2000: [`…${at}.`, '안녕히 계세요, 지구.'],
    }[d];
    add(`d${d}`, true, { 375000: '정체불명 천체 관측', 10000: '충돌 임박', 2000: '마지막 방송' }[d] || `${name}급 행성 지구까지 ${at}`, lines);
  }
  // 바다: 조석과 해일
  const tide = formatMeters(e.tideM);
  const tideWhy = `원인은 행성의 조석력입니다. 조석력은 질량에 비례하고 거리의 세제곱에 반비례해서, 지금 달의 ${ratio}배입니다.`;
  add('tide1', e.tideM >= 1, '밀물이 평소보다 높다', [`바닷물이 평소보다 ${tide} 더 높이 차오릅니다.`, tideWhy]);
  add('tide10', e.tideM >= 10, `해수면 ${tide} 상승 — 해안 침수`, [`하루 두 번 바다가 ${tide}씩 차올라 해안 도시가 잠깁니다.`, tideWhy, '해일 경보가 내려졌습니다.']);
  add('tide100', e.tideM >= 100, '거대 해일, 내륙까지 바닷물', [`조석 해일 높이 ${tide}. 바다가 내륙 깊숙이 밀려듭니다.`, `행성 쪽을 향한 바다가 부풀어 오르는 조석 팽대부가 생겼습니다. 조석력은 달의 ${ratio}배.`]);
  add('tide1000', e.tideM >= 1000, '바다가 행성 쪽으로 쏠린다', [`해수면이 ${tide} 솟아올랐습니다.`, '조석력이 너무 커져, 지구의 바다 전체가 행성을 향해 쏠리고 있습니다.']);
  // 땅: 지진
  const ground = formatMeters(e.groundM);
  const quakeWhy = '행성의 조석력이 지각을 하루 두 번씩 늘였다 줄였다 하면서, 단층에 쌓여 있던 힘이 한꺼번에 풀리고 있습니다.';
  add('quake6', e.quake >= 6, '전국에서 강한 지진', [`${quakeText(e.quake)} 지진이 잇따릅니다.`, quakeWhy, `땅도 바다처럼 ${ground}씩 오르내립니다.`]);
  add('quake75', e.quake >= 7.5, '대지진, 건물 붕괴', [`${quakeText(e.quake)}의 대지진. 도시의 건물이 무너지고 있습니다.`, quakeWhy, `지각이 하루 두 번 ${ground}씩 출렁입니다.`]);
  add('quake9', e.quake >= 9, '관측 사상 최대 지진', [`${quakeText(e.quake)} 지진. 지구 전체가 흔들립니다.`, '조석 응력이 암석의 강도에 가까워져, 지각 곳곳이 갈라지고 화산이 깨어나고 있습니다.']);
  // 기온
  const wr = warm ?? e.tempRise, dT = formatTemp(wr), tw = formatTimes(e.tidalTW);
  const heatWhy = `조석 마찰로 바다와 지구 내부가 데워지고 있습니다. 조석 에너지는 조석력의 제곱에 비례해 지금 ${tw}TW(평소 3.7TW)입니다.`;
  const lagWhy = '바다가 열을 머금는 데 시간이 걸려, 기온은 몇 달에 걸쳐 서서히 오릅니다.';
  add('temp1', wr >= 1, `평균 기온 ${dT}`, [`지구 평균 기온이 평년보다 ${dT} 올랐습니다.`, heatWhy, lagWhy]);
  add('temp5', wr >= 5, '기록적 폭염', [`평균 기온 ${dT}. 곳곳에 폭염 경보가 내려졌습니다.`, heatWhy, '늘어난 화산 활동이 온실가스를 뿜어내 더 뜨거워지고 있습니다.']);
  add('temp30', wr >= 30, '바다가 끓기 시작', [`평균 기온 ${dT}. 강과 얕은 바다가 증발하고 있습니다.`, '조석 마찰열과 화산 가스, 쏟아지는 파편의 열이 겹쳤습니다.']);
  // 계절
  const amp = formatTimes(e.seasonAmp);
  const seasonWhy = '행성의 중력이 지구의 적도 쪽 불룩한 부분을 잡아당겨 자전축을 흔들고(세차·장동), 자전축 기울기가 출렁이기 때문입니다.';
  add('season15', e.seasonAmp >= 1.5, '계절이 뒤죽박죽', ['올해는 계절이 일찍 오거나 늦게 옵니다. 여름은 더 덥고 겨울은 더 춥습니다.', seasonWhy, `계절 기온 차가 평년의 ${amp}배입니다.`]);
  add('season25', e.seasonAmp >= 2.5, '극단적인 계절', [`계절 기온 차가 평년의 ${amp}배까지 벌어졌습니다.`, seasonWhy]);
  // 로슈 한계
  add('roche', e.insideRoche, e.earthTorn ? '지구가 로슈 한계 안으로' : '행성이 부서지기 시작', e.earthTorn
    ? [`지구가 행성의 로슈 한계 ${formatKm(e.rocheKm)}km 안쪽으로 들어왔습니다.`, '로슈 한계 안에서는 행성의 조석력이 지구를 붙잡는 중력보다 강해져, 지각과 맨틀이 찢어지기 시작합니다.']
    : [`행성이 지구의 로슈 한계 ${formatKm(e.rocheKm)}km 안쪽으로 들어왔습니다.`, '지구의 조석력이 행성을 붙잡는 중력보다 강해져, 행성이 부서지며 파편이 쏟아집니다.']);
  return out;
}
// 아래 속보 띠: 지금 지구 상황 요약
export function tickerText(p, cfg = stageConfig(1), warm = null) {
  const e = effects(p, cfg), wr = warm ?? e.tempRise;
  const parts = [`조석력 달의 ${formatTimes(e.tideRatio)}배`, `해수면 ${e.tideM >= 0.5 ? '+' + formatMeters(e.tideM) : '정상'}`];
  if (e.quake >= 5) parts.push(`지진 ${e.quake > 10 ? '측정 불가' : '규모 ' + e.quake.toFixed(1)}`);
  if (wr >= 0.1) parts.push(`기온 ${formatTemp(wr)}`);
  if (e.seasonAmp >= 1.3) parts.push(`계절 기온 차 ${formatTimes(e.seasonAmp)}배`);
  if (e.insideRoche) parts.push('로슈 한계 돌파');
  return parts.join(' · ');
}

// 자리를 비운 동안: 지금 생산으로 계속 쏘고, 날짜도 흐른다(최대 8시간, 충돌 직전까지)
export function offlineProgress(save, seconds) {
  const s = Math.min(OFFLINE_CAP, Math.max(0, seconds));
  const before = save.mass;
  const tons = totalRate(save) * s;
  addLaunch(save, tons);
  save.warm = relaxWarming(save.warm || 0, effects(progress(save.mass, stageConfig(save.stage)), stageConfig(save.stage)).tempRise, s);
  save.days = (save.days || 0) + s;
  save.time = (save.time || 0) + s;
  return { seconds: s, tons: save.mass - before, money: tons };
}

// 스테이지 클리어: 처음부터 다시(발사대 초기화), 대신 모든 발사 영구 ×1.25, 날짜는 계속 흐른다
export function nextStage(save) {
  const keep = { stage: (save.stage || 1) + 1, best: save.best, startDay: save.startDay, days: save.days, sound: save.sound, vibrate: save.vibrate };
  Object.assign(save, defaultSave(), keep);
  return save;
}

export function formatNumber(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const units = [[1e20, '해'], [1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      return (x < 10 ? (Math.floor(x * 10) / 10).toString() : Math.floor(x).toLocaleString('en-US')) + s;
    }
  }
  return String(n);
}
export function formatRate(r) {
  if (r < 10) return (Math.floor(r * 10) / 10).toString();
  return formatNumber(r);
}

export const SAVE_KEY = 'trashMoon.save';
export function defaultSave() {
  return {
    stage: 1, mass: 0, money: 0, sent: 0, sats: 0, warm: 0, owned: LAUNCHERS.map(() => 0), tapLv: 0, seen: 1, best: 0, time: 0,
    startDay: Math.floor(Date.now() / DAY_MS), days: 0, lastSeen: 0, newsSeen: [], sound: true, vibrate: true,
  };
}
export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    // 쓰레기 버전 저장은 이어 쓰지 않고 새로 시작(소리 설정만 유지)
    if (!('stage' in parsed)) return { ...defaultSave(), sound: parsed.sound !== false, vibrate: parsed.vibrate !== false };
    const s = { ...defaultSave(), ...parsed };
    const owned = Array.isArray(s.owned) ? s.owned : [];
    s.owned = LAUNCHERS.map((_, i) => Math.max(0, owned[i] | 0));
    for (const k of ['mass', 'money', 'sent', 'time', 'days', 'sats', 'warm']) s[k] = Math.max(0, +s[k] || 0);
    s.stage = Math.max(1, s.stage | 0);
    s.mass = Math.min(stageConfig(s.stage).endMass, s.mass);
    if (!Array.isArray(s.newsSeen)) s.newsSeen = [];
    return s;
  } catch {
    return defaultSave();
  }
}
export function storeSave(storage, save) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 */ }
}
