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
