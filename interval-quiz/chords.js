// 코드 퀴즈 — 화음 만들기, 코드 이름, 단계별·자유연습 문제와 보기, 오답 노트. 화면과 분리된 순수 로직.
import { step, pitch, noteAbove, KEY_LOW, KEY_HIGH, LOW_STEP, HIGH_STEP, FREE_COUNTS, QUESTION_COUNT } from './logic.js';

export { FREE_COUNTS, QUESTION_COUNT };

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// 겹올림·겹내림은 폰 글꼴에서 𝄪·𝄫이 깨질 수 있어 코드표처럼 ♯♯·♭♭로 쓴다
const ACC = { '-2': '♭♭', '-1': '♭', 0: '', 1: '♯', 2: '♯♯' };

export function enName(n) {
  return LETTERS[n.l] + ACC[n.a];
}

// tones: 근음에서 [성질, 도수]
export const CHORD_TYPES = [
  { id: 'maj', symbol: '', name: '장3화음', group: 'triad', tones: [['장', 3], ['완전', 5]] },
  { id: 'min', symbol: 'm', name: '단3화음', group: 'triad', tones: [['단', 3], ['완전', 5]] },
  { id: 'aug', symbol: 'aug', name: '증3화음', group: 'triad', tones: [['장', 3], ['증', 5]] },
  { id: 'dim', symbol: 'dim', name: '감3화음', group: 'triad', tones: [['단', 3], ['감', 5]] },
  { id: 'M7', symbol: 'M7', name: '장7화음', group: 'seventh', tones: [['장', 3], ['완전', 5], ['장', 7]] },
  { id: '7', symbol: '7', name: '속7화음', group: 'seventh', tones: [['장', 3], ['완전', 5], ['단', 7]] },
  { id: 'm7', symbol: 'm7', name: '단7화음', group: 'seventh', tones: [['단', 3], ['완전', 5], ['단', 7]] },
  { id: 'm7b5', symbol: 'm7♭5', name: '반감7화음', group: 'seventh', tones: [['단', 3], ['감', 5], ['단', 7]] },
  { id: 'dim7', symbol: 'dim7', name: '감7화음', group: 'seventh', tones: [['단', 3], ['감', 5], ['감', 7]] },
  { id: 'mM7', symbol: 'mM7', name: '단장7화음', group: 'seventh', tones: [['단', 3], ['완전', 5], ['장', 7]] },
  { id: 'sus2', symbol: 'sus2', name: 'sus2 (3음 대신 장2도)', group: 'sus', tones: [['장', 2], ['완전', 5]] },
  { id: 'sus4', symbol: 'sus4', name: 'sus4 (3음 대신 완전4도)', group: 'sus', tones: [['완전', 4], ['완전', 5]] },
  { id: '7sus4', symbol: '7sus4', name: '7sus4 (sus4 + 단7도)', group: 'sus', tones: [['완전', 4], ['완전', 5], ['단', 7]] },
  { id: '6', symbol: '6', name: '6화음 (장3화음 + 장6도)', group: 'sus', tones: [['장', 3], ['완전', 5], ['장', 6]] },
  { id: 'm6', symbol: 'm6', name: '단6화음 (단3화음 + 장6도)', group: 'sus', tones: [['단', 3], ['완전', 5], ['장', 6]] },
  { id: 'add9', symbol: 'add9', name: 'add9 (장3화음 + 장9도)', group: 'sus', tones: [['장', 3], ['완전', 5], ['장', 9]] },
];
export const TYPE_BY_ID = Object.fromEntries(CHORD_TYPES.map(t => [t.id, t]));
export const INVERSION_NAMES = ['기본형', '첫째 자리바꿈', '둘째 자리바꿈', '셋째 자리바꿈'];

// sus·add·6화음은 자리바꿈하면 다른 코드와 이름이 겹쳐서(C6 = Am7/C 등) 기본형만 낸다
export function canInvert(typeId) {
  return TYPE_BY_ID[typeId].group !== 'sus';
}

function toneAbove(root, quality, degree) {
  if (degree <= 8) return noteAbove(root, quality, degree);
  const n = noteAbove(root, quality, degree - 7);
  return n && { ...n, o: n.o + 1 };
}

