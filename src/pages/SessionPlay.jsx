import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, set, onValue } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const MEDALS = ['🥇', '🥈', '🥉'];

// Remembers which game pin this tab has already been pushed into, so returning
// to the waiting room mid-game offers a manual rejoin instead of yanking the
// player forward in a loop.
const followedKey = code => `ysw_followed_${code}`;

export default function SessionPlay() {
  const [params] = useSearchParams();
  const code     = params.get('code')?.toUpperCase();
  const navigate = useNavigate();
  const user     = useAuth();

  const [session,  setSession]  = useState(null);
  const [error,    setError]    = useState('');
  const [joining,  setJoining]  = useState(false);
  const [rejoinPin, setRejoinPin] = useState(null);

  // Joins the game without clobbering an existing player record.
  const joinGame = useCallback(async (pin, playerName) => {
    setJoining(true);
    try {
      const statusSnap = await get(ref(db, `games/${pin}/status`));
      if (!statusSnap.exists() || statusSnap.val() === 'ended') { setJoining(false); return; }

      const meSnap = await get(ref(db, `games/${pin}/players/${user.uid}`));
      if (!meSnap.exists()) {
        await set(ref(db, `games/${pin}/players/${user.uid}`), {
          name: playerName, score: 0, lastPoints: 0,
        });
      }
      sessionStorage.setItem(followedKey(code), pin);
      navigate(`/play?pin=${pin}&sessionCode=${code}`);
    } catch {
      setJoining(false);
    }
  }, [code, user, navigate]);

  useEffect(() => {
    if (!code || !user) return;
    const unsub = onValue(ref(db, `sessions/${code}`), snap => {
      if (!snap.exists()) { setError('Session not found'); return; }
      const s = snap.val();
      setSession(s);

      const pin = s.currentGamePin;
      if (!pin || s.status !== 'playing') { setRejoinPin(null); return; }

      if (sessionStorage.getItem(followedKey(code)) === pin) {
        setRejoinPin(pin);  // already been in this game — offer manual rejoin
      } else {
        joinGame(pin, s.players?.[user.uid]?.name || 'Player');
      }
    });
    return unsub;
  }, [code, user, joinGame]);

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

      {rejoinPin ? (
        <div className="session-waiting">
          <div className="session-waiting-icon">🎮</div>
          <h3>A game is in progress</h3>
          <p className="muted">You can jump back in — your score is kept.</p>
          <button
            className="btn btn-primary btn-large"
            onClick={() => joinGame(rejoinPin, session.players?.[user.uid]?.name || 'Player')}
            disabled={joining}
          >
            {joining ? 'Rejoining…' : 'Rejoin Game →'}
          </button>
        </div>
      ) : session.status === 'playing' || joining ? (
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
              className={['score-row', uid === user?.uid ? 'highlight' : '', i < 3 ? `rank-${i + 1}` : ''].filter(Boolean).join(' ')}
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
