// 자동 전투 시뮬레이션. 순수 로직(DOM 접근 없음). 한쪽에 수천 마리가 있어도 돌아가게 짠다.
//
// 길(길이 100, 폭 ±ROAD_W)이 적 출발점(d=0)에서 네크로맨서(d=100)까지 이어진다. 모두가 한꺼번에 뒤엉켜 싸우는 난전이다.
// - 적은 출발점에서 차례로 나와 네크로맨서를 향해 진군한다. 네크로맨서가 주 목표다.
//   가까이(AGGRO) 소환수가 있으면 그 소환수에게 덤벼든다.
// - 소환수는 가장 가까운 적에게 달려가 싸운다. 여러 마리가 한 적을 둘러싸고 함께 때릴 수 있다.
// - 막아 주는 소환수가 없으면 적은 그대로 네크로맨서까지 가서 때린다.
// 네크로맨서가 쓰러지면 패배, 적이 모두 쓰러지면 승리.
import { SPLASH_TARGETS } from './data.js';

export const STEP = 0.05;
export const TIME_LIMIT = 180;
export const NECRO_D = 100;
export const ROAD_W = 12; // 길 가운데에서 양옆으로의 폭
export const GUARD_D = 78; // 싸울 적이 없을 때 소환수가 모여 지키는 곳
export const HOLD_D = 40; // 소환수는 이보다 앞(적 출발점 쪽)으로는 나가지 않고 길 한가운데서 맞선다
const SEP = 1.4; // 서로 이보다 가까우면 밀어내서 한 점에 겹쳐 뭉치지 않게
const RANGE = 2.2; // 근접 공격 거리
const AGGRO = 14; // 적이 진군을 멈추고 소환수에게 덤벼드는 거리
const RETARGET = 0.5; // 상대를 다시 고르는 간격(초)
const CELL = 4; // 가까운 상대를 찾을 때 길을 이 길이만큼씩 나눈 칸
const BLAST_MULT = 3;
export const SKILLS = {
  blast: { name: '영혼 폭발', cooldown: 12, desc: `나와 있는 모든 적에게 네크로맨서 공격력 ×${BLAST_MULT} 피해` },
  revive: { name: '되살리기', cooldown: 25, desc: '쓰러진 소환수를 체력 50%로 되살림 (군단의 10%, 최소 3마리)' },
};

// allies: 소환수들 + 네크로맨서({ necro: true }), enemies: 나올 순서대로
// 유닛: { typeId, name, level, hp, atk, interval, trait, speed }
export function createBattle(allies, enemies, rand = Math.random, opts = {}) {
  let uid = 0;
  const summons = allies.filter(u => !u.necro);
  const spawnTime = opts.spawnTime ?? Math.min(25, 2 + enemies.length / 60);
  const unit = (u, i, side) => ({
    ...u, uid: uid++, side, slot: i, maxHp: u.hp, alive: true, target: null,
    timer: u.interval * (0.3 + rand() * 0.7), // 첫 공격 시점을 흩어서 모두 한꺼번에 때리지 않게
    retarget: rand() * RETARGET,
  });
  // 상대를 둘러쌀 때 설 자리(상대 기준 둥근 둘레). 모두 같은 점으로 몰리지 않게
  const ring = u => { const a = rand() * Math.PI * 2; u.ox = Math.cos(a) * RANGE * 0.85; u.oy = Math.sin(a) * RANGE * 0.85; return u; };
  const b = {
    rand, time: 0, acc: 0, over: false, result: null, auto: false, dmgScale: opts.dmgScale ?? 1,
    allies: [], enemies: [], grid: { ally: [], enemy: [] },
    alive: { ally: 0, enemy: 0 }, spawned: 0,
    cooldowns: { blast: SKILLS.blast.cooldown / 2, revive: 0 },
  };
  // 소환수는 네크로맨서 앞에 넓게 퍼져 선다
  summons.forEach((u, i) => {
    const s = ring(unit(u, i, 'ally'));
    s.d = GUARD_D - rand() * 25;
    s.y = (rand() * 2 - 1) * ROAD_W * 0.9;
    b.allies.push(s);
  });
  b.necro = unit(allies.find(u => u.necro), summons.length, 'ally');
  Object.assign(b.necro, { d: NECRO_D, y: 0 });
  b.allies.push(b.necro);
  // 보스는 맨 마지막에 나온다
  enemies.forEach((u, i) => {
    const e = ring(unit(u, i, 'enemy'));
    e.spawnAt = enemies.length > 1 ? (i / (enemies.length - 1)) * spawnTime : 0;
    e.d = -2 - rand() * 3;
    e.y = (rand() * 2 - 1) * ROAD_W * 0.9;
    e.active = false;
    b.enemies.push(e);
  });
  b.alive.ally = b.allies.length;
  b.alive.enemy = b.enemies.length;
  return b;
}

export function necro(b) {
  return b.necro;
}

export function aliveCount(b, side) {
  return b.alive[side];
}

export function canUse(b, skill) {
  if (b.over || b.cooldowns[skill] > 0) return false;
  if (skill === 'revive') return b.alive.ally < b.allies.length;
  return b.enemies.some(e => e.alive && e.active);
}

