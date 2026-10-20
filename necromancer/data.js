// 게임 데이터: 지역, 몬스터, 능력치, 길들이기 확률. DOM 접근 없음.
export const STAGES_PER_REGION = 10;
export const REGION_POWER = 2.2; // 다음 지역 몬스터는 이만큼 강하다
export const LEVEL_GROWTH = 0.12; // 레벨 1당 능력치 +12%
export const MAX_LEVEL = 30;

// 강함 등급(tier)마다 몸 모양과 기본 능력치가 정해져 있다. interval은 공격 간격(초)
// 별 하나당 힘이 조금씩 더 커지게 맞췄다(√(체력×초당 피해) ≈ 17 × 별^1.15). 그래야 비싼 몬스터를 쓸 이유가 생긴다
export const SHAPES = {
  blob: { hp: 60, atk: 6, interval: 1.2, trait: 'regen' },
  beast: { hp: 75, atk: 13, interval: 0.7, trait: 'swift' },
  flyer: { hp: 80, atk: 45, interval: 1.0, trait: 'ambush' },
  humanoid: { hp: 140, atk: 55, interval: 1.1, trait: 'drain' },
  golem: { hp: 300, atk: 70, interval: 1.8, trait: 'splash' },
  boss: { hp: 900, atk: 60, interval: 1.4, trait: 'splash' },
};
// 소환할 때 드는 별. 소환수 별 합은 네크로맨서 레벨에 따른 한도를 넘을 수 없다
export const STARS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, boss: 8 };
export const SPLASH_TARGETS = 2; // 광역 공격이 함께 때리는 뒤쪽 적 수
export const TIER_SHAPES = [null, 'blob', 'beast', 'flyer', 'humanoid', 'golem'];

export const TRAITS = {
  regen: { name: '재생', desc: '계속 조금씩 체력 회복 (3초에 2%)' },
  swift: { name: '속공', desc: '공격이 빠름' },
  ambush: { name: '급습', desc: '맨 앞이 아닌 아무 적이나 공격' },
  drain: { name: '흡혈', desc: '준 피해의 30%만큼 회복' },
  splash: { name: '광역', desc: '맨 앞 적과 그 뒤 2마리에게도 30% 피해' },
  bolt: { name: '암흑 화살', desc: '아무 적이나 공격' },
};

// 강한 몬스터일수록 길들이기 어렵다
export const TAME_CHANCE = { 1: 0.7, 2: 0.55, 3: 0.4, 4: 0.25, 5: 0.12, boss: 0.08 };

export const REGIONS = [
  { name: '마을', bg: 'village', monsters: ['slime', 'dog', 'crow', 'guard', 'scarecrow'], boss: 'chief' },
  { name: '도시', bg: 'city', monsters: ['sewer', 'alleycat', 'neonbat', 'police', 'steel'], boss: 'mayor' },
  { name: '나라', bg: 'kingdom', monsters: ['venom', 'warhorse', 'griffin', 'knight', 'siege'], boss: 'king' },
  { name: '행성', bg: 'planet', monsters: ['acid', 'sandlizard', 'ptero', 'warden', 'lava'], boss: 'earthdragon' },
  { name: '우주', bg: 'cosmos', monsters: ['darkmatter', 'starhound', 'comet', 'angel', 'nebula'], boss: 'creator' },
];

