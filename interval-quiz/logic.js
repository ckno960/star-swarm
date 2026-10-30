// 음정 퀴즈 — 음, 음정 계산, 문제 만들기, 단계, 진행 저장. 화면과 분리된 순수 로직.

// 음은 { l: 음이름 0~6(도~시), o: 옥타브, a: 임시표 -2(겹내림)~2(겹올림) }. 가운데 도 = { l: 0, o: 4, a: 0 }
export const LETTER_NAMES = ['도', '레', '미', '파', '솔', '라', '시'];
export const ACC_SIGNS = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const LETTER_SEMIS = [0, 2, 4, 5, 7, 9, 11];

export const QUALITIES = ['완전', '장', '단', '증', '감', '겹증', '겹감'];
export const DEGREES = [1, 2, 3, 4, 5, 6, 7, 8];
const PERFECT_DEGREES = [1, 4, 5, 8];
// 완전·장음정의 반음 수
const BASE_SEMIS = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
// 기본(완전·장)에서 반음이 몇 개 늘거나 줄었는지 → 성질
const PERFECT_OFFSETS = { '-2': '겹감', '-1': '감', 0: '완전', 1: '증', 2: '겹증' };
const MAJOR_OFFSETS = { '-3': '겹감', '-2': '감', '-1': '단', 0: '장', 1: '증', 2: '겹증' };

// 오선 안팎으로 보여줄 범위: 가운데 도(덧줄 1개) ~ 높은 도(덧줄 2개)
export const LOW_STEP = 28;
export const HIGH_STEP = 42;
// 화면 아래 건반(가운데 도 ~ 높은 도, 2옥타브)으로 칠 수 있는 음만 낸다
export const KEY_LOW = 48;
export const KEY_HIGH = 72;

export function isPerfectType(degree) {
  return PERFECT_DEGREES.includes(degree);
}

export function step(n) {
  return n.o * 7 + n.l;
}

export function pitch(n) {
  return n.o * 12 + LETTER_SEMIS[n.l] + n.a;
}

export function noteName(n) {
  return LETTER_NAMES[n.l] + ACC_SIGNS[n.a];
}

export function qualityOffset(quality, degree) {
  const table = isPerfectType(degree) ? PERFECT_OFFSETS : MAJOR_OFFSETS;
  const key = Object.keys(table).find(k => table[k] === quality);
  return key === undefined ? null : Number(key);
}

// 두 음 사이 음정. 순서와 상관없이 낮은 음 → 높은 음으로 센다. 8도를 넘으면 null
export function interval(a, b) {
  const below = step(a) < step(b) || (step(a) === step(b) && pitch(a) <= pitch(b));
  const [lo, hi] = below ? [a, b] : [b, a];
  const degree = step(hi) - step(lo) + 1;
  if (degree > 8) return null;
  const semis = pitch(hi) - pitch(lo);
  const table = isPerfectType(degree) ? PERFECT_OFFSETS : MAJOR_OFFSETS;
  const quality = table[semis - BASE_SEMIS[degree]] ?? null;
  return { degree, semis, quality };
}

export function intervalName(iv) {
  return `${iv.quality}${iv.degree}도`;
}

// 낮은 음 위로 (성질, 도수)만큼 올린 음. 임시표가 겹올림·겹내림을 넘으면 null
export function noteAbove(lo, quality, degree) {
  const offset = qualityOffset(quality, degree);
  if (offset === null) return null;
  const s = step(lo) + degree - 1;
  const hi = { l: s % 7, o: Math.floor(s / 7), a: 0 };
  hi.a = pitch(lo) + BASE_SEMIS[degree] + offset - pitch(hi);
  return Math.abs(hi.a) <= 2 ? hi : null;
}

// ---------- 단계 ----------
// pool: 나올 수 있는 성질과 비율, maxAcc: 한 음에 붙는 임시표 한도, down: 내려가는 음정도 내는지
export const STAGES = [
  { name: '흰건반', desc: '임시표 없이 도레미파솔라시만', naturalOnly: true, maxAcc: 0, down: false },
  { name: '♯·♭ 하나', desc: '완전·장·단, 증4도·감5도', maxAcc: 1, down: false,
    pool: { 완전: 3, 장: 3, 단: 3, 증: 0.5, 감: 0.5 }, onlyTritone: true },
  { name: '증·감', desc: '모든 도수의 증·감음정', maxAcc: 1, down: false,
    pool: { 완전: 1, 장: 1, 단: 1, 증: 3, 감: 3 } },
  { name: '겹증·겹감', desc: '𝄪·𝄫이 붙는 겹증·겹감음정', maxAcc: 2, down: false,
    pool: { 완전: 1, 장: 1, 단: 1, 증: 1.5, 감: 1.5, 겹증: 3, 겹감: 3 } },
  { name: '종합', desc: '모든 음정, 내려가는 음정도', maxAcc: 2, down: true,
    pool: { 완전: 2, 장: 2, 단: 2, 증: 2, 감: 2, 겹증: 1, 겹감: 1 } },
];
export const QUESTION_COUNT = 10;
export const PASS_SCORE = 8;

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) < 0) return k;
  }
  return entries[entries.length - 1][0];
}

