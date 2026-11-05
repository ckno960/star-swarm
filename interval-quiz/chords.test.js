import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './chords.js';
import { pitch, step, KEY_LOW, KEY_HIGH } from './logic.js';

const n = (name, o = 4) => {
  const l = 'CDEFGAB'.indexOf(name[0]);
  const a = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 }[name.slice(1)];
  return { l, o, a };
};
const names = notes => notes.map(C.enName).join(' ');

function seeded(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('chord tones are spelled from the root', () => {
  assert.equal(names(C.buildChord(n('C'), 'maj')), 'C E G');
  assert.equal(names(C.buildChord(n('C'), 'min')), 'C E♭ G');
  assert.equal(names(C.buildChord(n('C'), 'aug')), 'C E G♯');
  assert.equal(names(C.buildChord(n('B'), 'dim')), 'B D F');
  assert.equal(names(C.buildChord(n('G'), '7')), 'G B D F');
  assert.equal(names(C.buildChord(n('C'), 'dim7')), 'C E♭ G♭ B♭♭');
  assert.equal(names(C.buildChord(n('B'), 'm7b5')), 'B D F A');
  assert.equal(names(C.buildChord(n('D'), 'sus4')), 'D G A');
  assert.equal(names(C.buildChord(n('C'), 'add9')), 'C E G D');
  assert.equal(C.buildChord(n('C'), 'add9')[3].o, 5, 'the 9th is above the octave');
});

test('inversions move the lowest tones up an octave', () => {
  const c = C.buildChord(n('C'), 'maj', 1);
  assert.equal(names(c), 'E G C');
  assert.ok(pitch(c[0]) < pitch(c[1]) && pitch(c[1]) < pitch(c[2]));
  assert.equal(names(C.buildChord(n('G'), '7', 3)), 'F G B D');
});

test('chord names in English symbols, inversions as slash chords', () => {
  assert.equal(C.chordName({ root: n('C'), type: 'maj', inv: 0 }), 'C');
  assert.equal(C.chordName({ root: n('F#'), type: 'min', inv: 0 }), 'F♯m');
  assert.equal(C.chordName({ root: n('Bb'), type: 'M7', inv: 0 }), 'B♭M7');
  assert.equal(C.chordName({ root: n('C'), type: 'maj', inv: 1 }), 'C/E');
  assert.equal(C.chordName({ root: n('D'), type: 'm7', inv: 2 }), 'Dm7/A');
  assert.equal(C.chordName({ root: n('B'), type: 'm7b5', inv: 0 }), 'Bm7♭5');
});

test('every stage makes valid questions that fit the keyboard', () => {
  const rng = seeded(5);
  C.CHORD_STAGES.forEach((stage, s) => {
    const types = new Set();
    let inverted = 0;
    for (let i = 0; i < 300; i++) {
      const q = C.makeChordQuestion(s, rng);
      types.add(q.answer.type);
      if (q.answer.inv) inverted++;
      assert.ok(stage.types.includes(q.answer.type));
      assert.equal(names(q.notes), names(C.buildChord(q.answer.root, q.answer.type, q.answer.inv)), 'notes match the answer');
      for (const x of q.notes) {
        assert.ok(pitch(x) >= KEY_LOW && pitch(x) <= KEY_HIGH, 'on the keyboard');
        assert.ok(Math.abs(x.a) <= stage.maxAcc);
      }
      for (let k = 1; k < q.notes.length; k++) assert.ok(step(q.notes[k]) > step(q.notes[k - 1]), 'stacked upward');
      if (!C.canInvert(q.answer.type)) assert.equal(q.answer.inv, 0, 'sus·add·6 only in root position');
      assert.ok(C.usualRoot(q.answer.root), 'no C♭·F♭·E♯·B♯ roots');
      for (const o of q.options) assert.ok(!/^(C♭|F♭|E♯|B♯)/.test(o), o);
    }
    assert.equal(types.size, stage.types.length, `stage ${s} uses all its chord types`);
    assert.equal(inverted > 0, stage.inversions, `stage ${s} inversions`);
  });
});

test('four distinct options, one is the answer, none sounds the same as the answer', () => {
  const rng = seeded(9);
  for (let s = 0; s < C.CHORD_STAGES.length; s++) {
    for (let i = 0; i < 200; i++) {
      const q = C.makeChordQuestion(s, rng);
      assert.equal(q.options.length, 4, q.answer.name);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.options.filter(o => o === q.answer.name).length, 1);
    }
  }
  // C6과 Am7/C는 같은 소리라 서로의 보기에 나오면 안 된다
  const notes = C.buildChord(n('C'), '6');
  for (let i = 0; i < 50; i++) {
    const opts = C.makeOptions({ root: n('C'), type: '6', inv: 0, name: 'C6' }, notes, C.CHORD_STAGES[6], rng);
    assert.ok(!opts.includes('Am7/C'));
  }
});

test('free practice asks only the chosen types, as many as asked', () => {
  const rng = seeded(2);
  for (const types of [['maj'], ['dim7', 'm7b5'], ['sus2', 'add9', '7']]) {
    for (const inversions of [false, true]) {
      const qs = C.makeFreeChordRound({ types, count: 50, inversions }, rng);
      assert.equal(qs.length, 50);
      assert.deepEqual([...new Set(qs.map(q => q.answer.type))].sort(), [...types].sort());
      const anyInv = qs.some(q => q.answer.inv > 0);
      assert.equal(anyInv, inversions && types.some(C.canInvert));
    }
  }
  assert.throws(() => C.makeFreeChordRound({ types: [], count: 5 }, rng));
});

test('explanation names notes, root, type and inversion', () => {
  const root = n('C');
  const q = { notes: C.buildChord(root, 'maj', 1), answer: { root, type: 'maj', inv: 1, name: 'C/E' } };
  assert.equal(C.explainChord(q), 'E–G–C · 근음 C, 장3화음, 첫째 자리바꿈 → C/E');
});

test('chord wrong-answer notebook keeps one entry per chord', () => {
  const q = C.makeChordQuestion(0, seeded(1));
  let w = C.addChordWrong([], q, q.options.find(o => o !== q.answer.name));
  w = C.addChordWrong(w, q, 'X');
  assert.equal(w.length, 1);
  assert.equal(w[0].picked, 'X');
  assert.equal(C.removeChordWrong(w, q).length, 0);
});
