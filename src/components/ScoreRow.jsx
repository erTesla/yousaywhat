import { rankLabel, rankClass } from '../utils/display';

// One leaderboard row. Shared by the home mini-board, the global leaderboard,
// the session dashboard and the player waiting room, which previously each had
// their own near-verbatim copy (and two different spellings of the rank class).
//
// `index` is zero-based. `meta` is optional secondary text, e.g. "3 games".
export default function ScoreRow({ index, name, points, meta, highlight, delayMs = 40 }) {
  return (
    <div
      className={['score-row', rankClass(index), highlight ? 'highlight' : ''].filter(Boolean).join(' ')}
      style={{ animationDelay: `${index * delayMs}ms` }}
    >
      <span className="score-rank">{rankLabel(index)}</span>
      <span className="score-name">
        {name || 'Anonymous'}
        {meta && <span className="score-meta"> {meta}</span>}
      </span>
      <span className="score-pts">{(points || 0).toLocaleString()}</span>
    </div>
  );
}
