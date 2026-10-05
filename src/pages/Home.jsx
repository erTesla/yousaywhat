import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { db } from '../firebase';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Home() {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleJoin(e) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!/^\d{6}$/.test(trimmed)) { setError('PIN must be 6 digits'); return; }

    setLoading(true);
    setError('');
    try {
      const snap = await get(ref(db, `games/${trimmed}/status`));
      if (!snap.exists())              setError('Game not found');
      else if (snap.val() === 'ended') setError('This game has already ended');
      else                             navigate(`/join?pin=${trimmed}`);
    } catch {
      setError('Connection error — check your internet');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home-layout">
      {/* ── LEFT: Join + Create ── */}
      <div className="home-left">
        <div className="home-logo">
          <h1>YouSayWhat?</h1>
          <p className="tagline">The live quiz game</p>
        </div>

        <form className="card join-card" onSubmit={handleJoin}>
          <input
            className="pin-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="Game PIN"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Join Game'}
          </button>
        </form>

        <div className="home-divider">or</div>
        <button className="btn btn-ghost home-create-btn" onClick={() => navigate('/create')}>
          + Create a Game
        </button>

        <div className="home-divider">or</div>
        <button className="btn btn-feedback" onClick={() => navigate('/feedback')}>
          Give Feedback
        </button>
      </div>

      {/* ── RIGHT: Global Leaderboard ── */}
      <div className="home-right">
        <MiniLeaderboard />
      </div>
    </div>
  );
}

function MiniLeaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(ref(db, 'globalLeaderboard'), orderByChild('totalScore'), limitToLast(20));
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
    <div className="mini-lb">
      <div className="mini-lb-header">
        <span>🌍 Global Leaderboard</span>
        <button className="btn-back" onClick={() => navigate('/leaderboard')}>See all →</button>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '24px 0', fontSize: '0.85rem' }}>
          No scores yet — be the first!
        </p>
      )}

      <div className="mini-lb-list">
        {entries.slice(0, 10).map(({ uid, name, totalScore, gamesPlayed }, i) => (
          <div
            key={uid}
            className={[
              'score-row',
              i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '',
            ].filter(Boolean).join(' ')}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            <span className="score-name">{name || 'Anonymous'}</span>
            <span className="gl-games">{gamesPlayed}g</span>
            <span className="score-pts">{totalScore?.toLocaleString() || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