// 스킬을 쓰고 일어난 일을 돌려준다. 못 쓰면 빈 배열
export function useSkill(b, skill) {
  if (!canUse(b, skill)) return [];
  b.cooldowns[skill] = SKILLS[skill].cooldown;
  const events = [{ type: 'skill', skill }];
  if (skill === 'blast') {
    const dmg = b.necro.atk * BLAST_MULT * b.dmgScale;
    for (const e of b.enemies) if (e.alive && e.active) hurt(b, e, dmg, events, b.necro);
  } else {
    const max = Math.max(3, Math.ceil((b.allies.length - 1) * 0.1));
    let n = 0;
    for (const u of b.allies) {
      if (u.alive || u.necro) continue;
      u.alive = true;
      u.hp = Math.round(u.maxHp / 2);
      u.d = Math.max(u.d, GUARD_D); // 네크로맨서 곁에서 다시 일어난다
      u.target = null;
      b.alive.ally++;
      events.push({ type: 'revive', target: u });
      if (++n >= max) break;
    }
  }
  checkEnd(b, events);
  return events;
}

// dt초 진행. 일어난 일(공격, 회복, 쓰러짐, 끝)을 돌려준다
export function stepBattle(b, dt) {
  const events = [];
  b.acc += dt;
  while (b.acc >= STEP && !b.over) {
    b.acc -= STEP;
    tick(b, events);
  }
  return events;
}

const cellOf = d => Math.max(0, Math.min(Math.floor((NECRO_D + 10) / CELL), Math.floor((d + 5) / CELL)));

// 살아 있는 유닛을 길 위치별 칸에 나눠 담는다. 가까운 상대를 찾을 때 근처 칸만 보면 된다
function buildGrid(b) {
  const n = cellOf(NECRO_D + 10) + 1;
  b.grid.ally = Array.from({ length: n }, () => []);
  b.grid.enemy = Array.from({ length: n }, () => []);
  for (const u of b.allies) if (u.alive && !u.necro) b.grid.ally[cellOf(u.d)].push(u);
  for (const e of b.enemies) if (e.alive && e.active) b.grid.enemy[cellOf(e.d)].push(e);
}

const dist2 = (a, c) => (a.d - c.d) ** 2 + (a.y - c.y) ** 2;

// maxDist 안에서 가장 가까운 상대. 칸마다 몇 마리만 살펴서 수천 마리여도 빠르다. 급습은 가까운 무리 중 아무나
function findFoe(b, u, side, maxDist = Infinity) {
  const grid = b.grid[side], c0 = cellOf(u.d);
  let best = null, bestD = Infinity;
  const reach = Math.min(grid.length, Math.ceil(maxDist / CELL) + 1);
  for (let k = 0; k <= reach; k++) {
    for (const c of k ? [c0 - k, c0 + k] : [c0]) {
      const list = grid[c];
      if (!list?.length) continue;
      const tries = Math.min(list.length, 6), start = Math.floor(b.rand() * list.length);
      for (let t = 0; t < tries; t++) {
        const o = list[(start + t) % list.length];
        if (!o.alive) continue;
        const dd = dist2(u, o);
        if (dd < bestD) { bestD = dd; best = o; }
      }
    }
    // 이미 찾은 상대보다 먼 칸은 볼 필요가 없다
    if (best && (k * CELL) ** 2 > bestD) break;
  }
  return best && bestD <= maxDist * maxDist ? best : null;
}

function tick(b, events) {
  b.time += STEP;
  for (const k of Object.keys(b.cooldowns)) b.cooldowns[k] = Math.max(0, b.cooldowns[k] - STEP);
  for (const e of b.enemies) if (!e.active && e.alive && e.spawnAt <= b.time) { e.active = true; b.spawned++; }
  if (b.auto) {
    if (canUse(b, 'revive') && b.alive.ally <= (b.allies.length - 1) * 0.6) events.push(...useSkill(b, 'revive'));
    if (canUse(b, 'blast') && b.enemies.filter(e => e.alive && e.active).length >= 2) events.push(...useSkill(b, 'blast'));
  }
  buildGrid(b);

  for (const u of b.allies) {
    if (!u.alive || u.necro || b.over) continue;
    // 소환수: 가장 가까운 적에게 달려간다. 적이 없으면 네크로맨서 앞으로 돌아온다
    if (!u.target?.alive || (u.retarget -= STEP) <= 0) {
      u.retarget = RETARGET;
      u.target = findFoe(b, u, 'enemy');
    }
    if (u.target) approach(u, u.target);
    else moveTo(u, GUARD_D + u.oy * 3, u.y);
    if (u.d < HOLD_D) u.d = HOLD_D;
    act(b, u, events);
  }
  for (const e of b.enemies) {
    if (!e.alive || !e.active || b.over) continue;
    // 적: 가까운 소환수가 있으면 덤벼들고, 없으면 네크로맨서에게 간다
    if (!e.target?.alive || e.target === b.necro || (e.retarget -= STEP) <= 0) {
      e.retarget = RETARGET;
      e.target = findFoe(b, e, 'ally', AGGRO) ?? b.necro;
    }
    approach(e, e.target);
    act(b, e, events);
  }
  separate(b);
  // 네크로맨서: 자기에게 가장 가까이 온 적에게 암흑 화살
  if (!b.over && b.necro.alive) {
    tickRegen(b.necro);
    b.necro.timer -= STEP;
    if (b.necro.timer <= 0) {
      const t = nearestThreat(b);
      if (t) { b.necro.timer += b.necro.interval; attack(b, b.necro, t, events); } else b.necro.timer = 0;
    }
  }
  if (!b.over && b.time >= TIME_LIMIT) end(b, 'lose', events);
}

