// 자동 전투 시뮬레이션. 순수 로직(DOM 접근 없음).
// 양쪽 모두 맨 앞(살아 있는 첫 번째) 상대를 때린다. 아군 줄은 소환수들 다음에 네크로맨서가 맨 뒤에 선다.
// 네크로맨서가 쓰러지면 패배, 적이 모두 쓰러지면 승리.
export const STEP = 0.05;
export const TIME_LIMIT = 90;
export const SKILLS = {
  blast: { name: '영혼 폭발', cooldown: 12, desc: '모든 적에게 네크로맨서 공격력 ×4 피해' },
  revive: { name: '되살리기', cooldown: 25, desc: '쓰러진 소환수 하나를 체력 50%로 되살림' },
};

// allies, enemies: [{ typeId, name, level, hp, atk, interval, trait, necro? }]
export function createBattle(allies, enemies, rand = Math.random) {
  let uid = 0;
  const unit = side => (u, slot) => ({
    ...u, uid: uid++, side, slot, maxHp: u.hp, alive: true,
    timer: u.interval * (0.3 + rand() * 0.7), // 첫 공격 시점을 흩어서 모두 한꺼번에 때리지 않게
  });
  return {
    rand, time: 0, acc: 0, over: false, result: null, auto: false,
    allies: allies.map(unit('ally')), enemies: enemies.map(unit('enemy')),
    cooldowns: { blast: SKILLS.blast.cooldown / 2, revive: 0 },
  };
}

export function necro(b) {
  return b.allies.find(u => u.necro);
}

export function canUse(b, skill) {
  if (b.over || b.cooldowns[skill] > 0) return false;
  if (skill === 'revive') return b.allies.some(u => !u.alive && !u.necro);
  return b.enemies.some(u => u.alive);
}

// 스킬을 쓰고 일어난 일을 돌려준다. 못 쓰면 빈 배열
export function useSkill(b, skill) {
  if (!canUse(b, skill)) return [];
  b.cooldowns[skill] = SKILLS[skill].cooldown;
  const events = [{ type: 'skill', skill }];
  if (skill === 'blast') {
    const dmg = necro(b).atk * 4;
    for (const e of b.enemies.filter(u => u.alive)) hurt(b, e, dmg, events, necro(b));
  } else {
    const dead = b.allies.find(u => !u.alive && !u.necro);
    dead.alive = true;
    dead.hp = Math.round(dead.maxHp / 2);
    events.push({ type: 'revive', target: dead });
  }
  checkEnd(b);
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
    if (canUse(b, 'blast') && b.enemies.filter(u => u.alive).length >= 2) events.push(...useSkill(b, 'blast'));
  }
  for (const u of [...b.allies, ...b.enemies]) {
    if (!u.alive || b.over) continue;
    if (u.trait === 'regen' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * STEP);
    u.timer -= STEP;
    if (u.timer > 0) continue;
    u.timer += u.interval;
    attack(b, u, events);
  }
  if (!b.over && b.time >= TIME_LIMIT) end(b, 'lose', events);
}

function attack(b, u, events) {
  const foes = (u.side === 'ally' ? b.enemies : b.allies).filter(o => o.alive);
  if (!foes.length) return;
  const random = u.trait === 'ambush' || u.trait === 'bolt';
  const target = random ? foes[Math.floor(b.rand() * foes.length)] : foes[0];
  const dmg = u.atk * (0.9 + b.rand() * 0.2);
  events.push({ type: 'attack', from: u, target });
  hurt(b, target, dmg, events, u);
  if (u.trait === 'drain') heal(u, dmg * 0.3, events);
  if (u.trait === 'splash') for (const o of foes) if (o !== target && o.alive) hurt(b, o, dmg * 0.3, events, u);
  checkEnd(b, events);
}

function hurt(b, target, dmg, events, from) {
  if (!target.alive) return;
  target.hp -= dmg;
  events.push({ type: 'hit', target, dmg: Math.round(dmg), from });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    events.push({ type: 'death', target });
  }
}

function heal(u, amount, events) {
  if (!u.alive) return;
  const before = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + amount);
  if (u.hp > before) events.push({ type: 'heal', target: u, amount: Math.round(u.hp - before) });
}

function checkEnd(b, events = []) {
  if (b.over) return;
  if (!necro(b).alive) end(b, 'lose', events);
  else if (!b.enemies.some(u => u.alive)) end(b, 'win', events);
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
