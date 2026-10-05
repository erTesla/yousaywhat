import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { generatePin, generateSecret } from '../utils/game';

const GAME_TYPES = [
  {
    key:   'quiz',
    icon:  '🧠',
    label: 'Quiz',
    desc:  'Multiple choice questions with scoring and a leaderboard',
  },
  {
    key:   'wordcloud',
    icon:  '☁️',
    label: 'Word Cloud',
    desc:  'Players type short answers shown as a live word cloud',
  },
  {
    key:   'mixed',
    icon:  '🎲',
    label: 'Mixed Session',
    desc:  'Combine quiz, word cloud and poll questions freely',
  },
];

export default function Create() {
  const navigate          = useNavigate();
  const [params]          = useSearchParams();
  const user              = useAuth();
  const sessionCode       = params.get('sessionCode')?.toUpperCase();
  const sessionSecret     = params.get('sessionSecret');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function pick(type) {
    if (!user || busy) return;
    setBusy(true);
    setError('');

    const pin    = generatePin();
    const secret = generateSecret();

    try {
      const gameData = {
        hostUid:         user.uid,
        hostSecret:      secret,
        status:          'lobby',
        currentQuestion: null,
        reveal:          null,
        chatEnabled:     true,
        gameType:        type,
        questions:       [],
      };
      if (sessionCode) gameData.sessionCode = sessionCode;

      await set(ref(db, `games/${pin}`), gameData);

      // The session is NOT flipped to 'playing' here — that happens in
      // HostSetup once questions exist, so abandoning setup can't strand players.
      const sessionParams = sessionCode
        ? `&sessionCode=${sessionCode}&sessionSecret=${sessionSecret}`
        : '';
      navigate(`/create/setup?pin=${pin}&secret=${secret}&type=${type}${sessionParams}`);
    } catch (e) {
      setError('Could not create session — check your connection');
      setBusy(false);
    }
  }

  if (!user) return <Splash>Connecting…</Splash>;

  return (
    <div className="page page-centered">
      <div className="create-picker">
        <button className="btn-back" onClick={() => sessionCode ? navigate(`/session/host?code=${sessionCode}&secret=${sessionSecret}`) : navigate('/')}>← Back</button>
        {sessionCode && (
          <div className="setup-pin-tag" style={{ marginBottom: 8 }}>Session: <strong>{sessionCode}</strong></div>
        )}
        <h2>What kind of game?</h2>
        <p className="muted">Pick a format — your game PIN is generated instantly.</p>

        <div className="game-type-grid">
          {GAME_TYPES.map(({ key, icon, label, desc }) => (
            <button
              key={key}
              className="game-type-card"
              onClick={() => pick(key)}
              disabled={busy}
            >
              <span className="gtc-icon">{icon}</span>
              <span className="gtc-label">{label}</span>
              <span className="gtc-desc">{desc}</span>
            </button>
          ))}
        </div>

        {error && <p className="error-msg">{error}</p>}
        {busy && <p className="muted" style={{ fontSize: '0.85rem' }}>Creating session…</p>}
      </div>
    </div>
  );
}

function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}
