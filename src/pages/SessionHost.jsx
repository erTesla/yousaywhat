import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, onValue } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SessionHost() {
  const [params]  = useSearchParams();
  const code      = params.get('code')?.toUpperCase();
  const secret    = params.get('secret');
  const navigate  = useNavigate();
  const user      = useAuth();

  const [verified, setVerified] = useState(null);
  const [session,  setSession]  = useState(null);

  useEffect(() => {
    if (!user || !code || !secret) return;
    get(ref(db, `sessions/${code}/hostUid`)).then(snap => {
      if (!snap.exists()) { navigate('/'); return; }
      setVerified(snap.val() === user.uid);
    });
  }, [user, code, secret, navigate]);

  useEffect(() => {
    if (!verified || !code) return;
    const unsub = onValue(ref(db, `sessions/${code}`), snap => {
      if (snap.exists()) setSession(snap.val());
    });
    return unsub;
  }, [verified, code]);

  if (!code || !secret)           return <Splash>Invalid session URL.</Splash>;
  if (!user || verified === null) return <Splash>Verifying…</Splash>;
  if (verified === false)         return <Splash>Access denied — you are not the host.</Splash>;
  if (!session)                   return <Splash>Loading…</Splash>;

  const players = session.players || {};
  const games   = session.games   || {};

  const leaderboard = Object.entries(players)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

  const pastGames = Object.entries(games)
    .map(([pin, g]) => ({ pin, ...g }))
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

  return (
    <div className="page session-host-page">
      <div className="session-host-header">
        <div className="session-host-title">
          <h1>{session.name}</h1>
          <div className="session-code-badge">
            <span className="muted">Session Code:</span>
            <strong>{code}</strong>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem' }}>Players type this code on the home screen to join</p>
        </div>
        <div className="session-host-meta">
          <span className={`status-chip status-${session.status}`}>{session.status}</span>
          <span>{Object.keys(players).length} player{Object.keys(players).length !== 1 ? 's' : ''} joined</span>
        </div>
      </div>

      {session.currentGamePin && (
        <div className="session-active-banner">
          Game in progress — PIN: <strong>{session.currentGamePin}</strong>
        </div>
      )}

      <div className="session-host-body">
        <div className="session-lb-card">
          <h3>Cumulative Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <p className="muted">No players yet.</p>
          ) : (
            <div className="mini-lb-list">
              {leaderboard.map(({ uid, name, totalScore, gamesPlayed }, i) => (
                <div key={uid} className={['score-row', i < 3 ? `rank-${i + 1}` : ''].filter(Boolean).join(' ')}
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
                  <span className="score-name">{name}</span>
                  <span className="gl-games">{gamesPlayed || 0}g</span>
                  <span className="score-pts">{(totalScore || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="session-games-card">
          <h3>Games Played ({pastGames.length})</h3>
          {pastGames.length === 0 ? (
            <p className="muted">No games yet — start one below!</p>
          ) : (
            <div className="session-games-list">
              {pastGames.map(({ pin, endedAt, questionCount, winnerName, winnerScore, playerCount }) => (
                <div key={pin} className="session-game-row">
                  <div className="sgr-left">
                    <span className="sgr-date">{endedAt ? new Date(endedAt).toLocaleDateString() : '—'}</span>
                    <span className="sgr-pin">PIN {pin}</span>
                  </div>
                  <div className="sgr-right">
                    {questionCount}q · {playerCount || 0}p · 🏆 {winnerName || '—'} ({winnerScore || 0})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="session-host-footer">
        <button
          className="btn btn-primary btn-large"
          onClick={() => navigate(`/create?sessionCode=${code}&sessionSecret=${secret}`)}
        >
          + Start New Game
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>Back to Home</button>
      </div>
    </div>
  );
}

function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}
