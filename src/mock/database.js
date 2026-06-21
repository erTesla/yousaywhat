/**
 * Mock of firebase/database — WebSocket client that talks to server.js.
 * Auto-detects the server address from location.hostname so it works on any
 * device on the LAN without any configuration.
 */

// Connect to the mock server on the same host that served the page.
// Works on localhost and on other LAN devices automatically.
const WS_URL = import.meta.env.VITE_MOCK_WS_URL
  || `ws://${location.hostname}:3001`;

// ── Connection ────────────────────────────────────────────────────────────────

let ws          = null;
let ready       = false;
const queue     = [];              // messages waiting for connection
const pending   = new Map();       // id → { resolve, reject }
const subCbs    = new Map();       // subId → callback
let _id         = 0;

function nextId() { return String(++_id); }

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ready = true;
    for (const msg of queue.splice(0)) ws.send(JSON.stringify(msg));
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);

    if (msg.type === 'ack') {
      pending.get(msg.id)?.resolve(msg);
      pending.delete(msg.id);

    } else if (msg.type === 'subAck') {
      // Resolve the subscribe promise with the server-assigned subId
      pending.get(msg.id)?.resolve(msg.subId);
      pending.delete(msg.id);

    } else if (msg.type === 'value') {
      subCbs.get(msg.subId)?.(makeSnap(msg.path, msg.value));

    } else if (msg.type === 'childAdded') {
      subCbs.get(msg.subId)?.(makeSnap(msg.path, msg.value));
    }
  };

  ws.onclose = () => {
    ready = false;
    setTimeout(connect, 1500);   // auto-reconnect
  };

  ws.onerror = () => ws.close();
}

connect();

function send(msg) {
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    if (ready) ws.send(JSON.stringify(msg));
    else queue.push(msg);
  });
}

// ── Snapshot factory ──────────────────────────────────────────────────────────

function makeSnap(path, value) {
  return {
    exists: () => value != null,
    val:    () => value,
    key:    path ? path.split('/').pop() : null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const mockDb = Symbol('mockDb');
export function getDatabase() { return mockDb; }

export function ref(_db, path = '') {
  return { _path: path.replace(/^\/+|\/+$/g, '') };
}

export function get(r) {
  const id = nextId();
  return send({ id, type: 'get', path: r._path })
    .then(msg => makeSnap(r._path, msg.value));
}

export function set(r, value) {
  return send({ id: nextId(), type: 'set', path: r._path, value }).then(() => {});
}

export function update(r, updates) {
  return send({ id: nextId(), type: 'update', path: r._path, updates }).then(() => {});
}

export function push(r, value) {
  return send({ id: nextId(), type: 'push', path: r._path, value })
    .then(msg => ({ key: msg.key }));
}

export function remove(r) {
  return send({ id: nextId(), type: 'remove', path: r._path }).then(() => {});
}

export function onValue(r, cb) {
  const id = nextId();
  let subId = null;

  send({ id, type: 'sub', path: r._path, subType: 'value' }).then(sid => {
    subId = sid;
    subCbs.set(sid, cb);
  });

  return () => {
    if (subId) {
      subCbs.delete(subId);
      send({ id: nextId(), type: 'unsub', subId });
    }
  };
}

export function onChildAdded(r, cb) {
  const id = nextId();
  let subId = null;

  send({ id, type: 'sub', path: r._path, subType: 'childAdded' }).then(sid => {
    subId = sid;
    subCbs.set(sid, cb);
  });

  return () => {
    if (subId) {
      subCbs.delete(subId);
      send({ id: nextId(), type: 'unsub', subId });
    }
  };
}

export function serverTimestamp() { return Date.now(); }
