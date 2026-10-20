// 순수 게임 로직. 네트워크 접근 없음. 서버만 이 파일을 쓰고, 클라이언트에는 publicView 결과만 보낸다.
export const SIZE = 10;            // 10×10 = 100칸
export const TICK_MS = 400;        // NPC와 플레이어가 같은 박자로 한 칸씩 움직인다
export const LIVES = 3;
export const ENTITY_COUNT = 24;    // 플레이어 + NPC 합계. 인원과 관계없이 항상 같다
export const ATTACK_COOLDOWN = 3;  // 틱 단위
export const BODY_TTL = 6;         // 쓰러진 자리가 화면에 남는 틱 수
export const SKINS = 6;
export const MIN_PLAYERS = 2, MAX_PLAYERS = 8;

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_NAMES = Object.keys(DIRS);

export function createGame(playerIds, rand = Math.random) {
  const g = { rand, tick: 0, ents: [], players: {}, bodies: [], over: false, winner: null };
  for (const pid of playerIds) {
    g.players[pid] = { lives: LIVES, entId: null, cooldown: 0, next: null, alive: true };
    spawn(g, pid);
  }
  while (g.ents.length < ENTITY_COUNT) spawn(g, null);
  return g;
}

export function queueInput(g, pid, input) {
  const p = g.players[pid];
  if (!p || !p.alive || g.over) return;
  if (input.type === 'move' && DIRS[input.dir]) p.next = { type: 'move', dir: input.dir };
  else if (input.type === 'attack') p.next = { type: 'attack' };
}

// 한 틱 진행. 본인에게만 알릴 일을 { to, kind, ... } 배열로 돌려준다
export function step(g) {
  if (g.over) return [];
  g.tick++;
  const events = [];
  resolveAttacks(g, events);
  moveAll(g);
  g.bodies = g.bodies.filter(b => --b.ttl > 0);
  checkWinner(g);
  return events;
}

// 게임 도중 나간 플레이어의 캐릭터는 NPC가 이어받는다. 갑자기 멈추거나 사라지면 정체가 드러나기 때문
export function removePlayer(g, pid) {
  const p = g.players[pid];
  if (!p || !p.alive) return;
  const e = entById(g, p.entId);
  if (e) { e.owner = null; e.rest = 0; }
  p.alive = false; p.lives = 0; p.entId = null; p.next = null;
  checkWinner(g);
}

