// 조표 퀴즈 — 조표(♯·♭ 개수)와 장조·단조 이름, 단계별·자유연습 문제와 보기, 오답 노트. 화면과 분리된 순수 로직.
import { noteAbove, QUESTION_COUNT, FREE_COUNTS } from './logic.js';
import { enName } from './chords.js';

export { QUESTION_COUNT, FREE_COUNTS };

// sig: ♯ 개수는 양수, ♭ 개수는 음수 (-7 ~ 7)
// 높은음자리표에 조표를 다는 자리(logic.js의 step): ♯은 파·도·솔·레·라·미·시, ♭은 시·미·라·레·솔·도·파 순서
export const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
export const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];
const SHARP_LETTERS = [3, 0, 4, 1, 5, 2, 6];
const FLAT_LETTERS = [6, 2, 5, 1, 4, 0, 3];

export function signatureNotes(sig) {
  const letters = sig > 0 ? SHARP_LETTERS : FLAT_LETTERS;
  return letters.slice(0, Math.abs(sig)).map(l => ({ l, o: 4, a: Math.sign(sig) }));
}

// 장조 으뜸음: C에서 ♯ 하나마다 완전5도 위, ♭ 하나마다 완전4도 위
export function majorTonic(sig) {
  let n = { l: 0, o: 4, a: 0 };
  for (let i = 0; i < Math.abs(sig); i++) {
    n = noteAbove(n, '완전', sig > 0 ? 5 : 4);
    n.o = 4;
  }
  return n;
}

// 나란한단조 으뜸음 = 장조 으뜸음의 장6도 위
export function minorTonic(sig) {
  return { ...noteAbove(majorTonic(sig), '장', 6), o: 4 };
}

export function tonic(sig, mode) {
  return mode === 'major' ? majorTonic(sig) : minorTonic(sig);
}

export function keyName(sig, mode) {
  return `${enName(tonic(sig, mode))} ${mode}`;
}

// 스케일: 장조는 장음계, 단조는 자연단음계로 으뜸음부터 한 옥타브
const MAJOR_STEPS = [['장', 2], ['장', 3], ['완전', 4], ['완전', 5], ['장', 6], ['장', 7], ['완전', 8]];
const MINOR_STEPS = [['장', 2], ['단', 3], ['완전', 4], ['완전', 5], ['단', 6], ['단', 7], ['완전', 8]];
export function scale(sig, mode) {
  const t = tonic(sig, mode);
  return [t, ...(mode === 'major' ? MAJOR_STEPS : MINOR_STEPS).map(([q, d]) => noteAbove(t, q, d))];
}

export function sigText(sig) {
  if (sig === 0) return '조표 없음';
  return `${sig > 0 ? '♯' : '♭'} ${Math.abs(sig)}개 (${signatureNotes(sig).map(enName).join(' ')})`;
}

// ---------- 단계 ----------
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KEY_STAGES = [
  { name: '♯ 장조', desc: '조표 없음 ~ ♯ 4개의 장조', sigs: range(0, 4), modes: ['major'] },
  { name: '♭ 장조', desc: '♭ 1 ~ 4개의 장조', sigs: range(-4, -1), modes: ['major'] },
  { name: '모든 장조', desc: '♯·♭ 7개까지 15개 장조', sigs: range(-7, 7), modes: ['major'] },
  { name: '단조', desc: '♯·♭ 4개까지의 단조', sigs: range(-4, 4), modes: ['minor'] },
  { name: '모든 단조', desc: '♯·♭ 7개까지 15개 단조', sigs: range(-7, 7), modes: ['minor'] },
  { name: '종합', desc: '장조와 단조를 섞어서', sigs: range(-7, 7), modes: ['major', 'minor'] },
];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 보기: 같은 장조·단조에서 조표가 하나 많거나 적은 조, 같은 개수의 반대 조표(♯2 ↔ ♭2), 소리가 같은 딴이름 조
export function makeKeyOptions(sig, mode, rng = Math.random) {
  const answer = keyName(sig, mode);
  const near = [sig - 1, sig + 1, -sig];
  const far = [sig - 2, sig + 2, sig + 12, sig - 12, sig + 5, sig - 5];
  const names = new Set([answer]);
  const picked = [];
  for (const s of [...shuffle(rng, near), ...shuffle(rng, far)]) {
    if (s < -7 || s > 7) continue;
    const name = keyName(s, mode);
    if (names.has(name)) continue;
    names.add(name);
    picked.push(name);
    if (picked.length === 3) break;
  }
  return shuffle(rng, [answer, ...picked]);
}

function makeFrom(stage, tag, rng) {
  const sig = pick(rng, stage.sigs);
  const mode = pick(rng, stage.modes);
  return { kind: 'key', sig, mode, answer: { name: keyName(sig, mode) }, options: makeKeyOptions(sig, mode, rng), stage: tag };
}

export function makeKeyQuestion(stageIndex, rng = Math.random) {
  return makeFrom(KEY_STAGES[stageIndex], stageIndex, rng);
}

export function makeKeyRound(stageIndex, rng = Math.random) {
  return collect(() => makeKeyQuestion(stageIndex, rng), QUESTION_COUNT, rng);
}

// 자유연습: modes(장조·단조), sides(♯조·♭조, 조표 없음은 둘 다에 들어감)
export function freeSigs(sides) {
  return range(-7, 7).filter(s => s === 0 ? sides.length > 0 : sides.includes(s > 0 ? 'sharp' : 'flat'));
}

export function makeFreeKeyRound(options, rng = Math.random) {
  if (!options.modes.length || !options.sides.length) throw new Error('장조·단조와 조표 종류를 하나 이상 골라야 함');
  const stage = { sigs: freeSigs(options.sides), modes: options.modes };
  return collect(() => makeFrom(stage, 'free', rng), options.count, rng);
}

// 조는 15×2개뿐이라 연달아 같은 조만 피한다
function collect(make, count, rng) {
  const qs = [];
  while (qs.length < count) {
    const q = make();
    const prev = qs[qs.length - 1];
    if (prev && keyKey(prev) === keyKey(q) && rng() < 0.9) continue;
    qs.push(q);
  }
  return qs;
}

// 풀이: "♯ 2개 (F♯ C♯) → D major" / 단조는 "… → D major의 나란한단조 → B minor"
export function explainKey(q) {
  const major = keyName(q.sig, 'major');
  return q.mode === 'major'
    ? `${sigText(q.sig)} → ${major}`
    : `${sigText(q.sig)} → ${major}의 나란한단조 → ${q.answer.name}`;
}

export function keyKey(q) {
  return `${q.sig}.${q.mode}`;
}

export function addKeyWrong(wrongs, q, picked) {
  const key = keyKey(q);
  return [{ ...q, picked }, ...wrongs.filter(w => keyKey(w) !== key)].slice(0, 100);
}

export function removeKeyWrong(wrongs, q) {
  const key = keyKey(q);
  return wrongs.filter(w => keyKey(w) !== key);
}
