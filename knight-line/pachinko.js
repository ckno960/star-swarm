// 10스테이지마다 나오는 보너스 파친코. 순수 로직(물리, 슬롯 판정). DOM 접근 없음.
// 공이 핀에 튕기며 떨어지고, 가운데 START 구멍에 들어가면 슬롯 3개가 돈다. 같은 그림 3개면 잭팟.
export const BOARD_W = 120, BOARD_H = 180, BALL_R = 2, PEG_R = 1.5;
export const BALLS_PER_BONUS = 10;
export const SLOT_TOP = BOARD_H - 18; // 바닥 칸막이 시작 높이
export const SLOTS = [
  { coins: 0 }, { coins: 5 }, { coins: 10 }, { start: true }, { coins: 10 }, { coins: 5 }, { coins: 0 },
];
export const SLOT_W = BOARD_W / SLOTS.length;
export const SYMBOLS = ['7', '★', '♦', '♣', '♥'];
const GRAVITY = 260, BOUNCE = 0.45, MAX_AGE = 12;

export function createBoard(rand = Math.random) {
  const pegs = [];
  for (let row = 0; row < 10; row++) {
    const y = 28 + row * 12;
    const offset = row % 2 ? 6 : 0;
    for (let x = 6 + offset; x <= BOARD_W - 6; x += 12) pegs.push({ x, y });
  }
  return { rand, pegs, balls: [], ballsLeft: BALLS_PER_BONUS };
}

// 위쪽 x 위치에서 공을 하나 떨어뜨린다. 남은 공이 없으면 false
export function dropBall(b, x) {
  if (b.ballsLeft <= 0) return false;
  b.ballsLeft--;
  const cx = Math.max(BALL_R + 1, Math.min(BOARD_W - BALL_R - 1, x));
  b.balls.push({ x: cx, y: 6, vx: (b.rand() - 0.5) * 20, vy: 0, age: 0 });
  return true;
}

// 물리를 dt초 진행하고, 바닥에 닿은 공을 [{ slot, x }]로 돌려준다
export function stepBoard(b, dt) {
  const landed = [];
  const steps = Math.ceil(dt / (1 / 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    for (const ball of b.balls) {
      ball.age += h;
      ball.vy += GRAVITY * h;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * BOUNCE; }
      if (ball.x > BOARD_W - BALL_R) { ball.x = BOARD_W - BALL_R; ball.vx = -Math.abs(ball.vx) * BOUNCE; }
      for (const p of b.pegs) bouncePeg(b, ball, p);
      if (ball.y > SLOT_TOP) bounceDividers(ball);
      // 핀 위에 딱 멈춰 버린 공은 그 자리 아래 칸으로 보낸다
      if (ball.y >= BOARD_H - BALL_R || ball.age > MAX_AGE) {
        ball.done = true;
        landed.push({ slot: slotAt(ball.x), x: ball.x });
      }
    }
    b.balls = b.balls.filter(ball => !ball.done);
  }
  return landed;
}

export function slotAt(x) {
  return Math.max(0, Math.min(SLOTS.length - 1, Math.floor(x / SLOT_W)));
}

export function isFinished(b) {
  return b.ballsLeft === 0 && b.balls.length === 0;
}

// 슬롯 3개 결과와 상금. 7 세 개는 잭팟(코인 + 보너스 공)
export function spinReels(rand = Math.random) {
  const reels = [0, 1, 2].map(() => SYMBOLS[Math.floor(rand() * SYMBOLS.length)]);
  return { reels, ...prizeFor(reels) };
}

export function prizeFor([a, b, c]) {
  if (a === '7' && b === '7' && c === '7') return { coins: 300, extraBalls: 5, label: 'JACKPOT!!' };
  if (a === b && b === c) return { coins: 100, extraBalls: 2, label: '대당첨!' };
  if (a === b || b === c || a === c) return { coins: 20, extraBalls: 0, label: '당첨' };
  return { coins: 0, extraBalls: 0, label: '꽝' };
}

function bouncePeg(b, ball, p) {
  const dx = ball.x - p.x, dy = ball.y - p.y;
  const min = BALL_R + PEG_R, d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  ball.x = p.x + nx * min;
  ball.y = p.y + ny * min;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + BOUNCE) * vn * nx;
    ball.vy -= (1 + BOUNCE) * vn * ny;
  }
  // 핀 꼭대기에 똑바로 떨어져도 어느 한쪽으로 굴러가게 살짝 흔든다
  ball.vx += (b.rand() - 0.5) * 30;
}

function bounceDividers(ball) {
  for (let i = 1; i < SLOTS.length; i++) {
    const wx = i * SLOT_W;
    if (Math.abs(ball.x - wx) < BALL_R) {
      ball.x = wx + Math.sign(ball.x - wx || 1) * BALL_R;
      ball.vx = -ball.vx * BOUNCE;
    }
  }
}
