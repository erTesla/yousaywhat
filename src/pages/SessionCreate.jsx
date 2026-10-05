import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, set } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { generateSessionCode } from '../utils/session';
import { generateSecret } from '../utils/game';

export default function SessionCreate() {
  const navigate = useNavigate();
  const user     = useAuth();
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Session name is required'); return; }
    if (!user) return;
    setBusy(true);
    setError('');

    const secret = generateSecret();

    try {
      // Codes are random, so retry on the rare collision rather than letting the
      // rule deny the overwrite and surfacing it as a connection error.
      let code = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSessionCode();
        const taken = await get(ref(db, `sessions/${candidate}/hostUid`));
        if (!taken.exists()) { code = candidate; break; }
      }
      if (!code) {
        setError('Could not allocate a session code — please try again');
        setBusy(false);
        return;
      }

      // hostSecret is deliberately NOT stored: the session node is readable by
      // any authed user, and authorization is by hostUid anyway. The secret in
      // the URL is just an opaque bookmark token.
      await set(ref(db, `sessions/${code}`), {
        hostUid:       user.uid,
        name:          name.trim(),
        createdAt:     Date.now(),
        status:        'idle',
        currentGamePin: null,
      });
      navigate(`/session/host?code=${code}&secret=${secret}`);
    } catch {
      setError('Could not create session — check your connection');
      setBusy(false);
    }
  }

  if (!user) return <div className="page page-centered"><p className="muted">Connecting…</p></div>;

  return (
    <div className="page page-centered">
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <button className="btn-back" onClick={() => navigate('/')}>← Back</button>
        <h2>Create a Session</h2>
        <p className="muted" style={{ fontSize: '0.9rem', margin: '8px 0 16px' }}>
          Players join once with a memorable code and stay in for all your games — no re-entering PIN each round.
        </p>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="text-input"
            type="text"
            placeholder="Session name (e.g. Weekly Quiz Night)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create Session →'}
          </button>
        </form>
      </div>
    </div>
  );
}
