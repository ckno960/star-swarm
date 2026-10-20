// 순수 게임 로직. DOM 접근 없음.
// 규칙: 기사는 4방향 중 하나로 일직선으로 달려가 처음 만나는 몬스터를 처치하고 그 칸에 선다.
// 그 방향에 몬스터가 없으면 움직일 수 없다. 몬스터를 모두 없애면 클리어.
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const MONSTER_KINDS = 3;

export function stageConfig(n) {
  const size = Math.min(10, 5 + Math.floor((n - 1) / 2));
  return { size, count: Math.min(Math.floor(size * size * 0.3), 3 + n) };
}

// 스테이지 번호를 시드로 써서 같은 스테이지는 언제나 같은 판이 나온다
export function createStage(n) {
  const { size, count } = stageConfig(n);
  return createState(generateLevel(seeded(n * 7919), size, count));
}

export function createState(level) {
  return {
    size: level.size,
    knight: { ...level.knight },
    monsters: level.monsters.map(m => ({ ...m })),
    history: [],
  };
}

// 정답 경로를 먼저 만들고 그 위에 몬스터를 놓아서, 항상 깰 수 있는 판만 나온다.
// 이미 지나간 길(통로)에 나중 몬스터를 두지 않으면, 매번 목표 몬스터가 그 방향의 첫 몬스터가 된다
export function generateLevel(rand, size, count) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const start = { x: Math.floor(rand() * size), y: Math.floor(rand() * size) };
    const blocked = new Set([key(start)]);
    const path = [];
    let cur = start;
    while (path.length < count) {
      const options = [];
      for (const [dx, dy] of Object.values(DIRS)) {
        const between = [];
        for (let x = cur.x + dx, y = cur.y + dy; inside(size, x, y); x += dx, y += dy) {
          if (!blocked.has(key({ x, y }))) options.push({ x, y, between: [...between] });
          between.push({ x, y });
        }
      }
      if (!options.length) break;
      const next = options[Math.floor(rand() * options.length)];
      for (const c of next.between) blocked.add(key(c));
      blocked.add(key(next));
      path.push({ x: next.x, y: next.y, kind: Math.floor(rand() * MONSTER_KINDS) });
      cur = next;
    }
    if (path.length === count) return { size, knight: start, monsters: path };
  }
  throw new Error(`${size}×${size}에 몬스터 ${count}마리 판을 만들지 못함`);
}

// 그 방향으로 처음 만나는 몬스터. 없으면 null
export function targetIn(s, dir) {
  const [dx, dy] = DIRS[dir];
  for (let x = s.knight.x + dx, y = s.knight.y + dy; inside(s.size, x, y); x += dx, y += dy) {
    const m = s.monsters.find(m => m.x === x && m.y === y);
    if (m) return m;
  }
  return null;
}

// 움직였으면 처치한 몬스터를, 못 움직이면 null을 돌려준다
export function move(s, dir) {
  const m = targetIn(s, dir);
  if (!m) return null;
  s.history.push({ knight: { ...s.knight }, monster: m });
  s.monsters = s.monsters.filter(o => o !== m);
  s.knight = { x: m.x, y: m.y };
  return m;
}

export function undo(s) {
  const h = s.history.pop();
  if (!h) return false;
  s.knight = h.knight;
  s.monsters.push(h.monster);
  return true;
}

export function isCleared(s) {
  return s.monsters.length === 0;
}

export function isStuck(s) {
  return !isCleared(s) && Object.keys(DIRS).every(d => !targetIn(s, d));
}

// 지금 상태에서 끝까지 깨는 방향 순서. 이미 못 깨는 상태면 null, 너무 오래 걸리면 undefined
export function solve(s, budget = 200000) {
  const dead = new Set();
  const walk = (knight, monsters) => {
    if (!monsters.length) return [];
    if (--budget < 0) throw TIMEOUT;
    const k = `${knight.x},${knight.y}|${monsters.map(key).sort().join(';')}`;
    if (dead.has(k)) return null;
    for (const dir of Object.keys(DIRS)) {
      const m = targetIn({ size: s.size, knight, monsters }, dir);
      if (!m) continue;
      const rest = walk({ x: m.x, y: m.y }, monsters.filter(o => o !== m));
      if (rest) return [dir, ...rest];
    }
    dead.add(k);
    return null;
  };
  try { return walk(s.knight, s.monsters); }
  catch (e) { if (e === TIMEOUT) return undefined; throw e; }
}
const TIMEOUT = Symbol('timeout');

export function seeded(seed) {
  // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function key(c) {
  return `${c.x},${c.y}`;
}
