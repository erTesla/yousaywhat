import { useState } from 'react';
import Scoreboard from './Scoreboard';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function TeamLeaderboard({ playerList, teams, highlightUid, showDelta, final }) {
  const [tab, setTab] = useState('individual');

  // Compute team scores from playerList
  const teamScores = Object.entries(teams || {}).map(([code, t]) => {
    const members = Object.keys(t.members || {});
    const total = members.reduce((sum, uid) => {
      const p = playerList.find(([u]) => u === uid);
      return sum + (p?.[1]?.score || 0);
    }, 0);
    return { code, name: t.name, total, memberCount: members.length };
  }).sort((a, b) => b.total - a.total);

  const hasTeams = teamScores.length > 0;

  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
      {hasTeams && (
        <div className="lb-tabs">
          <button
            className={`lb-tab${tab === 'individual' ? ' lb-tab-active' : ''}`}
            onClick={() => setTab('individual')}
          >
            Individual
          </button>
          <button
            className={`lb-tab${tab === 'teams' ? ' lb-tab-active' : ''}`}
            onClick={() => setTab('teams')}
          >
            Teams
          </button>
        </div>
      )}

      {tab === 'individual' && (
        <Scoreboard
          players={playerList}
          highlightUid={highlightUid}
          showDelta={showDelta}
          final={final}
        />
      )}

      {tab === 'teams' && (
        <div className="scoreboard">
          {teamScores.map(({ code, name, total, memberCount }, i) => (
            <div
              key={code}
              className={[
                'score-row',
                i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '',
              ].filter(Boolean).join(' ')}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className="score-name">{name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', flexShrink: 0 }}>
                {memberCount}p
              </span>
              <span className="score-pts">{total.toLocaleString()}</span>
            </div>
          ))}
          {teamScores.length === 0 && (
            <p className="muted" style={{ textAlign: 'center' }}>No teams formed</p>
          )}
        </div>
      )}
    </div>
  );
}
