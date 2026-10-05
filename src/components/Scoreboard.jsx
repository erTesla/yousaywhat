import { useRef } from 'react';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Scoreboard({ players, highlightUid, showDelta, final }) {
  // Track previous ranks to show movement arrows
  const prevRanks = useRef({});

  const ranked = players.map(([uid, p], i) => {
    const prev = prevRanks.current[uid];
    let arrow = null;
    if (prev !== undefined && prev !== i) {
      arrow = prev > i ? '↑' : '↓';
    }
    return { uid, p, rank: i, prev, arrow };
  });

  // Update prev ranks after render snapshot
  players.forEach(([uid], i) => { prevRanks.current[uid] = i; });

  return (
    <div className={`scoreboard${final ? ' scoreboard-final' : ''}`}>
      {ranked.map(({ uid, p, rank, arrow }, i) => (
        <div
          key={uid}
          className={[
            'score-row',
            highlightUid === uid ? 'highlight' : '',
            rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : '',
          ].filter(Boolean).join(' ')}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <span className="score-rank">{rank < 3 ? MEDALS[rank] : `#${rank + 1}`}</span>
          <span className="score-name">{p.name}</span>
          {arrow && (
            <span className={`score-arrow ${arrow === '↑' ? 'arrow-up' : 'arrow-down'}`}>
              {arrow}
            </span>
          )}
          {showDelta && p.lastPoints > 0 && (
            <span className="score-delta">+{p.lastPoints}</span>
          )}
          <span className="score-pts">{p.score || 0}</span>
        </div>
      ))}
      {players.length === 0 && (
        <p className="muted" style={{ textAlign: 'center' }}>No players yet</p>
      )}
    </div>
  );
}
