import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

export default function SessionJoin() {
  const [params] = useSearchParams();
  const code     = params.get('code')?.toUpperCase();
  const navigate = useNavigate();
  const user     = useAuth();

  const [name,    setName]    = useState('');
  const [session, setSession] = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!code || !user) return;
    get(ref(db, `sessions/${code}`)).then(snap => {
      if (!snap.exists()) { setError('Session not found'); return; }
      const s = snap.val();
      setSession(s);
      if (s.players?.[user.uid]?.name) {
        setName(s.players[user.uid].name);
      }
    });
  }, [code, user]);

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!user || !code) return;
    setBusy(true);
    setError('');
    try {
      const existingSnap = await get(ref(db, `sessions/${code}/players/${user.uid}`));
      const existing = existingSnap.val() || {};
      await update(ref(db, `sessions/${code}/players/${user.uid}`), {
        name:        name.trim(),
        totalScore:  existing.totalScore  ?? 0,
        gamesPlayed: existing.gamesPlayed ?? 0,
        joinedAt:    existing.joinedAt    ?? Date.now(),
      });
      navigate(`/session/play?code=${code}`);
    } catch {
      setError('Could not join — check your connection');
      setBusy(false);
    }
  }

  if (!code)  return <div className="page page-centered"><p className="error-msg">Missing session code.</p></div>;
  if (!user)  return <div className="page page-centered"><p className="muted">Connecting…</p></div>;
  if (error && !session) return <div className="page page-centered"><p className="error-msg">{error}</p></div>;

  return (
    <div className="page page-centered">
      <div className="card join-card" style={{ maxWidth: 380, width: '100%' }}>
        <h2>Join Session</h2>
        {session && <p className="muted" style={{ marginBottom: 4 }}>{session.name}</p>}
        <div className="session-code-badge" style={{ marginBottom: 16 }}>
          <strong>{code}</strong>
        </div>
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="text-input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            autoFocus
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join Session →'}
          </button>
        </form>
      </div>
    </div>
  );
}