// m 몸, d 짙은 부분, h 머리/투구, s 피부, w 눈 흰자, k 검정
const M = (name, region, tier, colors) => ({ name, region, tier, shape: TIER_SHAPES[tier], colors });
const B = (name, region, colors) => ({ name, region, tier: 'boss', shape: 'boss', colors });
export const MONSTERS = {
  skeleton: { name: '해골 병사', region: 0, tier: 2, shape: 'humanoid', stats: { hp: 100, atk: 15.7, interval: 1.1, trait: 'drain' }, colors: { m: '#e8e6dc', d: '#a8a69c', h: '#e8e6dc', s: '#e8e6dc', w: '#7dff6a', k: '#20202a' }, starter: true },

  slime: M('슬라임', 0, 1, { m: '#5bd65b', d: '#3a9a3a', w: '#fff', k: '#111' }),
  dog: M('들개', 0, 2, { m: '#9a6a3a', d: '#6a4422', w: '#fff', k: '#111' }),
  crow: M('까마귀', 0, 3, { m: '#2a2a3a', d: '#ffb020', w: '#ff3030', k: '#111' }),
  guard: M('마을 경비병', 0, 4, { m: '#3a5fcf', d: '#c8ccd8', h: '#c8ccd8', s: '#f2c49b', w: '#fff', k: '#111' }),
  scarecrow: M('허수아비 골렘', 0, 5, { m: '#d8b45a', d: '#8a5a2a', w: '#111', k: '#ff7a1a' }),
  chief: B('촌장 오우거', 0, { m: '#7a9a4a', d: '#5a3a22', w: '#fff', k: '#111', c: '#ffd23f' }),

  sewer: M('하수구 슬라임', 1, 1, { m: '#7a8a5a', d: '#4a5a3a', w: '#ff0', k: '#111' }),
  alleycat: M('도둑고양이', 1, 2, { m: '#f08a3a', d: '#a85a1a', w: '#7dff6a', k: '#111' }),
  neonbat: M('네온 박쥐', 1, 3, { m: '#c040ff', d: '#ff40c0', w: '#fff', k: '#111' }),
  police: M('도시 경찰', 1, 4, { m: '#1e2a5a', d: '#ffd23f', h: '#1e2a5a', s: '#e0ac7e', w: '#fff', k: '#111' }),
  steel: M('강철 골렘', 1, 5, { m: '#8a96a8', d: '#4a5262', w: '#40e0ff', k: '#111' }),
  mayor: B('기계 시장', 1, { m: '#6a7a8a', d: '#2a3a4a', w: '#ff3030', k: '#111', c: '#40e0ff' }),

  venom: M('독 슬라임', 2, 1, { m: '#9a4ad9', d: '#6a2a9a', w: '#fff', k: '#111' }),
  warhorse: M('군마', 2, 2, { m: '#3a2a22', d: '#c8ccd8', w: '#fff', k: '#111' }),
  griffin: M('그리폰', 2, 3, { m: '#d8a040', d: '#f2f2f2', w: '#fff', k: '#111' }),
  knight: M('왕국 기사', 2, 4, { m: '#c02020', d: '#ffd23f', h: '#c8ccd8', s: '#c8ccd8', w: '#111', k: '#111' }),
  siege: M('공성 골렘', 2, 5, { m: '#7a6a5a', d: '#4a3a2a', w: '#ff7a1a', k: '#111' }),
  king: B('폭군 국왕', 2, { m: '#8a1a3a', d: '#3a0a1a', w: '#ffd23f', k: '#111', c: '#ffd23f' }),

  acid: M('산성 점액', 3, 1, { m: '#b0ff30', d: '#60a010', w: '#111', k: '#ff3030' }),
  sandlizard: M('모래 도마뱀', 3, 2, { m: '#e0c070', d: '#a07a30', w: '#ff3030', k: '#111' }),
  ptero: M('익룡', 3, 3, { m: '#2a9a8a', d: '#ffb020', w: '#fff', k: '#111' }),
  warden: M('행성 수호자', 3, 4, { m: '#e06a20', d: '#40e0ff', h: '#40e0ff', s: '#40e0ff', w: '#fff', k: '#111' }),
  lava: M('용암 거인', 3, 5, { m: '#c03010', d: '#ffb020', w: '#ffd23f', k: '#111' }),
  earthdragon: B('대지룡', 3, { m: '#5a7a3a', d: '#c03010', w: '#ffd23f', k: '#111', c: '#ffb020' }),

  darkmatter: M('암흑 물질', 4, 1, { m: '#2a1a4a', d: '#6a40c0', w: '#c0a0ff', k: '#000' }),
  starhound: M('별사냥개', 4, 2, { m: '#30c0e0', d: '#f2f2ff', w: '#fff', k: '#111' }),
  comet: M('혜성 정령', 4, 3, { m: '#e0f0ff', d: '#60a0ff', w: '#2040a0', k: '#111' }),
  angel: M('타락 천사', 4, 4, { m: '#f2f2f2', d: '#ffd23f', h: '#ffd23f', s: '#f6d2b0', w: '#111', k: '#111' }),
  nebula: M('성운 거인', 4, 5, { m: '#c040a0', d: '#4020a0', w: '#fff', k: '#111' }),
  creator: B('창조신', 4, { m: '#f2f2f2', d: '#ffd23f', w: '#40e0ff', k: '#111', c: '#ffffff' }),
};

export function regionPower(region) {
  return REGION_POWER ** region;
}

export function levelMult(level) {
  return 1 + LEVEL_GROWTH * (level - 1);
}

export function starsOf(typeId) {
  return STARS[MONSTERS[typeId].tier];
}

export function unitStats(typeId, level) {
  const t = MONSTERS[typeId], base = t.stats ?? SHAPES[t.shape];
  const p = regionPower(t.region) * levelMult(level);
  return { hp: Math.round(base.hp * p), atk: Math.round(base.atk * p * 10) / 10, interval: base.interval, trait: base.trait };
}

export function tameChance(typeId) {
  return TAME_CHANCE[MONSTERS[typeId].tier];
}
