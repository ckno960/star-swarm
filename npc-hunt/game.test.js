import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, queueInput, step, removePlayer, publicView, privateView, entById, tryMove,
  ENTITY_COUNT, LIVES, ATTACK_COOLDOWN, SIZE,
} from './game.js';

// 결정적인 난수. 시드가 같으면 같은 판이 나온다
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// NPC를 모두 치우고 원하는 칸에 배치해서 판정만 따로 확인한다
function setup(layout) {
  const g = createGame(['a', 'b'], seeded());
  g.ents = [];
  for (const [owner, x, y, dir] of layout) {
    const e = { id: `${owner ?? 'npc'}${x}${y}`, x, y, dir, skin: 0, owner, rest: 99 };
    g.ents.push(e);
    if (owner) g.players[owner].entId = e.id;
  }
  return g;
}

const me = (g, pid) => entById(g, g.players[pid].entId);

test('처음 배치: 전체 수가 고정되고 칸마다 한 명씩', () => {
  const g = createGame(['a', 'b', 'c'], seeded(7));
  assert.equal(g.ents.length, ENTITY_COUNT);
  const cells = new Set(g.ents.map(e => `${e.x},${e.y}`));
  assert.equal(cells.size, ENTITY_COUNT);
  assert.ok(g.ents.every(e => e.x >= 0 && e.x < SIZE && e.y >= 0 && e.y < SIZE));
});

test('공개 정보에는 누가 플레이어인지 들어 있지 않다', () => {
  const g = createGame(['a', 'b'], seeded(3));
  const view = publicView(g);
  for (const e of view.ents) assert.deepEqual(Object.keys(e).sort(), ['dir', 'id', 'skin', 'x', 'y']);
  const ids = view.ents.map(e => e.id);
  assert.deepEqual(ids, [...ids].sort());
});

test('바로 옆(바라보는 방향) 플레이어를 찌르면 목숨 -1, 다른 칸에서 새 id로 부활', () => {
  const g = setup([['a', 2, 2, 'right'], ['b', 3, 2, 'up']]);
  queueInput(g, 'a', { type: 'attack' });
  const events = step(g);
  assert.equal(g.players.b.lives, LIVES - 1);
  assert.notEqual(g.players.b.entId, 'b32');
  assert.ok(me(g, 'b'));
  assert.equal(g.bodies.length, 1);
  assert.deepEqual(events.map(e => [e.to, e.kind]).sort(), [['a', 'killPlayer'], ['b', 'hurt']]);
  assert.equal(g.ents.length, 2);
});

test('대각선은 공격할 수 없다 (4방향만)', () => {
  const g = setup([['a', 2, 2, 'right'], ['b', 3, 3, 'up']]);
  queueInput(g, 'a', { type: 'attack' });
  const events = step(g);
  assert.equal(g.players.b.lives, LIVES);
  assert.deepEqual(events, [{ to: 'a', kind: 'miss' }]);
});

test('NPC를 찌르면 NPC는 다른 곳에서 다시 나타나고 찌른 사람이 목숨 -1', () => {
  const g = setup([['a', 2, 2, 'down'], [null, 2, 3, 'up'], ['b', 8, 8, 'up']]);
  queueInput(g, 'a', { type: 'attack' });
  const events = step(g);
  assert.equal(g.players.a.lives, LIVES - 1);
  assert.equal(g.ents.length, 3);
  assert.ok(!entById(g, 'npc23'));
  assert.deepEqual(events, [{ to: 'a', kind: 'penalty', lives: LIVES - 1 }]);
});

test('공격 후에는 쿨다운 동안 다시 공격할 수 없다', () => {
  const g = setup([['a', 0, 0, 'right'], ['b', 9, 9, 'up']]);
  queueInput(g, 'a', { type: 'attack' });
  step(g);
  queueInput(g, 'a', { type: 'attack' });
  assert.deepEqual(step(g), [{ to: 'a', kind: 'cooldown' }]);
  for (let i = 0; i < ATTACK_COOLDOWN; i++) step(g);
  queueInput(g, 'a', { type: 'attack' });
  assert.deepEqual(step(g), [{ to: 'a', kind: 'miss' }]);
});

