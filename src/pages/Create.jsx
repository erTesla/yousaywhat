import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    key:   'poll',
    icon:  '📊',
    label: 'Poll / Vote',
    desc:  'Quick vote on options — no scoring, results shown live',
  },
  {
    key:   'mixed',
    icon:  '🎲',
    label: 'Mixed Session',
    desc:  'Combine quiz, word cloud and poll questions freely',
  },
];

export default function Create() {
  const navigate  = useNavigate();
  const user      = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(type) {
    if (!user || busy) return;
    setBusy(true);
    setError('');

    const pin    = generatePin();
    const secret = generateSecret();

    try {
      await set(ref(db, `games/${pin}`), {
        hostUid:         user.uid,
        hostSecret:      secret,
        status:          'lobby',
        currentQuestion: null,
        reveal:          null,
        chatEnabled:     true,
        gameType:        type,
        questions:       [],
      });
      // Go straight to setup with pin + secret + type pre-set
      navigate(`/create/setup?pin=${pin}&secret=${secret}&type=${type}`);
    } catch (e) {
      setError('Could not create session — check your connection');
      setBusy(false);
    }
  }

  if (!user) return <Splash>Connecting…</Splash>;

  return (
    <div className="page page-centered">
      <div className="create-picker">
        <button className="btn-back" onClick={() => navigate('/')}>← Back</button>
        <h2>What kind of session?</h2>
        <p className="muted">Pick a format — your session PIN is generated instantly.</p>

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
