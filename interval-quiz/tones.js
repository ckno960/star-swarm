// 코드톤 퀴즈 — 코드 이름을 보고 구성음을 맞힌다. 비기너는 보기 4개, 프로는 음 이름 직접 입력. 화면과 분리된 순수 로직.
import { QUESTION_COUNT, FREE_COUNTS } from './logic.js';
import { CHORD_TYPES, TYPE_BY_ID, TRIADS, SEVENTHS, SUS, buildChord, chordName, enName, usualRoot, place } from './chords.js';

export { QUESTION_COUNT, FREE_COUNTS };

export const TONE_STAGES = [
  { name: '장·단 3화음', desc: 'C, Cm의 구성음', types: ['maj', 'min'], maxAcc: 1 },
  { name: '증·감 3화음', desc: 'Caug, Cdim까지', types: TRIADS, maxAcc: 2 },
  { name: '7화음 기본', desc: 'CM7, C7, Cm7', types: ['M7', '7', 'm7'], maxAcc: 2 },
  { name: '모든 7화음', desc: 'Cm7♭5, Cdim7, CmM7까지', types: SEVENTHS, maxAcc: 2 },
  { name: 'sus·add·6', desc: 'Csus2, Csus4, C7sus4, C6, Cm6, Cadd9', types: SUS, maxAcc: 2 },
  { name: '종합', desc: '모든 코드', types: [...TRIADS, ...SEVENTHS, ...SUS], maxAcc: 2 },
];

// 구성음 묶음을 글자로 (예: "C E♭ G")
export function tonesText(names) {
  return names.join(' ');
}

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

const LETTER_SEMIS = [0, 2, 4, 5, 7, 9, 11];

// 같은 건반을 다른 음이름으로 (E♭ → D♯). G♭♭처럼 티 나는 철자는 함정이 안 되므로 ♯·♭ 하나까지만
function respell(n, dir) {
  const l = (n.l + dir + 7) % 7;
  const pc = LETTER_SEMIS[n.l] + n.a;
  let a = pc - LETTER_SEMIS[l];
  a = ((a + 6) % 12 + 12) % 12 - 6;
  return Math.abs(a) <= 1 ? { ...n, l, a } : null;
}

// 비기너 보기: 정답 + 같은 근음의 다른 종류 구성음, 한 음을 딴이름으로 쓴 것(E♭ ↔ D♯), 한 음을 반음 바꾼 것
export function makeToneOptions(root, type, stage, rng = Math.random) {
  const answer = tonesText(buildChord(root, type).map(enName));
  const cands = [];
  const group = TYPE_BY_ID[type].group;
  const types = [...new Set([...stage.types, ...CHORD_TYPES.filter(t => t.group === group).map(t => t.id)])];
  const size = TYPE_BY_ID[type].tones.length;
  // 음 개수가 다르면 바로 티가 나므로 같은 개수의 종류만
  for (const t of types) {
    if (t === type || TYPE_BY_ID[t].tones.length !== size) continue;
    const c = buildChord(root, t);
    if (c && c.every(n => Math.abs(n.a) <= 2)) cands.push(c.map(enName));
  }
  const tones = buildChord(root, type);
  tones.forEach((n, i) => {
    if (i === 0) return;
    for (const dir of [-1, 1]) {
      const r = respell(n, dir);
      if (r) cands.push(tones.map((m, j) => enName(j === i ? r : m)));
    }
  });
  // 후보가 모자라면 구성음 하나를 반음 올리거나 내린 것(D G A → D G♯ A)으로 채운다
  const altered = [];
  tones.forEach((n, i) => {
    if (i === 0) return;
    for (const da of [-1, 1]) {
      if (Math.abs(n.a + da) <= 1) altered.push(tones.map((m, j) => enName(j === i ? { ...m, a: m.a + da } : m)));
    }
  });
  const names = new Set([answer]);
  const picked = [];
  for (const c of [...shuffle(rng, cands), ...shuffle(rng, altered)]) {
    const text = tonesText(c);
    if (names.has(text)) continue;
    names.add(text);
    picked.push(text);
    if (picked.length === 3) break;
  }
  return shuffle(rng, [answer, ...picked]);
}

function makeFrom(stage, tag, rng) {
  for (let tries = 0; tries < 500; tries++) {
    const type = pick(rng, stage.types);
    const root = { l: Math.floor(rng() * 7), o: 4, a: Math.floor(rng() * 3) - 1 };
    if (!usualRoot(root)) continue;
    const built = buildChord(root, type);
    if (!built || built.some(n => Math.abs(n.a) > stage.maxAcc)) continue;
    const notes = place(built, rng);
    if (!notes) continue;
    return {
      kind: 'tones',
      root: notes[0],
      type,
      name: chordName({ root, type, inv: 0 }),
      notes,
      answer: { names: built.map(enName) },
      options: makeToneOptions(root, type, stage, rng),
      stage: tag,
    };
  }
  throw new Error('코드톤 문제를 만들 수 없음: ' + tag);
}

export function makeToneQuestion(stageIndex, rng = Math.random) {
  return makeFrom(TONE_STAGES[stageIndex], stageIndex, rng);
}

export function makeToneRound(stageIndex, rng = Math.random) {
  return collect(() => makeToneQuestion(stageIndex, rng), QUESTION_COUNT);
}

export function makeFreeToneRound(options, rng = Math.random) {
  if (!options.types.length) throw new Error('코드 종류를 하나 이상 골라야 함');
  const stage = { types: options.types, maxAcc: 2 };
  return collect(() => makeFrom(stage, 'free', rng), options.count);
}

function collect(make, count) {
  const qs = [];
  const seen = new Set();
  let misses = 0;
  while (qs.length < count) {
    const q = make();
    const key = q.name;
    // 고를 수 있는 코드가 적으면 같은 코드가 계속 나오므로, 연달아 겹치면 겹쳐도 넣는다
    if (seen.has(key) && seen.size < 40 && ++misses < 30) continue;
    misses = 0;
    seen.add(key);
    qs.push(q);
  }
  return qs;
}

// 채점: 비기너는 보기 문자열, 프로는 입력한 음 이름들(순서 상관없이, 철자까지 같아야 정답)
export function isToneCorrect(q, picked) {
  if (typeof picked === 'string') return picked === tonesText(q.answer.names);
  if (picked.length !== q.answer.names.length) return false;
  return [...picked].sort().join() === [...q.answer.names].sort().join();
}

// 풀이: "Cm7 = C–E♭–G–B♭ · 근음 C, 단7화음 (단3도 + 완전5도 + 단7도)"
export function explainTones(q) {
  const t = TYPE_BY_ID[q.type];
  const steps = t.tones.map(([qual, d]) => `${qual}${d}도`).join(' + ');
  return `${q.name} = ${q.answer.names.join('–')} · 근음 ${q.answer.names[0]}, ${t.name.split(' (')[0]} (${steps})`;
}

export function toneKey(q) {
  return q.name;
}

export function addToneWrong(wrongs, q, picked) {
  return [{ ...q, picked }, ...wrongs.filter(w => w.name !== q.name)].slice(0, 100);
}

export function removeToneWrong(wrongs, q) {
  return wrongs.filter(w => w.name !== q.name);
}
