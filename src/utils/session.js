// Short, unambiguous words — easy to say out loud and type. Avoids words that
// sound alike over a noisy room. 60 words x 9000 numbers = 540k codes.
const WORDS = [
  'WOLF', 'BEAR', 'HAWK', 'LION', 'STORM', 'FROST', 'BLAZE', 'SWIFT',
  'NOVA', 'APEX', 'ECHO', 'JADE', 'BOLT', 'DUSK', 'REEF', 'SAGE',
  'TIDE', 'VIBE', 'ONYX', 'ZEST', 'COMET', 'DELTA', 'EMBER', 'FABLE',
  'GLIDE', 'HAVEN', 'IVORY', 'KAYAK', 'LUNAR', 'MAPLE', 'NOBLE', 'ORBIT',
  'PRISM', 'QUARTZ', 'RIVER', 'SOLAR', 'TOPAZ', 'ULTRA', 'VIVID', 'WILLOW',
  'AMBER', 'BISON', 'CEDAR', 'DRIFT', 'EAGLE', 'FLINT', 'GROVE', 'HONEY',
  'INDIGO', 'JOLLY', 'KRILL', 'LOTUS', 'MANGO', 'NECTAR', 'OASIS', 'PEARL',
  'RAVEN', 'SPARK', 'TUNDRA', 'ZEBRA',
];

export function generateSessionCode() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num  = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}-${num}`;
}

export function isSessionCode(input) {
  return /^[A-Za-z]{2,10}-\d{4}$/.test(input.trim());
}

export const MIN_PASSWORD_LEN = 4;

// Salted with the session code so the same password on two sessions produces
// different hashes. The hash is never readable by clients — it lives under
// sessionAuth/, and the DB rules compare against it so a host can prove
// knowledge of the password without anyone being able to read or replay it.
export async function hashPassword(code, password) {
  const data = new TextEncoder().encode(`${code}:${password}`);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Scored games count toward the leaderboard; activities are participation only.
const SCORED_TYPES = ['quiz', 'mixed'];
export const isActivityType = t => !SCORED_TYPES.includes(t);
