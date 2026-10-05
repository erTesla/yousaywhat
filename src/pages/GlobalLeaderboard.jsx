import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { db } from '../firebase';
import ScoreRow from '../components/ScoreRow';

export default function GlobalLeaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(
      ref(db, 'globalLeaderboard'),
      orderByChild('totalScore'),
      limitToLast(100),
    );
    const unsub = onValue(q, snap => {
      const rows = [];
      snap.forEach(child => rows.push({ uid: child.key, ...child.val() }));
      rows.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      setEntries(rows);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <div className="page page-centered">
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="gl-header">
          <button className="btn-back" onClick={() => navigate('/')}>← Back</button>
          <h2>🌍 Global Leaderboard</h2>
          <p className="muted">Top players across all sessions</p>
        </div>

        {loading && <p className="muted" style={{ textAlign: 'center' }}>Loading…</p>}

        {!loading && entries.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>No scores yet — play a game first!</p>
        )}

        <div className="scoreboard" style={{ marginTop: 16 }}>
          {entries.map(({ uid, name, totalScore, gamesPlayed }, i) => (
            <ScoreRow
              key={uid}
              index={i}
              name={name}
              points={totalScore}
              meta={`${gamesPlayed || 0} game${gamesPlayed !== 1 ? 's' : ''}`}
              delayMs={50}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
