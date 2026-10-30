import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const n = (name, o = 4) => {
  const l = 'CDEFGAB'.indexOf(name[0]);
  const acc = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 }[name.slice(1)];
  return { l, o, a: acc };
};
const named = (a, b) => L.intervalName(L.interval(a, b));

test('basic intervals from C', () => {
  assert.equal(named(n('C'), n('C')), '완전1도');
  assert.equal(named(n('C'), n('D')), '장2도');
  assert.equal(named(n('C'), n('Eb')), '단3도');
  assert.equal(named(n('C'), n('E')), '장3도');
  assert.equal(named(n('C'), n('F')), '완전4도');
  assert.equal(named(n('C'), n('F#')), '증4도');
  assert.equal(named(n('C'), n('Gb')), '감5도');
  assert.equal(named(n('C'), n('G')), '완전5도');
  assert.equal(named(n('C'), n('Bb')), '단7도');
  assert.equal(named(n('C'), n('C', 5)), '완전8도');
});

test('white-key half steps and the tritone', () => {
  assert.equal(named(n('E'), n('F')), '단2도');
  assert.equal(named(n('B'), n('C', 5)), '단2도');
  assert.equal(named(n('F'), n('B')), '증4도');
  assert.equal(named(n('B'), n('F', 5)), '감5도');
});

test('augmented, diminished and doubles', () => {
  assert.equal(named(n('C'), n('D#')), '증2도');
  assert.equal(named(n('C#'), n('Eb')), '감3도');
  assert.equal(named(n('C#'), n('Ebb')), '겹감3도');
  assert.equal(named(n('Cb'), n('G#')), '겹증5도');
  assert.equal(named(n('C'), n('C#')), '증1도');
  assert.equal(named(n('C#'), n('C', 5)), '감8도');
  assert.equal(named(n('C'), n('Bbb')), '감7도');
});

test('order does not matter', () => {
  assert.equal(named(n('A'), n('C')), named(n('C'), n('A')));
});

test('noteAbove is the inverse of interval', () => {
  for (const q of L.QUALITIES) {
    for (const d of L.DEGREES) {
      const lo = n('D');
      const hi = L.noteAbove(lo, q, d);
      if (!hi || L.pitch(hi) < L.pitch(lo)) continue;
      const iv = L.interval(lo, hi);
      assert.equal(iv.degree, d);
      assert.equal(iv.quality, q, `${q}${d}도`);
    }
  }
});

test('the keyboard spans two octaves from middle C', () => {
  assert.equal(L.KEY_LOW, L.pitch(n('C')));
  assert.equal(L.KEY_HIGH, L.pitch(n('C', 6)));
});

test('note names', () => {
  assert.equal(L.noteName(n('F#')), '파♯');
  assert.equal(L.noteName(n('Bbb')), '시𝄫');
  assert.equal(L.noteName(n('C##')), '도𝄪');
});

function seeded(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('every stage makes valid questions within the staff range', () => {
  const rng = seeded(7);
  for (let s = 0; s < L.STAGES.length; s++) {
    const seenQualities = new Set();
    for (let i = 0; i < 300; i++) {
      const q = L.makeQuestion(s, rng);
      const iv = L.interval(q.a, q.b);
      assert.ok(iv && iv.quality, 'valid interval');
      assert.equal(iv.quality, q.answer.quality);
      assert.equal(iv.degree, q.answer.degree);
      for (const x of [q.a, q.b]) {
        assert.ok(L.step(x) >= L.LOW_STEP && L.step(x) <= L.HIGH_STEP, 'on the staff');
        assert.ok(L.pitch(x) >= L.KEY_LOW && L.pitch(x) <= L.KEY_HIGH, 'on the keyboard');
        assert.ok(Math.abs(x.a) <= Math.max(L.STAGES[s].maxAcc, 0));
      }
      seenQualities.add(iv.quality);
    }
    if (s === 0) assert.ok([...seenQualities].every(x => ['완전', '장', '단', '증', '감'].includes(x)));
    if (s === 1) assert.ok(!seenQualities.has('겹증') && !seenQualities.has('겹감'));
    if (s === 3) assert.ok(seenQualities.has('겹증') && seenQualities.has('겹감'));
  }
});

test('only the last stage asks descending intervals', () => {
  const rng = seeded(3);
  for (let s = 0; s < L.STAGES.length; s++) {
    let down = 0;
    for (let i = 0; i < 100; i++) {
      const q = L.makeQuestion(s, rng);
      if (L.step(q.a) > L.step(q.b)) down++;
    }
    assert.equal(down > 0, s === 4, `stage ${s}`);
  }
});

test('a round has 10 questions', () => {
  assert.equal(L.makeRound(2, seeded(1)).length, L.QUESTION_COUNT);
});

test('grading and explanation', () => {
  const q = { a: n('D'), b: n('F#'), answer: { quality: '장', degree: 3 } };
  assert.ok(L.isCorrect(q, '장', 3));
  assert.ok(!L.isCorrect(q, '단', 3));
  assert.ok(!L.isCorrect(q, '장', 2));
  assert.equal(L.explain(q), '레 → 파♯ · 3도, 반음 4개 → 장3도');
});

test('stages unlock after 8 correct', () => {
  const p = {};
  assert.ok(L.isUnlocked(p, 0));
  assert.ok(!L.isUnlocked(p, 1));
  L.recordRound(p, 0, 7);
  assert.ok(!L.isUnlocked(p, 1));
  L.recordRound(p, 0, 9);
  L.recordRound(p, 0, 5);
  assert.equal(p.best[0], 9);
  assert.ok(L.isUnlocked(p, 1));
});

test('wrong-answer notebook keeps one entry per question and drops solved ones', () => {
  const q = { a: n('C'), b: n('E'), answer: { quality: '장', degree: 3 }, stage: 0 };
  let w = L.addWrong([], q, { quality: '단', degree: 3 });
  w = L.addWrong(w, q, { quality: '장', degree: 2 });
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].picked, { quality: '장', degree: 2 });
  assert.equal(L.removeWrong(w, q).length, 0);
});