export function publicView(g) {
  // id 순으로 정렬해서 배열 순서(생성 순서)로 플레이어를 짐작할 수 없게 한다
  const ents = g.ents.map(e => ({ id: e.id, x: e.x, y: e.y, dir: e.dir, skin: e.skin }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const bodies = g.bodies.map(b => ({ x: b.x, y: b.y, skin: b.skin }));
  return { tick: g.tick, ents, bodies, alive: alivePlayers(g).length };
}

export function privateView(g, pid) {
  const p = g.players[pid];
  // cooldown은 다음 틱 시작에 1 줄어든 뒤 검사하므로, "앞으로 기다려야 할 틱 수"로 바꿔서 보낸다
  return { id: p.entId, lives: p.lives, cooldown: Math.max(0, p.cooldown - 1), alive: p.alive };
}

export function alivePlayers(g) {
  return Object.keys(g.players).filter(pid => g.players[pid].alive);
}

export function entById(g, id) {
  return g.ents.find(e => e.id === id);
}

export function entAt(g, x, y) {
  return g.ents.find(e => e.x === x && e.y === y);
}

function resolveAttacks(g, events) {
  // 같은 틱의 공격은 틱 시작 위치 기준으로 동시에 처리한다. 서로 찌르면 둘 다 맞는다
  const hits = [];
  for (const [pid, p] of Object.entries(g.players)) {
    if (!p.alive) continue;
    p.cooldown = Math.max(0, p.cooldown - 1);
    if (p.next?.type !== 'attack') continue;
    p.next = null;
    if (p.cooldown > 0) { events.push({ to: pid, kind: 'cooldown' }); continue; }
    p.cooldown = ATTACK_COOLDOWN;
    const me = entById(g, p.entId);
    const [dx, dy] = DIRS[me.dir];
    const target = entAt(g, me.x + dx, me.y + dy);
    if (!target) events.push({ to: pid, kind: 'miss' });
    else hits.push({ attacker: pid, target });
  }

  const killed = new Set();
  for (const { target } of hits) {
    if (killed.has(target)) continue;
    killed.add(target);
    killEnt(g, target);
    if (target.owner) {
      const v = g.players[target.owner];
      v.lives--;
      if (v.lives > 0) { spawn(g, target.owner); events.push({ to: target.owner, kind: 'hurt', lives: v.lives }); }
      else { eliminate(g, target.owner); events.push({ to: target.owner, kind: 'eliminated' }); }
    } else {
      spawn(g, null); // NPC도 똑같이 다른 칸에서 새로 나타난다. 그래야 부활만 보고 플레이어를 알 수 없다
    }
  }

  for (const { attacker, target } of hits) {
    const p = g.players[attacker];
    if (target.owner) { events.push({ to: attacker, kind: 'killPlayer' }); continue; }
    if (!p.alive) continue;
    p.lives--;
    if (p.lives > 0) { events.push({ to: attacker, kind: 'penalty', lives: p.lives }); continue; }
    const e = entById(g, p.entId);
    if (e) { killEnt(g, e); spawn(g, null); }
    eliminate(g, attacker);
    events.push({ to: attacker, kind: 'eliminated' });
  }
}

function eliminate(g, pid) {
  const p = g.players[pid];
  p.alive = false; p.lives = 0; p.entId = null; p.next = null;
  // 전체 수를 유지해야 인원이 줄었다는 게 머릿수로 드러나지 않는다
  if (g.ents.length < ENTITY_COUNT) spawn(g, null);
}

function killEnt(g, e) {
  g.ents = g.ents.filter(o => o !== e);
  g.bodies.push({ x: e.x, y: e.y, skin: e.skin, ttl: BODY_TTL });
}

function moveAll(g) {
  // 매 틱 순서를 섞어서 플레이어가 먼저 움직이는 식의 규칙성이 생기지 않게 한다
  for (const e of shuffle([...g.ents], g.rand)) {
    if (!g.ents.includes(e)) continue;
    if (e.owner) {
      const p = g.players[e.owner];
      if (p.next?.type === 'move') { tryMove(g, e, p.next.dir); p.next = null; }
    } else npcStep(g, e);
  }
}

function npcStep(g, e) {
  const r = g.rand;
  if (e.rest > 0) {
    e.rest--;
    if (r() < 0.15) e.dir = pick(DIR_NAMES, r);
    return;
  }
  if (r() < 0.3) e.dir = pick(DIR_NAMES, r);
  if (!tryMove(g, e, e.dir)) e.dir = pick(DIR_NAMES, r);
  if (r() < 0.35) e.rest = 1 + Math.floor(r() * 4);
}

// 막힌 쪽으로 움직이면 방향만 바뀐다. 옆 사람을 찌르려면 그쪽으로 한 번 부딪치면 된다
export function tryMove(g, e, dir) {
  e.dir = dir;
  const [dx, dy] = DIRS[dir];
  const nx = e.x + dx, ny = e.y + dy;
  if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || entAt(g, nx, ny)) return false;
  e.x = nx; e.y = ny;
  return true;
}

function spawn(g, owner) {
  const free = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (!entAt(g, x, y)) free.push([x, y]);
  const [x, y] = pick(free, g.rand);
  const e = {
    id: newId(g), x, y, dir: pick(DIR_NAMES, g.rand), skin: Math.floor(g.rand() * SKINS),
    owner, rest: Math.floor(g.rand() * 3),
  };
  // 처음 배치 때 플레이어가 배열 앞쪽에 몰리지 않게 무작위 위치에 끼워 넣는다
  g.ents.splice(Math.floor(g.rand() * (g.ents.length + 1)), 0, e);
  if (owner) g.players[owner].entId = e.id;
  return e;
}

function newId(g) {
  let id;
  do id = Math.floor(g.rand() * 0xffffff).toString(16).padStart(6, '0');
  while (entById(g, id));
  return id;
}

function checkWinner(g) {
  const alive = alivePlayers(g);
  if (alive.length > 1) return;
  g.over = true;
  g.winner = alive[0] ?? null; // 마지막 둘이 동시에 쓰러지면 무승부
}

function pick(arr, r) {
  return arr[Math.floor(r() * arr.length)];
}

function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
