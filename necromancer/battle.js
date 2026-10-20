// 자동 전투 시뮬레이션. 순수 로직(DOM 접근 없음). 한쪽에 수천 마리가 있어도 돌아가게 짠다.
//
// 길(길이 100)이 적 출발점(0)에서 네크로맨서(100)까지 이어진다. 길은 LANES개의 줄로 나뉜다.
// - 적은 출발점에서 차례로 나와 네크로맨서를 향해 진군한다. 네크로맨서가 주 목표다.
// - 소환수는 네크로맨서 앞을 지키다가, 자기 줄로 오는 적을 맞으러 나간다.
// - 같은 줄에서 마주치면 최전선끼리 싸운다. 줄마다 한 번에 맞붙을 수 있는 폭(width)이 정해져 있어서,
//   뒷줄은 앞줄이 쓰러지면 앞으로 나온다.
// - 어떤 줄에 소환수가 없으면 그 줄의 적은 그대로 네크로맨서까지 가서 때린다.
// 네크로맨서가 쓰러지면 패배, 적이 모두 쓰러지면 승리.
import { SPLASH_TARGETS } from './data.js';

export const STEP = 0.05;
export const TIME_LIMIT = 180;
export const LANES = 6;
export const NECRO_D = 100;
export const GUARD_D = 72; // 적이 없을 때 소환수 맨 앞줄이 서는 곳
const GAP = 2; // 맞붙었을 때 양쪽 최전선 사이 거리
const ROW = 1.4; // 대열 한 줄 깊이
const ATTACK_ROWS = 2; // 앞에서 몇 줄까지 공격에 참여하는지 (급습은 2줄 더)
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
  const total = summons.length + enemies.length;
  // 큰 전투일수록 줄 폭을 넓히고 피해를 키워서, 몇 마리든 전투가 20~40초 안에 끝나게 한다
  const width = Math.max(2, Math.min(30, Math.ceil(Math.sqrt(total) / 2.5)));
  const frontCap = LANES * width * ATTACK_ROWS;
  const bigger = Math.max(summons.length, enemies.length);
  const dmgScale = opts.dmgScale ?? Math.max(1, (bigger / frontCap) * 0.5);
  const spawnTime = opts.spawnTime ?? Math.min(25, 2 + enemies.length / 60);
  const unit = (u, i, side) => ({
    ...u, uid: uid++, side, slot: i, maxHp: u.hp, alive: true,
    timer: u.interval * (0.3 + rand() * 0.7), // 첫 공격 시점을 흩어서 모두 한꺼번에 때리지 않게
    jx: rand() * 2 - 1, jd: rand(), // 그림용 흩어짐
  });
  const b = {
    rand, time: 0, acc: 0, over: false, result: null, auto: false, width, dmgScale,
    allies: [], enemies: [], lanes: [], laneTimer: 0,
    alive: { ally: 0, enemy: 0 }, spawned: 0,
    cooldowns: { blast: SKILLS.blast.cooldown / 2, revive: 0 },
  };
  summons.forEach((u, i) => {
    const s = unit(u, i, 'ally');
    s.lane = i % LANES;
    s.d = GUARD_D + Math.floor(i / LANES / width) * ROW;
    b.allies.push(s);
  });
  const necroIn = allies.find(u => u.necro);
  b.necro = unit(necroIn, summons.length, 'ally');
  b.necro.d = NECRO_D;
  b.necro.lane = -1;
  b.allies.push(b.necro);
  // 보스는 맨 마지막에 나온다
  enemies.forEach((u, i) => {
    const e = unit(u, i, 'enemy');
    e.lane = Math.floor(rand() * LANES);
    e.spawnAt = enemies.length > 1 ? (i / (enemies.length - 1)) * spawnTime : 0;
    e.d = -2 - rand() * 3;
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

function tick(b, events) {
  b.time += STEP;
  for (const k of Object.keys(b.cooldowns)) b.cooldowns[k] = Math.max(0, b.cooldowns[k] - STEP);
  for (const e of b.enemies) if (!e.active && e.alive && e.spawnAt <= b.time) { e.active = true; b.spawned++; }
  if (b.auto) {
    if (canUse(b, 'revive') && b.alive.ally <= (b.allies.length - 1) * 0.6) events.push(...useSkill(b, 'revive'));
    if (canUse(b, 'blast') && b.enemies.filter(e => e.alive && e.active).length >= 2) events.push(...useSkill(b, 'blast'));
  }

  // 줄마다 살아 있는 유닛을 모으고 최전선부터 정렬한다
  const S = Array.from({ length: LANES }, () => []), E = Array.from({ length: LANES }, () => []);
  for (const u of b.allies) if (u.alive && !u.necro) S[u.lane].push(u);
  for (const e of b.enemies) if (e.alive && e.active) E[e.lane].push(e);

  b.laneTimer -= STEP;
  if (b.laneTimer <= 0) { b.laneTimer = 0.5; reinforce(S, E); }

  for (let l = 0; l < LANES; l++) {
    S[l].sort((p, q) => p.d - q.d); // 소환수는 출발점 쪽(작은 d)이 앞
    E[l].sort((p, q) => q.d - p.d); // 적은 네크로맨서 쪽(큰 d)이 앞
  }
  b.lanes = { S, E };

  const w = b.width;
  for (let l = 0; l < LANES; l++) {
    const s = S[l], e = E[l], sF = s[0], eF = e[0];
    // 맞붙는 지점: 양쪽 최전선의 가운데. 한쪽만 있으면 그쪽이 계속 나아간다
    s.forEach((u, r) => {
      const row = Math.floor(r / w);
      const goal = eF ? eF.d + GAP + row * ROW : Math.min(NECRO_D - 4, GUARD_D + row * ROW);
      move(u, goal);
    });
    e.forEach((u, r) => {
      const row = Math.floor(r / w);
      const goal = sF ? sF.d - GAP - row * ROW : NECRO_D - GAP - row * ROW;
      move(u, goal, true);
    });
  }

  for (let l = 0; l < LANES && !b.over; l++) {
    const s = S[l], e = E[l];
    s.forEach((u, r) => {
      if (!u.alive || b.over) return;
      tickUnit(b, u, events, () => pickTarget(b, u, r, e, s[0]));
    });
    e.forEach((u, r) => {
      if (!u.alive || b.over) return;
      tickUnit(b, u, events, () => (s.length ? pickTarget(b, u, r, s, e[0]) : necroTarget(b, u, r)));
    });
  }
  // 네크로맨서: 가장 가까이 온 적에게 암흑 화살
  if (!b.over && b.necro.alive) tickUnit(b, b.necro, events, () => nearestThreat(b));
  if (!b.over && b.time >= TIME_LIMIT) end(b, 'lose', events);
}

function move(u, goal, enemy = false) {
  const step = u.speed * STEP;
  if (enemy && !u.active) return;
  if (Math.abs(goal - u.d) <= step) u.d = goal;
  else u.d += Math.sign(goal - u.d) * step;
}

// 소환수가 없는 줄의 적을, 소환수가 많고 한가한 줄에서 옮겨 막는다
function reinforce(S, E) {
  for (let l = 0; l < LANES; l++) {
    if (S[l].length || !E[l].length) continue;
    let from = -1;
    for (let k = 0; k < LANES; k++) {
      if (S[k].length < 2) continue;
      if (from < 0 || S[k].length - E[k].length > S[from].length - E[from].length) from = k;
    }
    if (from < 0) continue;
    // 맨 뒷줄부터 3분의 1을 보낸다
    const moving = S[from].sort((p, q) => q.d - p.d).splice(0, Math.ceil(S[from].length / 3));
    for (const u of moving) u.lane = l;
    S[l].push(...moving);
  }
}

// r번째(앞에서부터) 유닛이 공격할 상대. 공격할 수 없는 위치면 null
function pickTarget(b, u, r, foes, ownFront) {
  if (!foes.length) return null;
  const w = b.width, row = Math.floor(r / w);
  const reach = ATTACK_ROWS + (u.trait === 'ambush' ? 2 : 0);
  if (row >= reach) return null;
  // 맞붙은 상태여야 공격한다 (앞줄 기준 거리)
  if (Math.abs(ownFront.d - foes[0].d) > GAP + 0.6) return null;
  if (u.trait === 'ambush') {
    // 급습: 앞줄을 넘어 뒤쪽 적까지 아무나
    const span = Math.min(foes.length, w * 3);
    return foes[Math.floor(b.rand() * span)];
  }
  // 마주 보는 자리의 적. 앞줄이 비면 남은 앞쪽 적
  return foes[Math.min(foes.length - 1, r % w)];
}

function necroTarget(b, u, r) {
  const row = Math.floor(r / b.width);
  const reach = ATTACK_ROWS + (u.trait === 'ambush' ? 2 : 0);
  if (row >= reach || u.d < NECRO_D - GAP - row * ROW - 0.6) return null;
  return b.necro;
}

function nearestThreat(b) {
  let best = null;
  for (const e of b.enemies) if (e.alive && e.active && (!best || e.d > best.d)) best = e;
  return best;
}

function tickUnit(b, u, events, target) {
  if (u.trait === 'regen' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * STEP);
  u.timer -= STEP;
  if (u.timer > 0) return;
  const t = target();
  if (!t) { u.timer = 0; return; } // 공격할 상대가 생기면 바로 때린다
  u.timer += u.interval;
  attack(b, u, t, events);
}

function attack(b, u, target, events) {
  const dmg = u.atk * b.dmgScale * (0.9 + b.rand() * 0.2);
  events.push({ type: 'attack', from: u, target });
  hurt(b, target, dmg, events, u);
  if (u.trait === 'drain') heal(u, dmg * 0.3, events);
  if (u.trait === 'splash' && target !== b.necro) {
    // 맞은 적 바로 뒤에 선 몇 마리까지 휘말린다
    const foes = b.lanes[target.side === 'ally' ? 'S' : 'E'][target.lane];
    const i = foes.indexOf(target);
    let hit = 0;
    for (let k = i + 1; k < foes.length && hit < SPLASH_TARGETS; k++) {
      if (!foes[k].alive) continue;
      hurt(b, foes[k], dmg * 0.3, events, u);
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