test('막힌 쪽으로 움직이면 방향만 바뀐다', () => {
  const g = setup([['a', 0, 0, 'up'], ['b', 1, 0, 'up']]);
  assert.equal(tryMove(g, me(g, 'a'), 'left'), false);
  assert.equal(tryMove(g, me(g, 'a'), 'right'), false);
  assert.deepEqual([me(g, 'a').x, me(g, 'a').dir], [0, 'right']);
  assert.equal(tryMove(g, me(g, 'a'), 'down'), true);
  assert.equal(me(g, 'a').y, 1);
});

test('입력은 틱에 한 번만 반영된다', () => {
  const g = setup([['a', 5, 5, 'up'], ['b', 9, 9, 'up']]);
  queueInput(g, 'a', { type: 'move', dir: 'left' });
  queueInput(g, 'a', { type: 'move', dir: 'down' });
  step(g);
  assert.deepEqual([me(g, 'a').x, me(g, 'a').y], [5, 6]);
  step(g);
  assert.deepEqual([me(g, 'a').x, me(g, 'a').y], [5, 6]);
});

test('목숨을 모두 잃으면 탈락하고, 최후의 1인이 승리', () => {
  const g = setup([['a', 2, 2, 'right'], ['b', 3, 2, 'up']]);
  g.players.b.lives = 1;
  queueInput(g, 'a', { type: 'attack' });
  const events = step(g);
  assert.equal(g.players.b.alive, false);
  assert.equal(g.over, true);
  assert.equal(g.winner, 'a');
  assert.ok(events.some(e => e.to === 'b' && e.kind === 'eliminated'));
});

test('NPC를 찔러서 마지막 목숨을 잃어도 탈락', () => {
  const g = setup([['a', 2, 2, 'down'], [null, 2, 3, 'up'], ['b', 8, 8, 'up']]);
  g.players.a.lives = 1;
  queueInput(g, 'a', { type: 'attack' });
  step(g);
  assert.equal(g.players.a.alive, false);
  assert.equal(g.winner, 'b');
});

test('마지막 둘이 동시에 찌르면 무승부', () => {
  const g = setup([['a', 2, 2, 'right'], ['b', 3, 2, 'left']]);
  g.players.a.lives = g.players.b.lives = 1;
  queueInput(g, 'a', { type: 'attack' });
  queueInput(g, 'b', { type: 'attack' });
  step(g);
  assert.equal(g.over, true);
  assert.equal(g.winner, null);
});

test('게임 중 나간 플레이어의 캐릭터는 NPC가 된다', () => {
  const g = createGame(['a', 'b', 'c'], seeded(5));
  const id = g.players.c.entId;
  removePlayer(g, 'c');
  assert.equal(entById(g, id).owner, null);
  assert.equal(g.ents.length, ENTITY_COUNT);
  assert.equal(g.over, false);
  removePlayer(g, 'b');
  assert.equal(g.winner, 'a');
});

test('오래 돌려도 전체 수와 한 칸 한 명 규칙이 유지된다', () => {
  const r = seeded(11);
  const g = createGame(['a', 'b', 'c', 'd'], r);
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < 500 && !g.over; i++) {
    for (const pid of Object.keys(g.players))
      queueInput(g, pid, r() < 0.3 ? { type: 'attack' } : { type: 'move', dir: dirs[Math.floor(r() * 4)] });
    step(g);
    assert.equal(g.ents.length, ENTITY_COUNT);
    assert.equal(new Set(g.ents.map(e => `${e.x},${e.y}`)).size, ENTITY_COUNT);
    for (const pid of Object.keys(g.players)) {
      const v = privateView(g, pid);
      assert.equal(v.alive, v.id !== null && !!entById(g, v.id));
    }
  }
});
