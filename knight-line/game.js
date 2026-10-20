// 순수 게임 로직. DOM 접근 없음.
// 규칙: 기사는 4방향 중 하나로 일직선으로 달려가 처음 만나는 몬스터를 처치하고 그 칸에 선다.
// 그 방향에 몬스터가 없으면 움직일 수 없다. 몬스터를 모두 없애면 클리어.
// 갑옷 몬스터(체력 2)는 첫 번째 공격에는 버티고, 기사는 달려온 방향에서 그 몬스터 바로 앞 칸에 멈춘다.
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const MONSTER_KINDS = 3;   // 일반 몬스터 종류 수 (kind 0~2)
export const TOUGH_KIND = 3;      // 갑옷 몬스터
export const TOUGH_FROM_STAGE = 11;
export const GOLDEN_FROM_STAGE = 3;
export const GOLDEN_CHANCE = 0.35;
// 오늘의 퍼즐은 요일처럼 7일 주기로 난이도가 돈다 (이 스테이지 번호의 크기·몬스터 수를 빌려 쓴다)
const DAILY_STAGES = [8, 10, 12, 14, 16, 18, 20];

export function stageConfig(n) {
  const size = Math.min(10, 5 + Math.floor((n - 1) / 2));
  const count = Math.min(Math.floor(size * size * 0.3), 3 + n);
  const tough = n < TOUGH_FROM_STAGE ? 0 : Math.min(Math.floor(count / 3), 1 + Math.floor((n - TOUGH_FROM_STAGE) / 3));
  return { size, count, tough };
}

// 스테이지 번호를 시드로 써서 같은 스테이지는 언제나 같은 판이 나온다
export function createStage(n) {
  const { size, count, tough } = stageConfig(n);
  const level = generateLevel(seeded(n * 7919), size, count, tough);
  // 판을 만드는 난수와 따로 굴려야 황금 몬스터가 있어도 판 배치가 바뀌지 않는다
  if (n >= GOLDEN_FROM_STAGE && seeded(n * 104729)() < GOLDEN_CHANCE) markGolden(level);
  return createState(level);
}

export function createDaily(day) {
  const { size, count, tough } = stageConfig(DAILY_STAGES[((day % 7) + 7) % 7]);
  return createState(generateLevel(seeded(500009 + day * 7717), size, count, tough));
}

// 황금 몬스터는 정답 경로에서 마지막으로 쓰러지는 몬스터라서, 마지막에 잡는 방법이 반드시 있다
function markGolden(level) {
  const s = createState(level);
  let last = null;
  for (const d of level.solution) {
    const r = move(s, d);
    if (r.killed) last = r.monster;
  }
  level.monsters.find(o => o.x === last.x && o.y === last.y).golden = true;
}

// 클리어한 판에서 마지막으로 쓰러뜨린 몬스터가 황금 몬스터인지
export function goldenLast(s) {
  return isCleared(s) && !!s.history.at(-1)?.monster.golden;
}

export function createState(level) {
  return {
    size: level.size,
    knight: { ...level.knight },
    monsters: level.monsters.map(m => ({ hp: 1, ...m })),
    solution: level.solution ?? null,
    history: [],
  };
}