// 근음 위로 쌓은 화음(아래 음부터). inv번 자리바꿈하면 아래 음을 차례로 한 옥타브 올린다. 임시표가 겹을 넘으면 null
export function buildChord(root, typeId, inv = 0) {
  const tones = [root];
  for (const [q, d] of TYPE_BY_ID[typeId].tones) {
    const n = toneAbove(root, q, d);
    if (!n) return null;
    tones.push(n);
  }
  for (let i = 0; i < inv; i++) {
    const low = tones.shift();
    tones.push({ ...low, o: low.o + 1 });
  }
  return tones;
}

export function chordName(c) {
  const notes = buildChord(c.root, c.type, c.inv);
  const base = enName(c.root) + TYPE_BY_ID[c.type].symbol;
  return c.inv ? `${base}/${enName(notes[0])}` : base;
}

// 같은 소리(건반 위치 묶음 + 맨 아래 음)인지. 보기에 정답과 소리가 같은 코드가 섞이지 않게 쓴다
function soundKey(notes) {
  const pcs = [...new Set(notes.map(n => ((pitch(n) % 12) + 12) % 12))].sort((a, b) => a - b);
  return pcs.join(',') + '/' + (((pitch(notes[0]) % 12) + 12) % 12);
}

// ---------- 단계 ----------
export const TRIADS = ['maj', 'min', 'aug', 'dim'];
export const SEVENTHS = ['M7', '7', 'm7', 'm7b5', 'dim7', 'mM7'];
export const SUS = ['sus2', 'sus4', '7sus4', '6', 'm6', 'add9'];
export const CHORD_STAGES = [
  { name: '장·단 3화음', desc: 'C, Cm', types: ['maj', 'min'], inversions: false, maxAcc: 1 },
  { name: '증·감 3화음', desc: 'Caug, Cdim까지', types: TRIADS, inversions: false, maxAcc: 1 },
  { name: '3화음 자리바꿈', desc: 'C/E, C/G 같은 첫째·둘째 자리바꿈', types: TRIADS, inversions: true, maxAcc: 1 },
  { name: '7화음', desc: 'CM7, C7, Cm7, Cm7♭5, Cdim7, CmM7', types: SEVENTHS, inversions: false, maxAcc: 2 },
  { name: '7화음 자리바꿈', desc: '7화음의 첫째·둘째·셋째 자리바꿈', types: SEVENTHS, inversions: true, maxAcc: 2 },
  { name: 'sus·add·6', desc: 'sus2, sus4, 7sus4, 6, m6, add9', types: SUS, inversions: false, maxAcc: 1 },
  { name: '종합', desc: '모든 코드, 자리바꿈도', types: [...TRIADS, ...SEVENTHS, ...SUS], inversions: true, maxAcc: 2 },
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

// 근음으로 C♭·F♭·E♯·B♯은 쓰지 않는다 (실제 악보·코드표에서 거의 안 나옴)
export function usualRoot(n) {
  return !(n.a === -1 && (n.l === 0 || n.l === 3)) && !(n.a === 1 && (n.l === 2 || n.l === 6)) && Math.abs(n.a) <= 1;
}

function inRange(notes) {
  return notes.every(n => pitch(n) >= KEY_LOW && pitch(n) <= KEY_HIGH && step(n) >= LOW_STEP && step(n) <= HIGH_STEP);
}

// 화음 전체를 옥타브 단위로 옮겨 건반·오선 안에 들어오는 자리 중 하나를 고른다
export function place(notes, rng) {
  const fits = [-1, 0, 1].map(k => notes.map(n => ({ ...n, o: n.o + k }))).filter(inRange);
  return fits.length ? pick(rng, fits) : null;
}

function makeFrom(stage, tag, rng) {
  for (let tries = 0; tries < 500; tries++) {
    const type = pick(rng, stage.types);
    const size = TYPE_BY_ID[type].tones.length + 1;
    const inv = stage.inversions && canInvert(type) ? Math.floor(rng() * size) : 0;
    const root = { l: Math.floor(rng() * 7), o: 4, a: Math.floor(rng() * 3) - 1 };
    if (!usualRoot(root)) continue;
    const built = buildChord(root, type, inv);
    if (!built || built.some(n => Math.abs(n.a) > stage.maxAcc)) continue;
    const notes = place(built, rng);
    if (!notes) continue;
    const answer = { root: { ...root, o: notes[0].o }, type, inv };
    answer.name = chordName(answer);
    return { kind: 'chord', notes, answer, options: makeOptions(answer, notes, stage, rng), stage: tag };
  }
  throw new Error('코드 문제를 만들 수 없음: ' + tag);
}

// 보기 4개: 정답 + 헷갈리기 쉬운 코드 3개(같은 근음 다른 종류, 같은 종류 다른 근음, 다른 자리바꿈, 반음 차이 근음)
export function makeOptions(answer, notes, stage, rng) {
  const cands = [];
  const types = [...new Set([...stage.types, ...CHORD_TYPES.filter(t => t.group === TYPE_BY_ID[answer.type].group).map(t => t.id)])];
  const sizeOf = t => TYPE_BY_ID[t].tones.length + 1;
  for (const t of types) {
    if (t === answer.type) continue;
    cands.push({ root: answer.root, type: t, inv: canInvert(t) ? Math.min(answer.inv, sizeOf(t) - 1) : 0 });
  }
  const tones = buildChord(answer.root, answer.type, 0);
  for (const n of tones.slice(1)) cands.push({ root: n, type: answer.type, inv: answer.inv });
  if (canInvert(answer.type) && (stage.inversions || answer.inv)) {
    for (let i = 0; i < sizeOf(answer.type); i++) if (i !== answer.inv) cands.push({ ...answer, inv: i });
  }
  for (const da of [-1, 1]) {
    const a = answer.root.a + da;
    if (Math.abs(a) <= 1) cands.push({ ...answer, root: { ...answer.root, a } });
  }
  const answerSound = soundKey(notes);
  const names = new Set([answer.name]);
  const picked = [];
  for (const c of shuffle(rng, cands)) {
    if (!usualRoot(c.root)) continue;
    const built = buildChord(c.root, c.type, c.inv);
    if (!built || built.some(n => Math.abs(n.a) > 2) || soundKey(built) === answerSound) continue;
    const name = chordName(c);
    if (names.has(name)) continue;
    names.add(name);
    picked.push(name);
    if (picked.length === 3) break;
  }
  return shuffle(rng, [answer.name, ...picked]);
}

export function makeChordQuestion(stageIndex, rng = Math.random) {
  return makeFrom(CHORD_STAGES[stageIndex], stageIndex, rng);
}

export function makeChordRound(stageIndex, rng = Math.random) {
  return collect(() => makeChordQuestion(stageIndex, rng), QUESTION_COUNT);
}

// 자유연습: 고른 종류들이 고르게 나온다
export function makeFreeChordRound(options, rng = Math.random) {
  if (!options.types.length) throw new Error('코드 종류를 하나 이상 골라야 함');
  const stage = { types: options.types, inversions: !!options.inversions, maxAcc: 2 };
  return collect(() => makeFrom(stage, 'free', rng), options.count);
}

function collect(make, count) {
  const qs = [];
  const seen = new Set();
  let misses = 0;
  while (qs.length < count) {
    const q = make();
    const key = chordKey(q);
    // 고를 수 있는 문제가 적으면(예: 장3화음만) 같은 문제가 계속 나오므로, 연달아 겹치면 겹쳐도 넣는다
    if (seen.has(key) && seen.size < 40 && ++misses < 30) continue;
    misses = 0;
    seen.add(key);
    qs.push(q);
  }
  return qs;
}

// 풀이: "E–G–C · 근음 C, 장3화음, 첫째 자리바꿈 → C/E"
export function explainChord(q) {
  const { root, type, inv, name } = q.answer;
  const parts = [`근음 ${enName(root)}`, TYPE_BY_ID[type].name];
  if (inv) parts.push(INVERSION_NAMES[inv]);
  return `${q.notes.map(enName).join('–')} · ${parts.join(', ')} → ${name}`;
}

export function chordKey(q) {
  return q.notes.map(n => `${n.l}.${n.o}.${n.a}`).join('-');
}

// 오답 노트
export function addChordWrong(wrongs, q, picked) {
  const key = chordKey(q);
  return [{ ...q, picked }, ...wrongs.filter(w => chordKey(w) !== key)].slice(0, 100);
}

export function removeChordWrong(wrongs, q) {
  const key = chordKey(q);
  return wrongs.filter(w => chordKey(w) !== key);
}
