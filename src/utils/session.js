const WORDS = [
  'WOLF', 'BEAR', 'HAWK', 'LION', 'STORM', 'FROST',
  'BLAZE', 'SWIFT', 'NOVA', 'APEX', 'ECHO', 'JADE',
  'BOLT', 'DUSK', 'REEF', 'SAGE', 'TIDE', 'VIBE',
  'ONYX', 'ZEST',
];

export function generateSessionCode() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num  = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}-${num}`;
}

export function isSessionCode(input) {
  return /^[A-Za-z]{2,10}-\d{4}$/.test(input.trim());
}
