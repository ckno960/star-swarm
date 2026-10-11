// 순수 게임 로직. DOM 접근 없음. 좌표는 논리 해상도 W×H 기준.
export const W = 360, H = 640;
const COLS = 8, ROWS = 4;
const FIRE_EVERY = 0.25, BULLET_SPEED = 480, PLAYER_SPEED = 900;
const ENEMY_BULLET_SPEED = 260, INVULN_TIME = 2;
export const STAGE_COUNT = 5;

// 스테이지가 올라갈수록 편대가 빨라지고, 돌진과 발사 간격(평균 초)이 짧아진다
export function stageConfig(n) {
  return { formationSpeed: 25 + n * 8, diveEvery: 3.2 - n * 0.4, shotEvery: 2 - n * 0.25 };
}

// progress: { [스테이지]: 최고 점수 }. 키가 있으면 클리어한 스테이지
export function recordClear(progress, stage, score) {
  return { ...progress, [stage]: Math.max(progress[stage] ?? 0, score) };
}

export function isUnlocked(progress, stage) {
  return stage === 1 || (stage - 1) in progress;
}

export function createState(rand = Math.random, stage = 1) {
  const cfg = stageConfig(stage);
  const enemies = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const e = { row, col, w: 22, h: 16, mode: 'formation', t: 0 };
      [e.x, e.y] = home(e, 0);
      enemies.push(e);
    }
  return {
    rand, stage, cfg,
    player: { x: W / 2, y: H - 50, w: 28, h: 20, targetX: W / 2 },
    bullets: [], enemyBullets: [], enemies,
    formation: { ox: 0, dir: 1, speed: cfg.formationSpeed },
    score: 0, lives: 3,
    invuln: 0, fireCooldown: 0, diveTimer: cfg.diveEvery, shotTimer: cfg.shotEvery,
    over: false, cleared: false,
  };
}

export function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

export function setTarget(s, x) {
  const half = s.player.w / 2;
  s.player.targetX = Math.max(half, Math.min(W - half, x));
}

export function update(s, dt) {
  dt = Math.min(dt, 0.05); // 탭 전환 등으로 생긴 큰 프레임 간격이 순간이동을 만들지 않게
  if (s.over || s.cleared) return;
  movePlayer(s, dt);
  fire(s, dt);
  moveBullets(s, dt);
  moveEnemies(s, dt);
  enemyFire(s, dt);
  s.invuln = Math.max(0, s.invuln - dt);
  collide(s);
}

function home(e, ox) {
  return [40 + e.col * 40 + ox, 80 + e.row * 36];
}

function movePlayer(s, dt) {
  const p = s.player, step = PLAYER_SPEED * dt, d = p.targetX - p.x;
  p.x += Math.abs(d) <= step ? d : Math.sign(d) * step;
}

function fire(s, dt) {
  s.fireCooldown -= dt;
  if (s.fireCooldown > 0) return;
  const p = s.player;
  s.bullets.push({ x: p.x, y: p.y - p.h / 2, w: 3, h: 10, vy: -BULLET_SPEED });
  s.fireCooldown = FIRE_EVERY;
}

function moveBullets(s, dt) {
  const inside = b => b.y > -20 && b.y < H + 20;
  for (const b of s.bullets) b.y += b.vy * dt;
  for (const b of s.enemyBullets) b.y += b.vy * dt;
  s.bullets = s.bullets.filter(inside);
  s.enemyBullets = s.enemyBullets.filter(inside);
}

function moveEnemies(s, dt) {
  const f = s.formation;
  f.ox += f.dir * f.speed * dt;
  if (Math.abs(f.ox) > 20) { f.ox = 20 * Math.sign(f.ox); f.dir *= -1; }

  s.diveTimer -= dt;
  if (s.diveTimer <= 0) { startDive(s); s.diveTimer = s.cfg.diveEvery * (0.6 + s.rand() * 0.8); }

  for (const e of s.enemies) {
    const [hx, hy] = home(e, f.ox);
    if (e.mode === 'formation') { e.x = hx; e.y = hy; continue; }
    if (e.mode === 'dive') {
      e.t += dt;
      // 처음 1초는 살짝 위로 튀었다가 내려오고, 좌우로 흔들며 플레이어 쪽으로 휜다
      e.y = e.sy + 220 * e.t - 140 * Math.sin(Math.min(e.t, 1) * Math.PI);
      e.x = e.sx + (e.ax - e.sx) * Math.min(1, e.t / 1.5) + Math.sin(e.t * 4) * 40;
      if (!e.fired && e.t > 0.8) { e.fired = true; shoot(s, e); }
      if (e.y > H + 20) { e.mode = 'return'; e.y = -20; }
      continue;
    }
    // return: 화면 위에서 편대 자리로 날아간다
    const dx = hx - e.x, dy = hy - e.y, dist = Math.hypot(dx, dy), step = 200 * dt;
    if (dist <= step) e.mode = 'formation';
    else { e.x += dx / dist * step; e.y += dy / dist * step; }
  }
}

function startDive(s) {
  const ready = s.enemies.filter(e => e.mode === 'formation');
  if (!ready.length) return;
  const e = ready[Math.floor(s.rand() * ready.length)];
  Object.assign(e, { mode: 'dive', t: 0, sx: e.x, sy: e.y, ax: s.player.x, fired: false });
}

function enemyFire(s, dt) {
  s.shotTimer -= dt;
  if (s.shotTimer > 0) return;
  s.shotTimer = s.cfg.shotEvery * (0.6 + s.rand() * 0.8);
  const ready = s.enemies.filter(e => e.mode === 'formation');
  if (ready.length) shoot(s, ready[Math.floor(s.rand() * ready.length)]);
}

function shoot(s, e) {
  s.enemyBullets.push({ x: e.x, y: e.y + e.h / 2, w: 4, h: 8, vy: ENEMY_BULLET_SPEED });
}

function collide(s) {
  for (const b of s.bullets)
    for (const e of s.enemies)
      if (!b.dead && !e.dead && hits(b, e)) {
        b.dead = e.dead = true;
        s.score += e.mode === 'dive' ? 100 : 50;
      }

  if (s.invuln <= 0) {
    const hitter = [...s.enemyBullets, ...s.enemies].find(o => !o.dead && hits(o, s.player));
    if (hitter) {
      hitter.dead = true;
      s.lives--;
      s.invuln = INVULN_TIME;
      if (s.lives <= 0) s.over = true;
    }
  }

  const alive = o => !o.dead;
  s.bullets = s.bullets.filter(alive);
  s.enemyBullets = s.enemyBullets.filter(alive);
  s.enemies = s.enemies.filter(alive);
  if (!s.enemies.length && !s.over) s.cleared = true;
}
