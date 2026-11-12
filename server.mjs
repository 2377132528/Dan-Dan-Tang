import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
// Behind Nginx/BaoTa, bind to loopback only so port 3000 is not exposed.
// Set HOST=0.0.0.0 when intentionally serving the Node process directly.
const host = process.env.HOST || '0.0.0.0';

/** @type {Map<string, {code:string, clients:(import('ws').WebSocket|null)[], names:(string|null)[], started:boolean, seed:number}>} */
const rooms = new Map();

let vite = null;

function sendJson(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function makeCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

function roomPayload(room, you) {
  return {
    type: 'room',
    code: room.code,
    you,
    clients: [0, 1].map((index) => {
      const ws = room.clients[index];
      return ws ? { name: room.names[index] || '玩家', connected: true } : null;
    }),
    started: room.started,
  };
}

function broadcastRoom(room) {
  for (let index = 0; index < 2; index += 1) {
    const ws = room.clients[index];
    if (ws) sendJson(ws, roomPayload(room, index));
  }
}

function closeRoom(room, except = null) {
  for (const client of room.clients) {
    if (client && client !== except) {
      sendJson(client, { type: 'peer-left' });
      client.meta = null;
    }
  }
  rooms.delete(room.code);
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'create') {
    if (ws.meta) return;
    const name = String(message.name || '红队玩家').slice(0, 12) || '红队玩家';
    const code = makeCode();
    const room = { code, clients: [ws, null], names: [name, null], started: false, seed: 0 };
    rooms.set(code, room);
    ws.meta = { code, index: 0, name };
    sendJson(ws, roomPayload(room, 0));
    return;
  }

  if (message.type === 'join') {
    if (ws.meta) return;
    const code = String(message.code || '').replace(/\D/g, '').slice(0, 4);
    const room = rooms.get(code);
    if (!room) {
      sendJson(ws, { type: 'error', message: '没有找到这个房间，再确认一下房间码吧。' });
      return;
    }
    if (room.started) {
      sendJson(ws, { type: 'error', message: '这场对战已经开始了。' });
      return;
    }
    if (room.clients[1]) {
      sendJson(ws, { type: 'error', message: '房间里已经有两位玩家了。' });
      return;
    }
    const name = String(message.name || '蓝队玩家').slice(0, 12) || '蓝队玩家';
    room.clients[1] = ws;
    room.names[1] = name;
    ws.meta = { code, index: 1, name };
    broadcastRoom(room);
    return;
  }

  const meta = ws.meta;
  if (!meta) return;
  const room = rooms.get(meta.code);
  if (!room) return;

  if (message.type === 'start') {
    if (meta.index !== 0) {
      sendJson(ws, { type: 'error', message: '只有房主可以开始对战。' });
      return;
    }
    if (!room.clients[0] || !room.clients[1]) {
      sendJson(ws, { type: 'error', message: '还在等好友加入房间。' });
      return;
    }
    room.started = true;
    room.seed = crypto.randomBytes(4).readUInt32BE(0);
    const startPayload = {
      type: 'start',
      seed: room.seed,
      code: room.code,
      names: [room.names[0] || '红队玩家', room.names[1] || '蓝队玩家'],
    };
    sendJson(room.clients[0], { ...startPayload, you: 0 });
    sendJson(room.clients[1], { ...startPayload, you: 1 });
    return;
  }

  if (message.type === 'relay') {
    if (!room.started) return;
    const otherIndex = meta.index === 0 ? 1 : 0;
    const other = room.clients[otherIndex];
    if (!other) {
      sendJson(ws, { type: 'peer-left' });
      return;
    }
    sendJson(other, { type: 'relay', from: meta.index, payload: message.payload });
    return;
  }

  if (message.type === 'leave') {
    leave(ws);
  }
}

function leave(ws) {
  const meta = ws.meta;
  if (!meta) return;
  const room = rooms.get(meta.code);
  ws.meta = null;
  if (!room) return;
  const index = meta.index;
  room.clients[index] = null;
  room.names[index] = null;
  if (index === 0) {
    closeRoom(room, ws);
    return;
  }
  room.started = false;
  const host = room.clients[0];
  if (host) {
    broadcastRoom(room);
    sendJson(host, { type: 'peer-left' });
  } else {
    rooms.delete(room.code);
  }
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.meta = null;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // The close handler cleans up.
    }
  }
}, 30000).unref();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const dist = path.join(__dirname, 'dist');
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(dist))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    filePath = path.join(dist, 'index.html');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found. Run "npm run build" first, or use "npm run dev".');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });
  } else {
    serveStatic(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    // Let Vite's HMR server handle its own upgrade requests.
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

if (!isProd) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: 'spa',
  });
  console.log('  Vite middleware + HMR enabled');
}

server.listen(port, host, () => {
  console.log('');
  console.log('  ✦ 弹弹堂 · 风之物语');
  console.log(`  ➜  listen: ${host}:${port}`);
  console.log(`  ➜  http://localhost:${port}`);
  console.log(`  ➜  LAN: http://<your-ip>:${port}`);
  console.log(`  ➜  mode: ${isProd ? 'production' : 'development'}`);
  console.log(`  ➜  health: http://localhost:${port}/healthz`);
  console.log('  ➜  online rooms: ws://.../ws');
  console.log('');
});
