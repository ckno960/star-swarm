import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from './keys.js';
import * as T from './tones.js';
import { enName, buildChord } from './chords.js';

function seeded(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('major and relative minor names for every key signature', () => {
  const majors = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
  const minors = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
  for (let sig = -7; sig <= 7; sig++) {
    assert.equal(K.keyName(sig, 'major'), `${majors[sig + 7]} major`);
    assert.equal(K.keyName(sig, 'minor'), `${minors[sig + 7]} minor`);
  }
});

test('signature accidentals in the standard order', () => {
  assert.equal(K.signatureNotes(4).map(enName).join(' '), 'F♯ C♯ G♯ D♯');
  assert.equal(K.signatureNotes(-3).map(enName).join(' '), 'B♭ E♭ A♭');
  assert.equal(K.sigText(0), '조표 없음');
  assert.equal(K.sigText(2), '♯ 2개 (F♯ C♯)');
});

test('scales follow the signature', () => {
  assert.equal(K.scale(2, 'major').map(enName).join(' '), 'D E F♯ G A B C♯ D');
  assert.equal(K.scale(-1, 'minor').map(enName).join(' '), 'D E F G A B♭ C D');
});

test('key questions: options are 4 distinct names of the asked mode, answer included', () => {
  const rng = seeded(4);
  K.KEY_STAGES.forEach((stage, s) => {
    for (let i = 0; i < 200; i++) {
      const q = K.makeKeyQuestion(s, rng);
      assert.ok(stage.sigs.includes(q.sig) && stage.modes.includes(q.mode));
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options.includes(q.answer.name));
      assert.ok(q.options.every(o => o.endsWith(q.mode)));
    }
  });
});

test('free key practice respects modes and sharp/flat sides', () => {
  const rng = seeded(8);
  const qs = K.makeFreeKeyRound({ modes: ['minor'], sides: ['flat'], count: 50 }, rng);
  assert.equal(qs.length, 50);
  assert.ok(qs.every(q => q.mode === 'minor' && q.sig <= 0));
  assert.throws(() => K.makeFreeKeyRound({ modes: [], sides: ['flat'], count: 5 }, rng));
});

test('key explanation', () => {
  assert.equal(K.explainKey({ sig: 2, mode: 'major', answer: { name: 'D major' } }), '♯ 2개 (F♯ C♯) → D major');
  assert.equal(K.explainKey({ sig: 2, mode: 'minor', answer: { name: 'B minor' } }), '♯ 2개 (F♯ C♯) → D major의 나란한단조 → B minor');
});

test('chord-tone questions: answer spelled from the root, options include tricky respellings', () => {
  const rng = seeded(6);
  T.TONE_STAGES.forEach((stage, s) => {
    for (let i = 0; i < 200; i++) {
      const q = T.makeToneQuestion(s, rng);
      assert.ok(stage.types.includes(q.type));
      assert.equal(q.answer.names.join(' '), buildChord(q.notes[0], q.type).map(enName).join(' '));
      assert.equal(q.options.length, 4, q.name);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options.includes(T.tonesText(q.answer.names)));
      assert.ok(q.options.every(o => o.split(' ').length === q.answer.names.length), 'same number of tones');
    }
  });
});

test('pro grading: any order, exact spelling', () => {
  const q = { answer: { names: ['C', 'E♭', 'G', 'B♭'] } };
  assert.ok(T.isToneCorrect(q, ['C', 'G', 'E♭', 'B♭']));
  assert.ok(!T.isToneCorrect(q, ['C', 'D♯', 'G', 'B♭']), 'D♯ is not E♭');
  assert.ok(!T.isToneCorrect(q, ['C', 'E♭', 'G']));
  assert.ok(T.isToneCorrect(q, 'C E♭ G B♭'));
});

test('chord-tone explanation and free practice', () => {
  const rng = seeded(3);
  const qs = T.makeFreeToneRound({ types: ['m7'], count: 5 }, rng);
  assert.equal(qs.length, 5);
  const q = { name: 'Cm7', type: 'm7', answer: { names: ['C', 'E♭', 'G', 'B♭'] } };
  assert.equal(T.explainTones(q), 'Cm7 = C–E♭–G–B♭ · 근음 C, 단7화음 (단3도 + 완전5도 + 단7도)');
});
