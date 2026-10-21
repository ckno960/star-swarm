// 정중앙 스매시 — 판정, 점프, 피해, 스테이지. 화면과 분리된 순수 로직.

// 바늘 판정: 바늘 위치 p는 -1(왼쪽 끝) ~ 1(오른쪽 끝), 0이 정중앙
export const PERFECT_ZONE = 0.08;
export const GREAT_ZONE = 0.22;
export const GOOD_ZONE = 0.5;

// 최고점 판정: 최고점 시각과의 차이(초)
export const APEX_PERFECT = 0.07;
export const APEX_GREAT = 0.16;
export const APEX_OK = 0.32;

export const ACC_PERFECT_MULT = 3;
export const APEX_MULT = { perfect: 2, great: 1.5, ok: 1.15, early: 1, late: 1, none: 1 };
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 5;
export const BASE_DAMAGE = 100;

// 화면 단위: 기본 화면 높이 = 100 단위. 지역마다 1단위가 몇 m인지가 달라져서
// 같은 화면 구도로 사람 → 거인 → 거신 → 우주 거신으로 커진 느낌을 낸다.
export const VIEW = 100;
export const HERO_H = 12;

export const REGIONS = [
  {
    id: 'village', name: '마을', title: '사람', mPerUnit: 0.15, hpUnit: 1,
    jumps: [40, 55, 70, 85, 100],
    targets: [
      { name: '나무 오두막', kind: 'hut', w: 30, h: 22, color: '#a0663a', roof: '#c0392b' },
      { name: '풍차', kind: 'mill', w: 22, h: 36, color: '#e8d8b0', roof: '#7a4a2a' },
      { name: '대장간', kind: 'house', w: 34, h: 26, color: '#8a8a8a', roof: '#4a3a3a' },
      { name: '마을 교회', kind: 'church', w: 30, h: 40, color: '#f0e8d8', roof: '#3a5a9a' },
      { name: '촌장의 저택', kind: 'manor', w: 46, h: 38, color: '#d8b880', roof: '#8a2a2a', boss: true },
    ],
  },
  {
    id: 'city', name: '도시', title: '거인', mPerUnit: 2, hpUnit: 100,
    jumps: [120, 160, 200, 260, 340],
    targets: [
      { name: '편의점', kind: 'shop', w: 34, h: 18, color: '#e8e8e8', roof: '#2a9a5a' },
      { name: '아파트', kind: 'tower', w: 30, h: 44, color: '#d8c8a8', roof: '#8a7a6a' },
      { name: '백화점', kind: 'mall', w: 46, h: 34, color: '#c8a8d8', roof: '#6a4a8a' },
      { name: '방송국 타워', kind: 'antenna', w: 20, h: 50, color: '#b8c8d8', roof: '#e04040' },
      { name: '초고층 빌딩', kind: 'sky', w: 30, h: 60, color: '#6a9ac8', roof: '#2a4a6a', boss: true },
    ],
  },
  {
    id: 'nation', name: '나라', title: '거신', mPerUnit: 40, hpUnit: 10000,
    jumps: [400, 550, 700, 900, 1200],
    targets: [
      { name: '국경 요새', kind: 'fort', w: 44, h: 26, color: '#9a9080', roof: '#5a5040' },
      { name: '왕궁', kind: 'castle', w: 46, h: 42, color: '#e0d8c8', roof: '#3a4aa0' },
      { name: '화산', kind: 'volcano', w: 60, h: 40, color: '#5a4038', roof: '#ff6a20' },
      { name: '설산', kind: 'mountain', w: 64, h: 50, color: '#7a8a9a', roof: '#ffffff' },
      { name: '대륙 수도', kind: 'capital', w: 60, h: 56, color: '#c8b890', roof: '#d0a020', boss: true },
    ],
  },
  {
    id: 'planet', name: '행성', title: '우주 거신', mPerUnit: 20000, hpUnit: 1000000,
    jumps: [1500, 2200, 3000, 4000, 6000],
    targets: [
      { name: '달', kind: 'planet', w: 70, h: 70, color: '#c8c8c0', roof: '#8a8a88' },
      { name: '화성', kind: 'planet', w: 76, h: 76, color: '#d0603a', roof: '#8a3020' },
      { name: '금성', kind: 'planet', w: 80, h: 80, color: '#e8c070', roof: '#b08040' },
      { name: '토성', kind: 'ringed', w: 84, h: 84, color: '#e0c890', roof: '#a08050' },
      { name: '목성', kind: 'gas', w: 96, h: 96, color: '#d8a878', roof: '#a05a30', boss: true },
    ],
  },
];

export const STAGE_COUNT = REGIONS.reduce((n, r) => n + r.targets.length, 0);

