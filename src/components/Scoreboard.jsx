const MEDALS = ['🥇', '🥈', '🥉'];

export default function Scoreboard({ players, highlightUid, showDelta, final }) {
  return (
    <div className={`scoreboard${final ? ' scoreboard-final' : ''}`}>
      {players.map(([uid, p], i) => (
        <div
          key={uid}
          className={[
            'score-row',
            highlightUid === uid ? 'highlight' : '',
            i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
          <span className="score-name">{p.name}</span>
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
