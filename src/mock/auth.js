/**
 * Mock of firebase/auth — anonymous sign-in, per-tab persistent UID.
 * UID is stored in sessionStorage so hot-reloads keep the same identity
 * but opening a new tab gives a fresh one (simulates a second player).
 */

const listeners = [];
let _user = null;

function getOrCreateUid() {
  const stored = sessionStorage.getItem('mock-uid');
  if (stored) return stored;
  const uid = 'mock-' + Math.random().toString(36).slice(2, 11);
  sessionStorage.setItem('mock-uid', uid);
  return uid;
}

export function getAuth()  { return {}; }  // sentinel

export function signInAnonymously(_auth) {
  if (_user) return Promise.resolve({ user: _user });
  _user = { uid: getOrCreateUid(), isAnonymous: true };
  listeners.forEach(cb => cb(_user));
  return Promise.resolve({ user: _user });
}

export function onAuthStateChanged(_auth, cb) {
  listeners.push(cb);
  // Fire asynchronously so callers can set up state before the callback runs
  setTimeout(() => cb(_user), 0);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
