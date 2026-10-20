// 자동 전투 시뮬레이션. 순수 로직(DOM 접근 없음). 한쪽에 수천 마리가 있어도 돌아가게 짠다.
// 양쪽 모두 맨 앞(살아 있는 첫 번째) 상대를 때린다. 아군 줄은 소환수들 다음에 네크로맨서가 맨 뒤에 선다.
// 네크로맨서가 쓰러지면 패배, 적이 모두 쓰러지면 승리.
import { SPLASH_TARGETS } from './data.js';

export const STEP = 0.05;
export const TIME_LIMIT = 90;
export const BLAST_MULT = 3;
export const DAMAGE_SCALE = 1 / 3; // 모든 피해를 줄여 전투를 볼 만한 길이(10~20초)로 늘린다
export const REGEN = 0.02 * DAMAGE_SCALE; // 재생도 같은 비율로 줄여야 길어진 전투에서 재생만 세지지 않는다
export const SKILLS = {
  blast: { name: '영혼 폭발', cooldown: 12, desc: `모든 적에게 네크로맨서 공격력 ×${BLAST_MULT} 피해` },
  revive: { name: '되살리기', cooldown: 25, desc: '쓰러진 소환수를 최대 10마리, 체력 50%로 되살림' },
};
const REVIVE_COUNT = 10;

// allies, enemies: [{ typeId, name, level, hp, atk, interval, trait, necro? }] (앞에 설 유닛부터)
export function createBattle(allies, enemies, rand = Math.random) {
  let uid = 0;
  const unit = side => (u, slot) => ({
    ...u, uid: uid++, side, slot, maxHp: u.hp, alive: true,
    timer: u.interval * (0.3 + rand() * 0.7), // 첫 공격 시점을 흩어서 모두 한꺼번에 때리지 않게
  });
  const b = {
    rand, time: 0, acc: 0, over: false, result: null, auto: false,
    allies: allies.map(unit('ally')), enemies: enemies.map(unit('enemy')),
    // 맨 앞 살아 있는 유닛의 위치, 살아 있는 수. 매번 처음부터 찾지 않으려고 기억해 둔다
    front: { ally: 0, enemy: 0 }, alive: { ally: allies.length, enemy: enemies.length },
    cooldowns: { blast: SKILLS.blast.cooldown / 2, revive: 0 },
  };
  b.necro = b.allies.find(u => u.necro);
  return b;
}

export function necro(b) {
  return b.necro;
}

const listOf = (b, side) => (side === 'ally' ? b.allies : b.enemies);

export function frontUnit(b, side) {
  const list = listOf(b, side);
  let i = b.front[side];
  while (i < list.length && !list[i].alive) i++;
  b.front[side] = i;
  return list[i];
}

// 아무 적이나 하나. 거의 다 쓰러졌으면 맨 앞을 준다
function randomUnit(b, side) {
  const list = listOf(b, side), start = b.front[side];
  for (let k = 0; k < 6; k++) {
    const u = list[start + Math.floor(b.rand() * (list.length - start))];
    if (u?.alive) return u;
  }
  return frontUnit(b, side);
}

export function aliveCount(b, side) {
  return b.alive[side];
}

export function canUse(b, skill) {
  if (b.over || b.cooldowns[skill] > 0) return false;
  if (skill === 'revive') return b.alive.ally < b.allies.length && b.allies.some(u => !u.alive && !u.necro);
  return b.alive.enemy > 0;
}

// 스킬을 쓰고 일어난 일을 돌려준다. 못 쓰면 빈 배열
export function useSkill(b, skill) {
  if (!canUse(b, skill)) return [];
  b.cooldowns[skill] = SKILLS[skill].cooldown;
  const events = [{ type: 'skill', skill }];
  if (skill === 'blast') {
    const dmg = b.necro.atk * BLAST_MULT * DAMAGE_SCALE;
    for (const e of b.enemies) if (e.alive) hurt(b, e, dmg, events, b.necro);
  } else {
    // 앞쪽에서 쓰러진 소환수부터 되살린다
    let n = 0;
    for (const u of b.allies) {
      if (u.alive || u.necro) continue;
      u.alive = true;
      u.hp = Math.round(u.maxHp / 2);
      b.alive.ally++;
      b.front.ally = Math.min(b.front.ally, u.slot);
      events.push({ type: 'revive', target: u });
      if (++n >= REVIVE_COUNT) break;
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
  if (b.auto) {
    if (canUse(b, 'revive')) events.push(...useSkill(b, 'revive'));
    if (canUse(b, 'blast') && b.alive.enemy >= 2) events.push(...useSkill(b, 'blast'));
  }
  for (const list of [b.allies, b.enemies]) {
    for (const u of list) {
      if (!u.alive) continue;
      if (u.trait === 'regen' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * REGEN * STEP);
      u.timer -= STEP;
      if (u.timer > 0) continue;
      u.timer += u.interval;
      attack(b, u, events);
      if (b.over) return;
    }
  }
  if (b.time >= TIME_LIMIT) end(b, 'lose', events);
}

function attack(b, u, events) {
  const foe = u.side === 'ally' ? 'enemy' : 'ally';
  if (!b.alive[foe]) return;
  const random = u.trait === 'ambush' || u.trait === 'bolt';
  const target = random ? randomUnit(b, foe) : frontUnit(b, foe);
  const dmg = u.atk * DAMAGE_SCALE * (0.9 + b.rand() * 0.2);
  events.push({ type: 'attack', from: u, target });
  hurt(b, target, dmg, events, u);
  if (u.trait === 'drain') heal(u, dmg * 0.3, events);
  if (u.trait === 'splash') {
    // 맨 앞 적 뒤에 서 있는 몇 마리까지만 휘말린다
    const list = listOf(b, foe);
    let hit = 0;
    for (let i = target.slot + 1; i < list.length && hit < SPLASH_TARGETS; i++) {
      if (!list[i].alive) continue;
      hurt(b, list[i], dmg * 0.3, events, u);
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

// 끝날 때까지 한 번에 돌린다 (테스트·밸런스 확인용)
export function simulate(b) {
  while (!b.over) stepBattle(b, 1);
  return b.result;
}
