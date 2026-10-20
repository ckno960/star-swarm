import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard, dropBall, stepBoard, isFinished, spinReels, prizeFor, slotAt,
  BALLS_PER_BONUS, SLOTS, BOARD_W,
} from './pachinko.js';
import { seeded } from './game.js';

test('공은 정해진 개수만 떨어뜨릴 수 있다', () => {
  const b = createBoard(seeded(1));
  for (let i = 0; i < BALLS_PER_BONUS; i++) assert.ok(dropBall(b, 60));
  assert.equal(dropBall(b, 60), false);
});

test('떨어뜨린 공은 모두 언젠가 바닥 칸에 들어간다', () => {
  const rand = seeded(2);
  const b = createBoard(rand);
  const counts = SLOTS.map(() => 0);
  b.ballsLeft = 300;
  for (let i = 0; i < 300; i++) dropBall(b, rand() * BOARD_W);
  let landed = 0;
  for (let t = 0; t < 2000 && !isFinished(b); t++)
    for (const l of stepBoard(b, 1 / 60)) { counts[l.slot]++; landed++; }
  assert.equal(landed, 300);
  assert.ok(isFinished(b));
  // 가운데 START 구멍에도 들어간다
  assert.ok(counts[3] > 0, counts.join(','));
});

test('바닥 칸 번호', () => {
  assert.equal(slotAt(0), 0);
  assert.equal(slotAt(BOARD_W / 2), 3);
  assert.equal(slotAt(BOARD_W), SLOTS.length - 1);
});

test('슬롯 상금: 7 세 개는 잭팟, 같은 그림 세 개, 두 개, 꽝', () => {
  assert.deepEqual(prizeFor(['7', '7', '7']), { coins: 300, extraBalls: 5, label: 'JACKPOT!!' });
  assert.equal(prizeFor(['★', '★', '★']).coins, 100);
  assert.equal(prizeFor(['★', '7', '★']).coins, 20);
  assert.equal(prizeFor(['★', '7', '♦']).coins, 0);
});

test('spinReels 결과와 상금이 맞는다', () => {
  const r = seeded(3);
  for (let i = 0; i < 50; i++) {
    const spin = spinReels(r);
    assert.equal(spin.reels.length, 3);
    assert.equal(spin.coins, prizeFor(spin.reels).coins);
  }
});
