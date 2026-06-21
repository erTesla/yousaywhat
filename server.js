/**
 * YouSayWhat — local mock server for development without Firebase.
 * Runs a WebSocket server on port 3001 that any device on the LAN can reach.
 * State is persisted to mock-db.json so it survives restarts.
 *
 * Usage:  node server.js
 * Reset:  delete mock-db.json  (or GET http://localhost:3001/reset)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { networkInterfaces } from 'os';

const PORT      = 3001;
const DB_FILE   = './mock-db.json';
const SEED_FILE = './src/mock/seed.json';

// ── State ─────────────────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(DB_FILE))   return JSON.parse(readFileSync(DB_FILE,   'utf8'));
  if (existsSync(SEED_FILE)) return JSON.parse(readFileSync(SEED_FILE, 'utf8'));
  return {};
}

function saveState() {
  try { writeFileSync(DB_FILE, JSON.stringify(state, null, 2)); } catch {}
}

let state = loadState();

// ── Path helpers ──────────────────────────────────────────────────────────────

function readPath(path) {
  if (!path) return state;
  const v = path.split('/').filter(Boolean).reduce((n, k) => n?.[k], state);
  return v !== undefined ? v : null;
}

function writePath(path, value) {
  if (!path) { state = value ?? {}; return; }
  const parts = path.split('/').filter(Boolean);
  const last  = parts.pop();
  let node    = state;
  for (const k of parts) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  if (value == null) delete node[last];
  else node[last] = value;
}

let _seq = 0;
function newKey() { return `-${Date.now()}${_seq++}`; }

// ── Subscriptions ─────────────────────────────────────────────────────────────
// Map<subId, { ws, path, subType: 'value'|'childAdded', knownKeys: Set }>

const subs = new Map();

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function notifySubs(changedPath) {
  for (const [subId, sub] of subs) {
    if (sub.ws.readyState !== 1) continue;

    const p       = sub.path;
    const related = !p || !changedPath
      || changedPath === p
      || changedPath.startsWith(p + '/')
      || p.startsWith(changedPath + '/');
    if (!related) continue;

    if (sub.subType === 'value') {
      send(sub.ws, { type: 'value', subId, path: p, value: readPath(p) });

    } else if (sub.subType === 'childAdded') {
      const children = readPath(p);
      if (!children || typeof children !== 'object') continue;
      for (const [k, v] of Object.entries(children)) {
        if (!sub.knownKeys.has(k)) {
          sub.knownKeys.add(k);
          send(sub.ws, { type: 'childAdded', subId, path: `${p}/${k}`, value: v });
        }
      }
    }
  }
}

function notifyAll() {
  for (const [subId, sub] of subs) {
    if (sub.ws.readyState !== 1) continue;
    if (sub.subType === 'value') {
      send(sub.ws, { type: 'value', subId, path: sub.path, value: readPath(sub.path) });
    } else if (sub.subType === 'childAdded') {
      sub.knownKeys.clear();
      const children = readPath(sub.path);
      if (children && typeof children === 'object') {
        for (const [k, v] of Object.entries(children)) {
          sub.knownKeys.add(k);
          send(sub.ws, { type: 'childAdded', subId, path: `${sub.path}/${k}`, value: v });
        }
      }
    }
  }
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/reset') {
    state = existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : {};
    saveState();
    notifyAll();
    res.end('DB reset to seed\n');
    console.log('[reset] DB cleared');
  } else {
    res.end(`YouSayWhat mock DB — ${subs.size} active subscriptions\n`);
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const clientSubs = new Set();
  console.log(`[+] client connected from ${req.socket.remoteAddress}`);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { id, type, path = '', value, updates, subType, subId: unsubId } = msg;

    switch (type) {
      case 'get': {
        send(ws, { type: 'ack', id, value: readPath(path) });
        break;
      }

      case 'set': {
        writePath(path, value);
        saveState();
        notifySubs(path);
        send(ws, { type: 'ack', id });
        break;
      }

      case 'update': {
        for (const [rel, val] of Object.entries(updates || {})) {
          writePath(path ? `${path}/${rel}` : rel, val);
        }
        saveState();
        notifySubs(path);
        send(ws, { type: 'ack', id });
        break;
      }

      case 'push': {
        const key  = newKey();
        const full = path ? `${path}/${key}` : key;
        writePath(full, value);
        saveState();
        notifySubs(path);
        send(ws, { type: 'ack', id, key });
        break;
      }

      case 'remove': {
        writePath(path, null);
        saveState();
        notifySubs(path);
        send(ws, { type: 'ack', id });
        break;
      }

      case 'sub': {
        const sid = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const sub = { ws, path, subType, knownKeys: new Set() };
        subs.set(sid, sub);
        clientSubs.add(sid);

        // subAck MUST arrive before the initial data push so the client
        // can register its callback before the first value event fires.
        send(ws, { type: 'subAck', id, subId: sid });

        if (subType === 'value') {
          send(ws, { type: 'value', subId: sid, path, value: readPath(path) });

        } else if (subType === 'childAdded') {
          const children = readPath(path);
          if (children && typeof children === 'object') {
            for (const [k, v] of Object.entries(children)) {
              sub.knownKeys.add(k);
              send(ws, { type: 'childAdded', subId: sid, path: `${path}/${k}`, value: v });
            }
          }
        }
        break;
      }

      case 'unsub': {
        subs.delete(unsubId);
        clientSubs.delete(unsubId);
        break;
      }
    }
  });

  ws.on('close', () => {
    for (const sid of clientSubs) subs.delete(sid);
    console.log(`[-] client disconnected`);
  });

  ws.on('error', () => {});
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n  YouSayWhat mock DB server\n');
  console.log(`  Local:   ws://localhost:${PORT}`);

  // Print LAN IP addresses so the user knows what to share
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  Network: ws://${iface.address}:${PORT}`);
      }
    }
  }

  console.log(`\n  Reset:   GET http://localhost:${PORT}/reset`);
  console.log('');
});
