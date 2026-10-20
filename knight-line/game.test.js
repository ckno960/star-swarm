import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, createStage, generateLevel, stageConfig, move, undo, targetIn,
  isCleared, isStuck, solve, hint, seeded, goldenLast, createDaily, TOUGH_KIND, TOUGH_FROM_STAGE, GOLDEN_FROM_STAGE,
} from './game.js';

// [x, y] 는 일반 몬스터, [x, y, 2] 는 체력 2인 갑옷 몬스터
const level = (knight, monsters, size = 5) => createState({
  size, knight, monsters: monsters.map(([x, y, hp = 1]) => ({ x, y, kind: hp > 1 ? TOUGH_KIND : 0, hp })),
});

test('일직선으로 달려가 처음 만나는 몬스터를 처치하고 그 칸에 선다', () => {
  const s = level({ x: 0, y: 2 }, [[3, 2], [4, 2]]);
  const { monster: m, killed } = move(s, 'right');
  assert.deepEqual([m.x, m.y], [3, 2]);
  assert.equal(killed, true);
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
  for (let n = 1; n <= 60; n++) {
    const { size, count, tough } = stageConfig(n);
    const lv = generateLevel(seeded(n), size, count, tough);
    assert.equal(lv.monsters.length, count);
    assert.equal(lv.monsters.filter(m => m.hp === 2).length, tough);
    const cells = new Set([lv.knight, ...lv.monsters].map(c => `${c.x},${c.y}`));
    assert.equal(cells.size, count + 1);
    const s = createState(lv);
    for (const d of lv.solution) assert.ok(move(s, d), `스테이지 ${n}`);
    assert.ok(isCleared(s), `스테이지 ${n}`);
  }
});

test('solve는 생성된 판의 풀이를 찾는다', () => {
  for (let n = 1; n <= 20; n++) {
    const s = createStage(n);
    const dirs = solve(s);
    assert.ok(dirs, `스테이지 ${n}`);
    for (const d of dirs) move(s, d);
    assert.ok(isCleared(s));
  }
});

test('갑옷 몬스터는 10스테이지까지 없고 11스테이지부터 나온다', () => {
  for (let n = 1; n < TOUGH_FROM_STAGE; n++) assert.equal(stageConfig(n).tough, 0);
  assert.ok(stageConfig(TOUGH_FROM_STAGE).tough >= 1);
  assert.ok(createStage(TOUGH_FROM_STAGE).monsters.some(m => m.hp === 2));
});

test('갑옷 몬스터: 첫 공격은 버티고 기사는 달려온 방향에서 바로 앞 칸에 선다', () => {
  const s = level({ x: 0, y: 2 }, [[3, 2, 2]]);
  const r = move(s, 'right');
  assert.equal(r.killed, false);
  assert.deepEqual(s.knight, { x: 2, y: 2 });
  assert.equal(s.monsters[0].hp, 1);
  // 두 번째 공격에 쓰러지고 그 칸으로 들어간다
  assert.equal(move(s, 'right').killed, true);
  assert.deepEqual(s.knight, { x: 3, y: 2 });
  assert.ok(isCleared(s));
});

test('갑옷 몬스터가 바로 옆이면 제자리에서 때린다', () => {
  const s = level({ x: 2, y: 3 }, [[2, 2, 2]]);
  move(s, 'up');
  assert.deepEqual(s.knight, { x: 2, y: 3 });
  assert.equal(s.monsters[0].hp, 1);
});

test('되돌리기는 갑옷 몬스터의 체력도 되돌린다', () => {
  const s = level({ x: 0, y: 0 }, [[0, 4, 2]]);
  move(s, 'down');
  move(s, 'down');
  assert.ok(isCleared(s));
  undo(s);
  assert.equal(s.monsters[0].hp, 1);
  assert.deepEqual(s.knight, { x: 0, y: 3 });
  undo(s);
  assert.equal(s.monsters[0].hp, 2);
  assert.deepEqual(s.knight, { x: 0, y: 0 });
});

test('solve는 갑옷 몬스터의 멈춤 위치까지 계산한다', () => {
  // 갑옷 몬스터를 한 번 치면 (2,0)에 멈춰야 아래 몬스터를 잡고, 돌아와서 마무리할 수 있다
  const s = level({ x: 0, y: 0 }, [[3, 0, 2], [2, 3], [3, 3]]);
  const dirs = solve(s);
  assert.ok(dirs);
  for (const d of dirs) move(s, d);
  assert.ok(isCleared(s));
});

test('힌트: 정답 경로를 따라가는 중이면 다음 방향, 막힌 상태면 null', () => {
  const s = createStage(33);
  assert.equal(hint(s), s.solution[0]);
  move(s, s.solution[0]);
  assert.equal(hint(s), s.solution[1]);
  const stuck = level({ x: 0, y: 0 }, [[2, 2]]);
  assert.equal(hint(stuck), null);
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

test('황금 몬스터: 3스테이지부터 가끔, 정답대로 풀면 마지막에 쓰러진다', () => {
  let found = 0;
  for (let n = 1; n <= 40; n++) {
    const s = createStage(n);
    const golds = s.monsters.filter(m => m.golden);
    assert.ok(golds.length <= 1);
    if (n < GOLDEN_FROM_STAGE) assert.equal(golds.length, 0);
    if (!golds.length) continue;
    found++;
    for (const d of s.solution) move(s, d);
    assert.ok(goldenLast(s), `스테이지 ${n}`);
  }
  assert.ok(found >= 5);
});

test('황금 몬스터를 먼저 잡으면 보너스 없음', () => {
  const s = createState({ size: 5, knight: { x: 0, y: 0 }, monsters: [{ x: 3, y: 0, kind: 0, golden: true }, { x: 3, y: 3, kind: 0 }] });
  move(s, 'right');
  move(s, 'down');
  assert.ok(isCleared(s));
  assert.equal(goldenLast(s), false);
});

test('오늘의 퍼즐: 날마다 다른 판이고 항상 깰 수 있다', () => {
  assert.notDeepEqual(createDaily(1).monsters, createDaily(2).monsters);
  assert.deepEqual(createDaily(7), createDaily(7));
  for (let d = 1; d <= 14; d++) {
    const s = createDaily(d);
    for (const dir of s.solution) move(s, dir);
    assert.ok(isCleared(s));
  }
});
