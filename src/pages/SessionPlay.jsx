import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set, onValue } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SessionPlay() {
  const [params] = useSearchParams();
  const code     = params.get('code')?.toUpperCase();
  const navigate = useNavigate();
  const user     = useAuth();

  const [session, setSession] = useState(null);
  const [error,   setError]   = useState('');
  const followedPin = useRef(null);

  useEffect(() => {
    if (!code || !user) return;
    const unsub = onValue(ref(db, `sessions/${code}`), snap => {
      if (!snap.exists()) { setError('Session not found'); return; }
      const s = snap.val();
      setSession(s);

      const pin = s.currentGamePin;
      if (pin && pin !== followedPin.current && s.status === 'playing') {
        followedPin.current = pin;
        const playerName = s.players?.[user.uid]?.name || 'Player';
        set(ref(db, `games/${pin}/players/${user.uid}`), { name: playerName, score: 0 })
          .then(() => navigate(`/play?pin=${pin}&sessionCode=${code}`))
          .catch(() => navigate(`/play?pin=${pin}&sessionCode=${code}`));
      }
    });
    return unsub;
  }, [code, user, navigate]);

  if (!code || !user) return <Splash>Connecting…</Splash>;
  if (error)          return <div className="page page-centered"><p className="error-msg">{error}</p></div>;
  if (!session)       return <Splash>Loading session…</Splash>;

  const players     = session.players || {};
  const me          = user ? players[user.uid] : null;
  const leaderboard = Object.entries(players)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

  return (
    <div className="page session-play-page">
      <div className="session-play-header">
        <h2>{session.name}</h2>
        <div className="session-code-badge"><strong>{code}</strong></div>
        {me && <p className="muted">Playing as <strong>{me.name}</strong></p>}
      </div>

      {session.status === 'playing' ? (
        <div className="session-waiting">
          <div className="loading-dots"><span /><span /><span /></div>
          <p>Game starting — joining automatically…</p>
        </div>
      ) : (
        <div className="session-waiting">
          <div className="session-waiting-icon">⏳</div>
          <h3>Waiting for the host…</h3>
          <p className="muted">Stay on this screen — you'll be taken into the next game automatically.</p>
        </div>
      )}

      {me && (
        <div className="session-my-score">
          <span>Your total: <strong>{(me.totalScore || 0).toLocaleString()} pts</strong></span>
          <span className="muted">{me.gamesPlayed || 0} game{me.gamesPlayed !== 1 ? 's' : ''} played</span>
        </div>
      )}

      <div className="session-lb-mini">
        <h3>Session Leaderboard</h3>
        <div className="mini-lb-list">
          {leaderboard.map(({ uid, name, totalScore }, i) => (
            <div
              key={uid}
              className={['score-row', uid === user?.uid ? 'my-score-row' : '', i < 3 ? `rank-${i + 1}` : ''].filter(Boolean).join(' ')}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <span className="score-name">{name}</span>
              <span className="score-pts">{(totalScore || 0).toLocaleString()}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="muted">No scores yet</p>}
        </div>
      </div>
    </div>
  );
}

function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}