// 같은 칸에서 너무 가까이 붙은 유닛끼리 조금씩 밀어낸다 (칸마다 몇 쌍만 봐서 빠르게)
function separate(b) {
  for (const side of ['ally', 'enemy']) {
    for (const list of b.grid[side]) {
      const n = list.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const u = list[i];
        for (let t = 0; t < 3; t++) {
          const o = list[Math.floor(b.rand() * n)];
          if (o === u) continue;
          const dd = u.d - o.d, dy = u.y - o.y, len2 = dd * dd + dy * dy;
          if (len2 >= SEP * SEP) continue;
          const len = Math.sqrt(len2) || 0.01, push = (SEP - len) / 2;
          const nx = len2 ? dd / len : b.rand() - 0.5, ny = len2 ? dy / len : b.rand() - 0.5;
          u.d += nx * push; u.y = Math.max(-ROAD_W, Math.min(ROAD_W, u.y + ny * push));
          o.d -= nx * push; o.y = Math.max(-ROAD_W, Math.min(ROAD_W, o.y - ny * push));
        }
      }
    }
  }
}

function moveTo(u, d, y) {
  const dd = d - u.d, dy = y - u.y, len = Math.hypot(dd, dy), step = u.speed * STEP;
  if (len <= step) { u.d = d; u.y = y; return; }
  u.d += (dd / len) * step;
  u.y = Math.max(-ROAD_W, Math.min(ROAD_W, u.y + (dy / len) * step));
}

// 상대 둘레의 자기 자리로 다가간다
function approach(u, t) {
  if (dist2(u, t) <= RANGE * RANGE * 0.8) return;
  moveTo(u, t.d + u.ox, t.y + u.oy);
}

function tickRegen(u) {
  if (u.trait === 'regen' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * STEP);
}

function act(b, u, events) {
  tickRegen(u);
  u.timer -= STEP;
  if (u.timer > 0) return;
  const t = u.target;
  // 급습(비행형)은 조금 더 멀리서도 때린다
  const range = u.trait === 'ambush' ? RANGE * 1.8 : RANGE;
  if (!t?.alive || dist2(u, t) > range * range * 1.3) { u.timer = 0; return; } // 닿으면 바로 때린다
  u.timer += u.interval;
  attack(b, u, t, events);
}

function nearestThreat(b) {
  let best = null;
  for (const e of b.enemies) if (e.alive && e.active && (!best || e.d > best.d)) best = e;
  return best;
}

function attack(b, u, target, events) {
  const dmg = u.atk * b.dmgScale * (0.9 + b.rand() * 0.2);
  events.push({ type: 'attack', from: u, target });
  hurt(b, target, dmg, events, u);
  if (u.trait === 'drain') heal(u, dmg * 0.3, events);
  if (u.trait === 'splash' && target !== b.necro) {
    // 맞은 상대 바로 옆에 있던 몇 마리까지 휘말린다
    const list = b.grid[target.side][cellOf(target.d)] ?? [];
    let hit = 0;
    for (const o of list) {
      if (hit >= SPLASH_TARGETS) break;
      if (o === target || !o.alive || dist2(o, target) > (RANGE * 2) ** 2) continue;
      hurt(b, o, dmg * 0.3, events, u);
      hit++;
    }
  }
  checkEnd(b, events);
}

function hurt(b, target, dmg, events, from) {
  if (!target.alive) return;
  target.hp -= dmg;
  events.push({ type: 'hit', target, dmg: Math.round(dmg), from });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    b.alive[target.side]--;
    events.push({ type: 'death', target });
  }
}

function heal(u, amount, events) {
  if (!u.alive) return;
  const before = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + amount);
  if (u.hp > before) events.push({ type: 'heal', target: u, amount: Math.round(u.hp - before) });
}

function checkEnd(b, events) {
  if (b.over) return;
  if (!b.necro.alive) end(b, 'lose', events);
  else if (!b.alive.enemy) end(b, 'win', events);
}

function end(b, result, events) {
  b.over = true;
  b.result = result;
  events.push({ type: 'end', result });
}

// 종류별로 쓰러뜨린 적 수 (길들이기에 쓴다)
export function killsByType(b) {
  const kills = {};
  for (const e of b.enemies) if (!e.alive) kills[e.typeId] = (kills[e.typeId] ?? 0) + 1;
  return kills;
}

// 끝날 때까지 한 번에 돌린다 (테스트·밸런스 확인용)
export function simulate(b) {
  while (!b.over) stepBattle(b, 1);
  return b.result;
}