export function stageInfo(index) {
  let i = index;
  for (let r = 0; r < REGIONS.length; r++) {
    const region = REGIONS[r];
    if (i < region.targets.length) {
      const target = region.targets[i];
      const need = (7 + 0.35 * index) * (target.boss ? 1.4 : 1);
      return {
        index, regionIndex: r, region, local: i, target,
        boss: !!target.boss,
        maxHp: Math.round(need * BASE_DAMAGE),
        time: (target.boss ? 22 : 16) + 2 * r,
        needleSpeed: 0.55 + 0.03 * index,  // 초당 왕복 횟수 (정중앙 통과 속도 = 4 × 이 값)
        maxJump: region.jumps[i],
        label: `${region.name} ${i + 1}`,
      };
    }
    i -= region.targets.length;
  }
  return null;
}

// 바늘: 삼각파로 좌우 왕복. phase는 0~1 사이 시작 위치
export function needlePos(t, speed, phase = 0) {
  const x = ((t * speed + phase) % 1 + 1) % 1;
  return x < 0.5 ? -1 + 4 * x : 3 - 4 * x;
}

export function judgeJump(p) {
  const off = Math.abs(p);
  const acc = Math.max(0, 1 - off);
  let grade = 'miss';
  if (off <= PERFECT_ZONE) grade = 'perfect';
  else if (off <= GREAT_ZONE) grade = 'great';
  else if (off <= GOOD_ZONE) grade = 'good';
  return { grade, acc };
}

// 정중앙에 가까울수록 높이 뛴다. Perfect는 최고 높이.
export function jumpFraction(j) {
  return j.grade === 'perfect' ? 1 : 0.15 + 0.62 * j.acc * j.acc;
}

export function accMult(j) {
  return j.grade === 'perfect' ? ACC_PERFECT_MULT : 0.2 + 1.8 * j.acc * j.acc;
}

// 점프 체공 시간(초). 높이 뛸수록, 큰 지역일수록 조금 더 길다.
export function airTime(frac, regionIndex = 0) {
  return 0.9 + 1.0 * frac + 0.12 * regionIndex;
}

const HANG = 2.2;  // 2보다 크면 최고점에서 더 오래 머무르고 도약·낙하는 더 빠르다
export function heightAt(t, T, H) {
  const u = Math.min(1, Math.max(0, t / T));
  return H * (1 - Math.abs(2 * u - 1) ** HANG);
}

export function judgeApex(t, T) {
  const dt = t - T / 2;
  const a = Math.abs(dt);
  if (a <= APEX_PERFECT) return 'perfect';
  if (a <= APEX_GREAT) return 'great';
  if (a <= APEX_OK) return 'ok';
  return dt < 0 ? 'early' : 'late';
}

// 내려찍기: 지금 높이에서 가속하며 떨어지는 시간(초)
export function diveTime(h, maxJump) {
  return 0.16 + 0.24 * Math.sqrt(Math.max(0, h) / maxJump);
}

export function comboMult(combo) {
  return 1 + COMBO_STEP * Math.min(combo, COMBO_MAX);
}

export function damage(jump, apex, combo) {
  return Math.round(BASE_DAMAGE * accMult(jump) * APEX_MULT[apex] * comboMult(combo));
}

// 두 판정 중 하나라도 Perfect면 콤보 유지, 둘 다 아니면 끊김
export function nextCombo(combo, jump, apex) {
  return jump.grade === 'perfect' || apex === 'perfect' ? combo + 1 : 0;
}

export function formatMeters(units, region) {
  const m = units * region.mPerUnit;
  if (m < 1000) return `${m < 100 ? m.toFixed(1) : Math.round(m)}m`;
  const km = m / 1000;
  if (km < 1000) return `${km < 100 ? km.toFixed(1) : Math.round(km)}km`;
  return `${Math.round(km).toLocaleString('en-US')}km`;
}

export function formatNumber(n) {
  n = Math.round(n);
  if (n < 10000) return String(n);
  const units = [[1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      return (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.floor(x).toLocaleString('en-US')) + s;
    }
  }
  return String(n);
}

export const SAVE_KEY = 'centerSmash.save';
export function defaultSave() {
  return { unlocked: 0, best: 0, cleared: {}, sound: true, vibrate: true };
}
export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = { ...defaultSave(), ...JSON.parse(raw) };
    s.unlocked = Math.max(0, Math.min(STAGE_COUNT - 1, s.unlocked | 0));
    return s;
  } catch {
    return defaultSave();
  }
}
export function storeSave(storage, save) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 */ }
}
export function recordClear(save, index, score) {
  save.cleared[index] = true;
  save.unlocked = Math.min(STAGE_COUNT - 1, Math.max(save.unlocked, index + 1));
  save.best = Math.max(save.best, score);
  return save;
}
