import { useMemo } from 'react';

const COLORS = ['#e94560', '#4361ee', '#f8b400', '#2ec4b6', '#a855f7', '#f97316'];

export default function WordCloud({ answers }) {
  const words = useMemo(() => {
    const freq = {};
    Object.values(answers || {}).forEach(a => {
      if (!a?.text) return;
      const word = a.text.trim().toLowerCase().slice(0, 40);
      if (word) freq[word] = (freq[word] || 0) + 1;
    });

    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 40);
    if (!entries.length) return [];

    const max = entries[0][1];
    return entries.map(([word, count], i) => ({
      word,
      count,
      size: 14 + Math.round((count / max) * 36),
      color: COLORS[i % COLORS.length],
    }));
  }, [answers]);

  if (!words.length) {
    return <p className="muted" style={{ textAlign: 'center' }}>Waiting for responses…</p>;
  }

  return (
    <div className="word-cloud">
      {words.map(({ word, count, size, color }) => (
        <span
          key={word}
          className="wc-word"
          style={{ fontSize: `${size}px`, color }}
          title={`${count} response${count !== 1 ? 's' : ''}`}
        >
          {word}
        </span>
      ))}
    </div>
  );
}
