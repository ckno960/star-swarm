// 게임 서버: 정적 파일(client/) + WebSocket. 방 하나가 게임 한 판이고, 모든 판정은 서버가 한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  createGame, queueInput, step, removePlayer, publicView, privateView,
  SIZE, TICK_MS, LIVES, MIN_PLAYERS, MAX_PLAYERS,
} from './game.js';

const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I, O, 0, 1 제외

export function startServer({ port = 8080, tickMs = TICK_MS, quickWaitMs = 15000, afterGameMs = 5000 } = {}) {
  const rooms = new Map(); // code → room
  const httpServer = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 1024 });

  wss.on('connection', ws => {
    const client = { id: crypto.randomUUID(), ws, name: '', room: null };
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg && typeof msg.t === 'string') handle(client, msg);
    });
    ws.on('close', () => leave(client));
  });

  function handle(c, msg) {
    if (msg.name !== undefined) c.name = cleanName(msg.name);
    switch (msg.t) {
      case 'create': return enter(c, newRoom('friend'));
      case 'join': {
        const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room || room.mode !== 'friend') return send(c, { t: 'error', msg: '방을 찾을 수 없어요' });
        return enter(c, room);
      }
      case 'quick': {
        const room = [...rooms.values()].find(r => r.mode === 'quick' && !r.game && r.members.size < MAX_PLAYERS);
        return enter(c, room ?? newRoom('quick'));
      }
      case 'start': {
        const r = c.room;
        if (!r || r.mode !== 'friend' || r.host !== c || r.game) return;
        if (r.members.size < MIN_PLAYERS) return send(c, { t: 'error', msg: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있어요` });
        return startGame(r);
      }
      case 'leave': leave(c); return send(c, { t: 'left' });
      case 'move': return c.room?.game && queueInput(c.room.game, c.id, { type: 'move', dir: msg.dir });
      case 'attack': return c.room?.game && queueInput(c.room.game, c.id, { type: 'attack' });
    }
  }

  function newRoom(mode) {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    while (rooms.has(code));
    const room = { code, mode, members: new Map(), host: null, game: null, loop: null, countdown: null };
    rooms.set(code, room);
    return room;
  }

  function enter(c, room) {
    if (c.room === room) return;
    if (room.game) return send(c, { t: 'error', msg: '이미 게임이 진행 중이에요' });
    if (room.members.size >= MAX_PLAYERS) return send(c, { t: 'error', msg: '방이 가득 찼어요' });
    leave(c);
    c.room = room;
    room.members.set(c.id, c);
    room.host ??= c;
    if (room.mode === 'quick') updateQuickCountdown(room);
    sendLobby(room);
  }

  function leave(c) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    room.members.delete(c.id);
    if (room.game) removePlayer(room.game, c.id);
    if (room.host === c) room.host = room.members.values().next().value ?? null;
    if (!room.members.size) return closeRoom(room);
    if (!room.game) {
      if (room.mode === 'quick') updateQuickCountdown(room);
      sendLobby(room);
    }
  }

  function closeRoom(room) {
    clearInterval(room.loop);
    clearTimeout(room.countdown?.timer);
    rooms.delete(room.code);
  }

  // 빠른 매칭: 2명이 모이면 카운트다운을 시작하고, 8명이 차면 바로 시작한다
  function updateQuickCountdown(room) {
    const n = room.members.size;
    if (n >= MAX_PLAYERS) return startGame(room);
    if (n < MIN_PLAYERS) {
      clearTimeout(room.countdown?.timer);
      room.countdown = null;
    } else if (!room.countdown) {
      room.countdown = { endsAt: Date.now() + quickWaitMs, timer: setTimeout(() => startGame(room), quickWaitMs) };
    }
  }

  function sendLobby(room) {
    for (const c of room.members.values()) send(c, {
      t: 'lobby', code: room.code, mode: room.mode, isHost: room.host === c,
      players: [...room.members.values()].map(m => m.name),
      startsIn: room.countdown ? Math.max(0, room.countdown.endsAt - Date.now()) : null,
      min: MIN_PLAYERS, max: MAX_PLAYERS,
    });
  }

  function startGame(room) {
    clearTimeout(room.countdown?.timer);
    room.countdown = null;
    if (room.game || room.members.size < MIN_PLAYERS) return;
    room.game = createGame([...room.members.keys()]);
    for (const c of room.members.values())
      send(c, { t: 'start', size: SIZE, tickMs, lives: LIVES, players: room.members.size });
    broadcastState(room);
    room.loop = setInterval(() => tick(room), tickMs);
  }

  function tick(room) {
    const g = room.game;
    for (const ev of step(g)) {
      const c = room.members.get(ev.to);
      if (c) send(c, { t: 'event', ...ev, to: undefined });
    }
    broadcastState(room);
    if (g.over) endGame(room);
  }

  function broadcastState(room) {
    const view = publicView(room.game);
    for (const c of room.members.values())
      send(c, { t: 'state', ...view, me: privateView(room.game, c.id) });
  }

  function endGame(room) {
    clearInterval(room.loop);
    const winner = room.members.get(room.game.winner);
    for (const c of room.members.values())
      send(c, { t: 'over', winner: winner?.name ?? null, youWon: winner === c });
    setTimeout(() => {
      room.game = null;
      if (!rooms.has(room.code)) return;
      // 친구 방은 같은 멤버로 로비에 돌아가고, 빠른 매칭 방은 해산한다
      if (room.mode === 'friend') return sendLobby(room);
      for (const c of room.members.values()) { c.room = null; send(c, { t: 'left' }); }
      closeRoom(room);
    }, afterGameMs);
  }

  function send(c, msg) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  return new Promise(resolve => httpServer.listen(port, () => resolve({
    port: httpServer.address().port,
    rooms,
    close: () => new Promise(done => {
      for (const room of rooms.values()) closeRoom(room);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      httpServer.close(done);
    }),
  })));
}

function cleanName(name) {
  return String(name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || '플레이어';
}

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end(); }
  const file = path.join(CLIENT_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(CLIENT_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer({ port: Number(process.env.PORT) || 8080 });
  console.log(`http://localhost:${port}`);
}
