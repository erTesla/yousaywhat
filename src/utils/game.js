export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Returns points for a correct answer (1000 base + up to 1000 speed bonus).
// elapsed and timeLimit are both in milliseconds.
export function calcPoints(elapsedMs, timeLimitSec) {
  const ratio = Math.max(0, Math.min(1, elapsedMs / (timeLimitSec * 1000)));
  return 1000 + Math.round(1000 * (1 - ratio));
}
