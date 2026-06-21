/**
 * In-memory store backed by localStorage so all tabs share the same data.
 * BroadcastChannel pushes change notifications to other tabs in real time.
 */
import seedData from './seed.json';

const STORAGE_KEY = 'ysw-mock-db';
const channel     = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('ysw-mock')
  : null;

// ── Persistence ───────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return JSON.parse(JSON.stringify(seedData));
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

let state = loadState();

// ── Subscribers ───────────────────────────────────────────────────────────────
// { path, type: 'value'|'childAdded', cb, knownKeys: Set|null }

const subs = [];
let _seq = 0;

// ── Path helpers ──────────────────────────────────────────────────────────────

function parts(path) {
  return path ? path.split('/').filter(Boolean) : [];
}

// ── Core read / write ─────────────────────────────────────────────────────────

export function read(path) {
  if (!path) return state;
  const v = parts(path).reduce((n, k) => (n != null ? n[k] : undefined), state);
  return v !== undefined ? v : null;
}

export function write(path, value) {
  if (!path) { state = value ?? {}; return; }
  const ps   = parts(path);
  const last = ps.pop();
  let node   = state;
  for (const k of ps) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  if (value == null) delete node[last];
  else node[last] = value;
}

// ── Snapshot factory ──────────────────────────────────────────────────────────

export function snap(path) {
  const val = read(path);
  return {
    exists: () => val != null,
    val:    () => val,
    key:    path ? path.split('/').pop() : null,
  };
}

// ── Notifications (same-tab) ──────────────────────────────────────────────────

export function notify(changedPath) {
  for (const s of [...subs]) {
    if (s.type !== 'value') continue;
    const p = s.path;
    if (!p || !changedPath ||
        changedPath === p ||
        changedPath.startsWith(p + '/') ||
        p.startsWith(changedPath + '/')) {
      s.cb(snap(p));
    }
  }
}

export function notifyChildAdded(parentPath, childPath) {
  const key = childPath.split('/').pop();
  for (const s of [...subs]) {
    if (s.type === 'childAdded' && s.path === parentPath) {
      s.knownKeys.add(key);
      s.cb(snap(childPath));
    }
  }
}

// ── Persist + signal other tabs ───────────────────────────────────────────────

export function afterWrite(changedPath) {
  saveState();
  channel?.postMessage({ changedPath });
}

// ── Subscription ──────────────────────────────────────────────────────────────

export function subscribe(path, type, cb) {
  const s = { path, type, cb, knownKeys: type === 'childAdded' ? new Set() : null };
  subs.push(s);
  return {
    unsub: () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); },
    sub:   s,
  };
}

// ── Cross-tab updates via BroadcastChannel ────────────────────────────────────

if (channel) {
  channel.onmessage = (e) => {
    state = loadState();                        // reload fresh data from localStorage
    const cp = e.data?.changedPath ?? '';

    for (const s of [...subs]) {
      if (s.type === 'value') {
        const p = s.path;
        if (!p || !cp ||
            cp === p ||
            cp.startsWith(p + '/') ||
            p.startsWith(cp + '/')) {
          s.cb(snap(p));
        }
      } else if (s.type === 'childAdded') {
        const children = read(s.path);
        if (!children || typeof children !== 'object') continue;
        for (const k of Object.keys(children)) {
          if (!s.knownKeys.has(k)) {
            s.knownKeys.add(k);
            s.cb(snap(`${s.path}/${k}`));
          }
        }
      }
    }
  };
}

// ── Key generation ────────────────────────────────────────────────────────────

export function newKey() {
  return `-mock${Date.now()}${_seq++}`;
}
