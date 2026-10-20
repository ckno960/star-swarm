// 실제 서버를 띄우고 Node 내장 WebSocket 클라이언트로 접속해 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';

let startServer;
try { ({ startServer } = await import('./server.js')); } catch { /* npm install 전에는 건너뛴다 */ }
const opts = { skip: !startServer && 'npc-hunt에서 npm install 필요' };

function connect(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [], waiters = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const i = waiters.findIndex(w => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  };
  const next = (t, pred = () => true) => {
    const match = m => m.t === t && pred(m);
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise(resolve => waiters.push({ pred: match, resolve }));
  };
  const send = msg => ws.send(JSON.stringify(msg));
  return new Promise(resolve => { ws.onopen = () => resolve({ ws, next, send }); });
}

test('친구 모드: 방 만들기 → 코드로 입장 → 방장이 시작 → 상태 수신', opts, async () => {
  const server = await startServer({ port: 0, tickMs: 30 });
  try {
    const a = await connect(server.port), b = await connect(server.port);
    a.send({ t: 'create', name: '철수' });
    const { code } = await a.next('lobby');
    assert.match(code, /^[A-Z2-9]{4}$/);

    b.send({ t: 'join', code: code.toLowerCase(), name: '영희' });
    const lobbyB = await b.next('lobby');
    assert.deepEqual(lobbyB.players, ['철수', '영희']);
    assert.equal(lobbyB.isHost, false);

    b.send({ t: 'start' }); // 방장이 아니면 무시된다
    a.send({ t: 'start' });
    const start = await a.next('start');
    assert.equal(start.size, 10);

    const state = await b.next('state');
    assert.equal(state.ents.length, 24);
    assert.equal(state.alive, 2);
    assert.equal(state.me.lives, 3);
    assert.ok(state.ents.some(e => e.id === state.me.id));
    assert.ok(state.ents.every(e => !('owner' in e)));

    // 한쪽이 나가면 남은 사람이 최후의 1인
    b.ws.close();
    const over = await a.next('over');
    assert.equal(over.youWon, true);
    assert.equal(over.winner, '철수');
    a.ws.close();
  } finally {
    await server.close();
  }
});

test('없는 방 코드는 오류', opts, async () => {
  const server = await startServer({ port: 0 });
  try {
    const a = await connect(server.port);
    a.send({ t: 'join', code: 'ZZZZ', name: 'x' });
    assert.equal((await a.next('error')).msg, '방을 찾을 수 없어요');
    a.ws.close();
  } finally {
    await server.close();
  }
});

test('빠른 매칭: 2명이 모이면 카운트다운 후 자동 시작', opts, async () => {
  const server = await startServer({ port: 0, tickMs: 30, quickWaitMs: 100 });
  try {
    const a = await connect(server.port), b = await connect(server.port);
    a.send({ t: 'quick', name: 'a' });
    assert.equal((await a.next('lobby')).startsIn, null);
    b.send({ t: 'quick', name: 'b' });
    const lobby = await b.next('lobby');
    assert.equal(lobby.mode, 'quick');
    assert.ok(lobby.startsIn > 0);
    await Promise.all([a.next('start'), b.next('start')]);
    a.ws.close(); b.ws.close();
  } finally {
    await server.close();
  }
});
