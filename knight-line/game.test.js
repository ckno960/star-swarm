import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, createStage, generateLevel, stageConfig, move, undo, targetIn,
  isCleared, isStuck, solve, seeded,
} from './game.js';

const level = (knight, monsters, size = 5) => createState({ size, knight, monsters: monsters.map(([x, y]) => ({ x, y, kind: 0 })) });

test('일직선으로 달려가 처음 만나는 몬스터를 처치하고 그 칸에 선다', () => {
  const s = level({ x: 0, y: 2 }, [[3, 2], [4, 2]]);
  const m = move(s, 'right');
  assert.deepEqual([m.x, m.y], [3, 2]);
  assert.deepEqual(s.knight, { x: 3, y: 2 });
  assert.equal(s.monsters.length, 1);
});

test('그 방향에 몬스터가 없으면 움직이지 않는다', () => {
  const s = level({ x: 0, y: 2 }, [[3, 3]]);
  assert.equal(move(s, 'right'), null);
  assert.equal(move(s, 'left'), null);
  assert.deepEqual(s.knight, { x: 0, y: 2 });
});

test('되돌리기는 기사 위치와 몬스터를 원래대로', () => {
  const s = level({ x: 0, y: 0 }, [[0, 3]]);
  move(s, 'down');
  assert.ok(isCleared(s));
  assert.ok(undo(s));
  assert.deepEqual(s.knight, { x: 0, y: 0 });
  assert.equal(s.monsters.length, 1);
  assert.equal(undo(s), false);
});

test('몬스터가 남았는데 어느 방향에도 없으면 막힘', () => {
  const s = level({ x: 0, y: 0 }, [[2, 2]]);
  assert.ok(isStuck(s));
  assert.equal(solve(s), null);
});

test('solve는 실제로 깨지는 순서를 돌려준다', () => {
  // 오른쪽 몬스터를 먼저 잡으면 막히고, 아래부터 잡아야 깨지는 판
  const s = level({ x: 0, y: 0 }, [[3, 0], [0, 2], [3, 2]]);
  const dirs = solve(s);
  assert.ok(dirs);
  for (const d of dirs) assert.ok(move(s, d));
  assert.ok(isCleared(s));
});

test('생성된 판은 항상 깰 수 있고 칸이 겹치지 않는다', () => {
  for (let n = 1; n <= 30; n++) {
    const { size, count } = stageConfig(n);
    const lv = generateLevel(seeded(n), size, count);
    assert.equal(lv.monsters.length, count);
    const cells = new Set([lv.knight, ...lv.monsters].map(c => `${c.x},${c.y}`));
    assert.equal(cells.size, count + 1);
    const s = createState(lv);
    const dirs = solve(s);
    assert.ok(dirs, `스테이지 ${n}`);
    for (const d of dirs) move(s, d);
    assert.ok(isCleared(s));
  }
});

test('같은 스테이지는 언제나 같은 판', () => {
  assert.deepEqual(createStage(4), createStage(4));
  assert.notDeepEqual(createStage(4).monsters, createStage(5).monsters);
});

test('targetIn은 바로 앞 몬스터만 본다', () => {
  const s = level({ x: 2, y: 4 }, [[2, 1], [2, 3]]);
  assert.deepEqual([targetIn(s, 'up').x, targetIn(s, 'up').y], [2, 3]);
  assert.equal(targetIn(s, 'down'), null);
});