function validFor(quality, degree, stage) {
  if (qualityOffset(quality, degree) === null) return false;
  // 감1도는 위 음이 아래로 내려가 버려 내지 않는다
  if (degree === 1 && quality !== '완전' && quality !== '증' && quality !== '겹증') return false;
  if (stage.onlyTritone && (quality === '증' || quality === '감')) {
    return (quality === '증' && degree === 4) || (quality === '감' && degree === 5);
  }
  return true;
}

function randomLow(rng, degree, maxAcc) {
  const top = Math.min(HIGH_STEP - (degree - 1), 38);
  const s = LOW_STEP + Math.floor(rng() * (top - LOW_STEP + 1));
  const a = maxAcc === 0 ? 0 : Math.floor(rng() * 3) - 1;
  return { l: s % 7, o: Math.floor(s / 7), a };
}

// 문제 하나: { a, b } (a를 먼저 왼쪽에 그림)와 정답 음정
export function makeQuestion(stageIndex, rng = Math.random) {
  return makeFrom(STAGES[stageIndex], stageIndex, rng);
}

// 자유연습: 고른 성질들이 고르게 나온다. 임시표는 겹올림·겹내림까지
export const FREE_COUNTS = [5, 10, 20, 30, 50];
export function freeStage(options) {
  return {
    pool: Object.fromEntries(options.qualities.map(q => [q, 1])),
    maxAcc: 2,
    down: !!options.down,
  };
}

export function makeFreeRound(options, rng = Math.random) {
  if (!options.qualities.length) throw new Error('성질을 하나 이상 골라야 함');
  const stage = freeStage(options);
  return collect(() => makeFrom(stage, 'free', rng), options.count);
}

function makeFrom(stage, tag, rng) {
  for (let tries = 0; tries < 500; tries++) {
    const degree = pick(rng, DEGREES);
    let lo, hi;
    if (stage.naturalOnly) {
      lo = randomLow(rng, degree, 0);
      const s = step(lo) + degree - 1;
      hi = { l: s % 7, o: Math.floor(s / 7), a: 0 };
    } else {
      const quality = pickWeighted(rng, stage.pool);
      if (!validFor(quality, degree, stage)) continue;
      lo = randomLow(rng, degree, Math.min(stage.maxAcc, 1));
      hi = noteAbove(lo, quality, degree);
      if (!hi || Math.abs(hi.a) > stage.maxAcc) continue;
      // 2단계는 임시표가 적어도 하나는 붙게
      if (stage.maxAcc === 1 && stage.onlyTritone && lo.a === 0 && hi.a === 0 && rng() < 0.7) continue;
    }
    if (pitch(hi) < pitch(lo)) continue;
    if (pitch(lo) < KEY_LOW || pitch(hi) > KEY_HIGH) continue;
    const iv = interval(lo, hi);
    if (!iv || !iv.quality) continue;
    const down = stage.down && rng() < 0.5;
    return { a: down ? hi : lo, b: down ? lo : hi, answer: { quality: iv.quality, degree: iv.degree }, stage: tag };
  }
  throw new Error('문제를 만들 수 없음: ' + tag);
}

export function makeRound(stageIndex, rng = Math.random) {
  return collect(() => makeQuestion(stageIndex, rng), QUESTION_COUNT);
}

// 같은 문제가 겹치지 않게 모은다 (겹치지 않는 문제가 40개를 넘으면 겹쳐도 허용)
function collect(make, count) {
  const qs = [];
  const seen = new Set();
  while (qs.length < count) {
    const q = make();
    const key = questionKey(q);
    if (seen.has(key) && seen.size < 40) continue;
    seen.add(key);
    qs.push(q);
  }
  return qs;
}

export function isCorrect(q, quality, degree) {
  return q.answer.quality === quality && q.answer.degree === degree;
}

// 맞힌 뒤 보여줄 풀이: "레 → 파♯ · 3도, 반음 4개 → 장3도"
export function explain(q) {
  const iv = interval(q.a, q.b);
  return `${noteName(q.a)} → ${noteName(q.b)} · ${iv.degree}도, 반음 ${iv.semis}개 → ${intervalName(iv)}`;
}

export function questionKey(q) {
  const n = x => `${x.l}.${x.o}.${x.a}`;
  return n(q.a) + '-' + n(q.b);
}

// ---------- 진행 ----------
// progress: { best: { [단계]: 최고 맞힌 수 } }
export function isUnlocked(progress, stageIndex) {
  return stageIndex === 0 || isCleared(progress, stageIndex - 1);
}

export function isCleared(progress, stageIndex) {
  return (progress.best?.[stageIndex] ?? 0) >= PASS_SCORE;
}

export function recordRound(progress, stageIndex, score) {
  progress.best ??= {};
  progress.best[stageIndex] = Math.max(progress.best[stageIndex] ?? 0, score);
  return progress;
}

// 오답 노트: 틀린 문제를 모아 두고, 다시 풀어 맞히면 뺀다
export function addWrong(wrongs, q, picked) {
  const key = questionKey(q);
  const rest = wrongs.filter(w => questionKey(w) !== key);
  return [{ a: q.a, b: q.b, answer: q.answer, stage: q.stage, picked }, ...rest].slice(0, 100);
}

export function removeWrong(wrongs, q) {
  const key = questionKey(q);
  return wrongs.filter(w => questionKey(w) !== key);
}
