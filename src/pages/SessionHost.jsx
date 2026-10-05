import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, set, onValue, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { generatePin, generateSecret } from '../utils/game';
import { isActivityType } from '../utils/session';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SessionHost() {
  const [params]  = useSearchParams();
  const code      = params.get('code')?.toUpperCase();
  const secret    = params.get('secret');
  const navigate  = useNavigate();
  const user      = useAuth();

  const [verified, setVerified] = useState(null);
  const [session,  setSession]  = useState(null);
  const [loadErr,  setLoadErr]  = useState('');
  const [copied,   setCopied]   = useState(false);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    if (!user || !code || !secret) return;
    get(ref(db, `sessions/${code}/hostUid`))
      .then(snap => {
        if (!snap.exists()) { navigate('/'); return; }
        setVerified(snap.val() === user.uid);
      })
      .catch(() => setLoadErr('Could not reach the database — check your connection and reload.'));
  }, [user, code, secret, navigate]);

  useEffect(() => {
    if (!verified || !code) return;
    const unsub = onValue(
      ref(db, `sessions/${code}`),
      snap => { if (snap.exists()) setSession(snap.val()); },
      () => setLoadErr('Lost connection to the session.'),
    );
    return unsub;
  }, [verified, code]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — code is visible on screen anyway */ }
  }

  // Host lost the /host tab mid-game: fetch that game's secret and go back in.
  async function resumeGame(pin) {
    setBusy(true);
    try {
      const snap = await get(ref(db, `games/${pin}/hostSecret`));
      if (snap.exists()) {
        navigate(`/host?pin=${pin}&secret=${snap.val()}&sessionCode=${code}&sessionSecret=${secret}`);
        return;
      }
      setLoadErr('That game no longer exists.');
    } catch {
      setLoadErr('Could not resume the game.');
    }
    setBusy(false);
  }

  // Launch a previously saved game. The draft is kept so it can be replayed.
  async function playDraft(draftId, draft) {
    setBusy(true);
    try {
      const pin    = generatePin();
      const gsecret = generateSecret();
      await set(ref(db, `games/${pin}`), {
        hostUid:         user.uid,
        hostSecret:      gsecret,
        status:          'lobby',
        currentQuestion: null,
        reveal:          null,
        chatEnabled:     true,
        gameType:        draft.gameType || 'quiz',
        kind:            isActivityType(draft.gameType || 'quiz') ? 'activity' : 'quiz',
        sessionCode:     code,
        questions:       draft.questions || [],
      });
      await update(ref(db, `sessions/${code}`), { currentGamePin: pin, status: 'playing' });
      navigate(`/host?pin=${pin}&secret=${gsecret}&sessionCode=${code}&sessionSecret=${secret}`);
    } catch {
      setLoadErr('Could not start that saved game.');
      setBusy(false);
    }
  }

  async function deleteDraft(draftId) {
    setBusy(true);
    try {
      await remove(ref(db, `sessions/${code}/drafts/${draftId}`));
    } catch {
      setLoadErr('Could not delete that saved game.');
    }
    setBusy(false);
  }

  async function toggleTeamMode() {
    setBusy(true);
    try {
      await update(ref(db, `sessions/${code}`), { teamMode: !session.teamMode });
    } catch {
      setLoadErr('Could not change team mode.');
    }
    setBusy(false);
  }

  // Abandoned game: release players from it without recording a result.
  async function cancelGame() {
    setBusy(true);
    try {
      await update(ref(db, `sessions/${code}`), { currentGamePin: null, status: 'between' });
    } catch {
      setLoadErr('Could not cancel the game.');
    }
    setBusy(false);
  }

  if (!code || !secret)   return <Splash>Invalid session URL.</Splash>;
  if (loadErr)            return <Splash>{loadErr}</Splash>;
  if (!user || verified === null) return <Splash>Verifying…</Splash>;

  if (verified === false) {
    return (
      <div className="page page-centered">
        <div className="card" style={{ textAlign: 'center', maxWidth: 380 }}>
          <h2>Not signed in as host</h2>
          <p className="muted">
            This device isn't the host of <strong>{code}</strong> — either another device took
            over, or this browser's session was cleared.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/session/rejoin?code=${code}`)}
          >
            Rejoin with password →
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }
  if (!session) return <Splash>Loading…</Splash>;

  const players = session.players || {};
  const games   = session.games   || {};

  const leaderboard = Object.entries(players)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

  const draftList = Object.entries(session.drafts || {})
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const pastGames = Object.entries(games)
    .map(([pin, g]) => ({ pin, ...g }))
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

  return (
    <div className="page session-host-page">
      <div className="session-host-header">
        <div className="session-host-title">
          <h1>{session.name}</h1>
          <div className="session-code-row">
            <div className="session-code-badge">
              <span className="muted">Session Code:</span>
              <strong>{code}</strong>
            </div>
            <button className="btn btn-ghost btn-copy" onClick={copyCode}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
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
          <span>Game in progress — PIN: <strong>{session.currentGamePin}</strong></span>
          <div className="sab-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => resumeGame(session.currentGamePin)}>
              Resume Game →
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={cancelGame}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="session-teams-bar">
        <div className="stb-left">
          <span className="stb-title">Team mode</span>
          <span className="muted stb-desc">
            {session.teamMode
              ? 'Players can create and join teams in the game lobby.'
              : 'Off — players play as individuals and see no team options.'}
          </span>
        </div>
        <div className="stb-right">
          {session.teamMode && (
            <span className="muted stb-count">
              {Object.keys(session.teams || {}).length} team{Object.keys(session.teams || {}).length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            className={`btn toggle-btn${session.teamMode ? ' toggle-on' : ''}`}
            onClick={toggleTeamMode}
            disabled={busy}
            aria-pressed={!!session.teamMode}
          >
            <span className="toggle-dot" />
            {session.teamMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {session.teamMode && Object.keys(session.teams || {}).length > 0 && (
        <div className="session-teams-list">
          {Object.entries(session.teams).map(([tc, t]) => (
            <div key={tc} className="team-chip">
              {t.name} <span className="team-chip-code">#{tc}</span>
              <span className="team-chip-count">{Object.keys(t.members || {}).length}</span>
            </div>
          ))}
        </div>
      )}

      <div className="session-host-body">
        <div className="session-lb-card">
          <h3>Cumulative Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <p className="muted">No players yet.</p>
          ) : (
            <div className="mini-lb-list">
              {leaderboard.map(({ uid, name, totalScore, gamesPlayed, activitiesJoined }, i) => (
                <div key={uid} className={['score-row', i < 3 ? `rank-${i + 1}` : ''].filter(Boolean).join(' ')}
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="score-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
                  <span className="score-name">
                    {name}
                    {activitiesJoined > 0 && (
                      <span className="lb-activities"> · {activitiesJoined} activit{activitiesJoined === 1 ? 'y' : 'ies'}</span>
                    )}
                  </span>
                  <span className="gl-games">{gamesPlayed || 0}g</span>
                  <span className="score-pts">{(totalScore || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="session-games-card session-drafts-card">
          <h3>Saved Games ({draftList.length})</h3>
          {draftList.length === 0 ? (
            <p className="muted">
              None saved. While building a game, use <strong>Save for later</strong> to keep it here.
            </p>
          ) : (
            <div className="session-games-list">
              {draftList.map(({ id, name, gameType, questions }) => (
                <div key={id} className="draft-row">
                  <div className="draft-info">
                    <span className={`sgr-kind${isActivityType(gameType) ? ' sgr-kind-activity' : ''}`}>
                      {gameType === 'poll' ? '📊 Poll' : gameType === 'wordcloud' ? '☁️ Word Cloud' : '🧠 Quiz'}
                    </span>
                    <span className="draft-name">{name}</span>
                    <span className="muted draft-count">{(questions || []).length}q</span>
                  </div>
                  <div className="draft-actions">
                    <button
                      className="btn btn-primary draft-btn"
                      disabled={busy || !!session.currentGamePin}
                      title={session.currentGamePin ? 'Finish the current game first' : undefined}
                      onClick={() => playDraft(id, draftList.find(d => d.id === id))}
                    >
                      Play
                    </button>
                    <button className="btn btn-ghost draft-btn" disabled={busy} onClick={() => deleteDraft(id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="session-games-card session-history-card">
          <h3>Games Played ({pastGames.length})</h3>
          {pastGames.length === 0 ? (
            <p className="muted">No games yet — start one below!</p>
          ) : (
            <div className="session-games-list">
              {pastGames.map(({ pin, endedAt, questionCount, winnerName, winnerScore, playerCount, kind, gameType }) => (
                <a
                  key={pin}
                  className="session-game-row"
                  href={`/results?pin=${pin}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="sgr-left">
                    <span className={`sgr-kind${kind === 'activity' ? ' sgr-kind-activity' : ''}`}>
                      {kind === 'activity'
                        ? (gameType === 'poll' ? '📊 Poll' : '☁️ Word Cloud')
                        : '🧠 Quiz'}
                    </span>
                    <span className="sgr-date">{endedAt ? new Date(endedAt).toLocaleDateString() : '—'}</span>
                    <span className="sgr-pin">PIN {pin}</span>
                  </div>
                  <div className="sgr-right">
                    {kind === 'activity'
                      ? `${questionCount}q · ${playerCount || 0} took part`
                      : `${questionCount}q · ${playerCount || 0}p · 🏆 ${winnerName || '—'} (${winnerScore || 0})`}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="session-host-footer">
        <button
          className="btn btn-primary btn-large"
          disabled={!!session.currentGamePin}
          title={session.currentGamePin ? 'Finish or cancel the current game first' : undefined}
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
