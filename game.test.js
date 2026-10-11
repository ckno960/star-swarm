import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, STAGE_COUNT, createState, update, setTarget, hits, stageConfig, recordClear, isUnlocked } from './game.js';

// 무작위 돌진과 발사를 끈 상태
function fresh() {
  const s = createState(() => 0.5);
  s.diveTimer = s.shotTimer = Infinity;
  return s;
}

test('hits: 겹치면 true, 떨어지면 false', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(hits(a, { x: 9, y: 0, w: 10, h: 10 }), true);
  assert.equal(hits(a, { x: 11, y: 0, w: 10, h: 10 }), false);
});

test('플레이어는 목표 위치로 이동하고 화면 양 끝을 넘지 않는다', () => {
  const s = fresh();
  setTarget(s, 250);
  for (let i = 0; i < 20; i++) update(s, 0.016);
  assert.equal(s.player.x, 250);

  setTarget(s, -100);
  for (let i = 0; i < 40; i++) update(s, 0.016);
  assert.equal(s.player.x, s.player.w / 2);

  setTarget(s, W + 100);
  for (let i = 0; i < 40; i++) update(s, 0.016);
  assert.equal(s.player.x, W - s.player.w / 2);
});

test('총알이 자동으로 나간다', () => {
  const s = fresh();
  update(s, 0.016);
  assert.equal(s.bullets.length, 1);
});

test('총알이 적을 맞히면 둘 다 사라지고 점수가 오른다', () => {
  const s = fresh();
  s.fireCooldown = Infinity;
  const e = s.enemies[0];
  s.bullets.push({ x: e.x, y: e.y, w: 3, h: 10, vy: 0 });
  update(s, 0.001);
  assert.equal(s.enemies.length, 31);
  assert.equal(s.bullets.length, 0);
  assert.equal(s.score, 50);
});

test('피격 시 목숨이 줄고, 무적 시간 동안은 더 맞지 않는다', () => {
  const s = fresh();
  const shot = () => s.enemyBullets.push({ x: s.player.x, y: s.player.y, w: 4, h: 8, vy: 0 });
  shot(); shot();
  update(s, 0.001);
  assert.equal(s.lives, 2);
  assert.ok(s.invuln > 0);

  update(s, 0.001);
  assert.equal(s.lives, 2);
});

test('목숨이 0이 되면 게임 오버이고 더 이상 진행되지 않는다', () => {
  const s = fresh();
  s.lives = 1;
  s.enemyBullets.push({ x: s.player.x, y: s.player.y, w: 4, h: 8, vy: 0 });
  update(s, 0.001);
  assert.equal(s.over, true);

  const score = s.score, bullets = s.bullets.length;
  update(s, 0.5);
  assert.equal(s.bullets.length, bullets);
  assert.equal(s.score, score);
});

test('돌진한 적은 화면 아래로 빠진 뒤 편대 자리로 돌아온다', () => {
  const s = fresh();
  s.diveTimer = 0;
  update(s, 0.016);
  s.diveTimer = Infinity;
  s.player.x = s.player.targetX = 0; // 돌진하는 적과 부딪히지 않게 비켜 둔다
  const e = s.enemies.find(e => e.mode === 'dive');
  assert.ok(e);
  for (let i = 0; i < 300 && e.mode !== 'formation'; i++) { s.invuln = 1; update(s, 0.05); }
  assert.equal(e.mode, 'formation');
});

test('편대를 전멸시키면 스테이지 클리어이고 더 이상 진행되지 않는다', () => {
  const s = fresh();
  s.fireCooldown = Infinity;
  for (const e of s.enemies) s.bullets.push({ x: e.x, y: e.y, w: 3, h: 10, vy: 0 });
  update(s, 0.001);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.cleared, true);
  assert.equal(s.score, 32 * 50);
});

test('스테이지가 올라갈수록 빨라진다', () => {
  for (let n = 1; n < STAGE_COUNT; n++) {
    const a = stageConfig(n), b = stageConfig(n + 1);
    assert.ok(b.formationSpeed > a.formationSpeed);
    assert.ok(b.diveEvery < a.diveEvery && b.diveEvery > 0);
    assert.ok(b.shotEvery < a.shotEvery && b.shotEvery > 0);
  }
  assert.equal(createState(Math.random, 3).formation.speed, stageConfig(3).formationSpeed);
});

test('클리어 기록은 최고 점수만 남기고, 이전 스테이지를 깨야 다음이 열린다', () => {
  let p = {};
  assert.equal(isUnlocked(p, 1), true);
  assert.equal(isUnlocked(p, 2), false);
  p = recordClear(p, 1, 800);
  p = recordClear(p, 1, 500);
  assert.equal(p[1], 800);
  assert.equal(isUnlocked(p, 2), true);
  assert.equal(isUnlocked(p, 3), false);
  // localStorage를 거치면 키가 문자열이 된다
  assert.equal(isUnlocked(JSON.parse(JSON.stringify(p)), 2), true);
});
