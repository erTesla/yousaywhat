import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, set } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { generateSessionCode, hashPassword, MIN_PASSWORD_LEN } from '../utils/session';
import { generateSecret } from '../utils/game';

export default function SessionCreate() {
  const navigate = useNavigate();
  const user     = useAuth();
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Session name is required'); return; }
    if (password.trim().length < MIN_PASSWORD_LEN) {
      setError(`Host password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }
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
        teamMode:      false,
        currentGamePin: null,
      });
      // Stored under sessionAuth/, which no client can read. The rules compare
      // against it so a host on another device can prove the password without
      // the hash ever being exposed.
      await set(ref(db, `sessionAuth/${code}/passwordHash`), await hashPassword(code, password.trim()));
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
          <input
            className="text-input"
            type="password"
            placeholder={`Host password (min ${MIN_PASSWORD_LEN} chars)`}
            value={password}
            onChange={e => setPassword(e.target.value)}
            maxLength={64}
          />
          <p className="muted field-hint">
            You'll need this to get back in as host from another device or after signing out.
            Write it down — it can't be recovered.
          </p>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create Session →'}
          </button>
        </form>
      </div>
    </div>
  );
}