// 정답 경로를 먼저 만들고 그 위에 몬스터를 놓아서, 항상 깰 수 있는 판만 나온다.
// 이미 지나간 길(통로)에 나중 몬스터를 두지 않으면, 매번 목표 몬스터가 그 방향의 첫 몬스터가 된다.
// 갑옷 몬스터는 처음 놓을 때 한 대 맞은 것으로 치고, 두 번째 공격을 받기 전까지는 길을 막는 벽처럼 다룬다.
// tough가 0이면 난수를 예전과 똑같이 써서 1~10스테이지 판이 바뀌지 않는다
export function generateLevel(rand, size, count, tough = 0) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const start = { x: Math.floor(rand() * size), y: Math.floor(rand() * size) };
    const blocked = new Set([key(start)]);
    const path = [], solution = [];
    let wounded = [], toughLeft = tough;
    let cur = start;
    while (path.length < count || wounded.length) {
      const options = [];
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const between = [];
        for (let x = cur.x + dx, y = cur.y + dy; inside(size, x, y); x += dx, y += dy) {
          const w = wounded.find(m => m.x === x && m.y === y);
          if (w) { options.push({ x, y, between: [...between], dir, wounded: w }); break; }
          if (path.length < count && !blocked.has(key({ x, y }))) options.push({ x, y, between: [...between], dir, dx, dy });
          between.push({ x, y });
        }
      }
      if (!options.length) break;
      const next = options[Math.floor(rand() * options.length)];
      for (const c of next.between) blocked.add(key(c));
      solution.push(next.dir);
      if (next.wounded) {
        wounded = wounded.filter(m => m !== next.wounded);
        cur = { x: next.x, y: next.y };
        continue;
      }
      blocked.add(key(next));
      if (toughLeft > 0 && rand() < toughLeft / (count - path.length)) {
        toughLeft--;
        const m = { x: next.x, y: next.y, kind: TOUGH_KIND, hp: 2 };
        path.push(m);
        wounded.push(m);
        cur = { x: next.x - next.dx, y: next.y - next.dy };
      } else {
        path.push({ x: next.x, y: next.y, kind: Math.floor(rand() * MONSTER_KINDS) });
        cur = next;
      }
    }
    if (path.length === count && !wounded.length && toughLeft === 0) return { size, knight: start, monsters: path, solution };
  }
  throw new Error(`${size}×${size}에 몬스터 ${count}마리(갑옷 ${tough}) 판을 만들지 못함`);
}

// 공격 결과: 기사가 설 칸과, 몬스터가 쓰러졌는지
function strike(m, dir) {
  if (m.hp > 1) {
    const [dx, dy] = DIRS[dir];
    return { knight: { x: m.x - dx, y: m.y - dy }, killed: false };
  }
  return { knight: { x: m.x, y: m.y }, killed: true };
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

// 공격한 몬스터와 쓰러졌는지를 돌려준다. 그 방향에 몬스터가 없으면 null
export function move(s, dir) {
  const m = targetIn(s, dir);
  if (!m) return null;
  s.history.push({ dir, knight: { ...s.knight }, monster: m, hp: m.hp });
  const r = strike(m, dir);
  s.knight = r.knight;
  if (r.killed) s.monsters = s.monsters.filter(o => o !== m);
  else m.hp--;
  return { monster: m, killed: r.killed };
}

export function undo(s) {
  const h = s.history.pop();
  if (!h) return false;
  s.knight = h.knight;
  h.monster.hp = h.hp;
  if (!s.monsters.includes(h.monster)) s.monsters.push(h.monster);
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
    const k = `${knight.x},${knight.y}|${monsters.map(m => `${key(m)},${m.hp}`).sort().join(';')}`;
    if (dead.has(k)) return null;
    for (const dir of Object.keys(DIRS)) {
      const m = targetIn({ size: s.size, knight, monsters }, dir);
      if (!m) continue;
      const r = strike(m, dir);
      const left = r.killed ? monsters.filter(o => o !== m) : monsters.map(o => (o === m ? { ...o, hp: o.hp - 1 } : o));
      const rest = walk(r.knight, left);
      if (rest) return [dir, ...rest];
    }
    dead.add(k);
    return null;
  };
  try { return walk(s.knight, s.monsters); }
  catch (e) { if (e === TIMEOUT) return undefined; throw e; }
}
const TIMEOUT = Symbol('timeout');

// 다음에 갈 방향. 아직 만든 정답 경로를 그대로 따라가는 중이면 바로 알려 주고, 벗어났으면 탐색한다
export function hint(s) {
  const sol = s.solution;
  if (sol && s.history.every((h, i) => h.dir === sol[i]) && s.history.length < sol.length) return sol[s.history.length];
  const dirs = solve(s);
  return dirs ? dirs[0] : dirs;
}

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
