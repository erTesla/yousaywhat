// Shared vote tallying and bar geometry.
//
// This logic was previously inlined at six call sites (host live + ended screens,
// player vote + reveal screens, the dashboard mini preview, and the results
// breakdown) and had drifted: three different denominators were in use and the
// winning option was highlighted on some screens but not others. The dashboard
// divided by the largest count rather than the total, so a 60/40 split rendered
// as 100%/67% right next to the true counts.

// Counts votes per choice index. Ignores malformed or text answers, so it is
// safe to call on a word-cloud answer map too (returns all zeros).
export function tallyChoices(answers) {
  const counts = [0, 0, 0, 0];
  for (const a of Object.values(answers || {})) {
    if (Number.isInteger(a?.choice) && a.choice >= 0 && a.choice < counts.length) {
      counts[a.choice]++;
    }
  }
  return counts;
}

// Turns labels + counts into render-ready bars. `pct` is always a share of the
// total votes cast, so bars across every screen mean the same thing. `isLead`
// marks the joint winner(s) and is false when nobody has voted.
export function pollBars(choices, counts) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const max   = Math.max(0, ...counts);
  return (choices || []).filter(Boolean).map((label, i) => {
    const count = counts[i] || 0;
    return {
      label,
      count,
      pct:    total ? Math.round((count / total) * 100) : 0,
      isLead: count > 0 && count === max,
    };
  });
}

// Frequency map for word-cloud text answers, ranked most-frequent first.
// `limit` differs by context on purpose: the live display shows fewer than the
// stored snapshot, which shows fewer than the full report.
export function wordFrequency(texts, { limit = 60 } = {}) {
  const freq = {};
  for (const t of texts || []) {
    const key = String(t ?? '').trim().toLowerCase();
    if (key) freq[key] = (freq[key] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
