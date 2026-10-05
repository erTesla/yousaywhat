import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get, set, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { isSessionCode, hashPassword } from '../utils/session';
import { generateSecret } from '../utils/game';

export default function SessionRejoin() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const user      = useAuth();

  const [code,     setCode]     = useState((params.get('code') || '').toUpperCase());
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');

  async function handleRejoin(e) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!isSessionCode(c)) { setError('Enter a session code like WOLF-4821'); return; }
    if (!password)         { setError('Enter the host password'); return; }
    if (!user)             { setError('Still connecting — try again in a moment'); return; }

    setBusy(true);
    setError('');
    try {
      const exists = await get(ref(db, `sessions/${c}/name`));
      if (!exists.exists()) { setError('No session found with that code'); setBusy(false); return; }

      // The rule only accepts this write if the hash matches the stored one,
      // so a successful write IS the password check. Nothing readable leaks.
      const proof = await hashPassword(c, password);
      try {
        await set(ref(db, `sessionAuth/${c}/claims/${user.uid}`), proof);
      } catch {
        setError('Incorrect password');
        setBusy(false);
        return;
      }

      // Claim accepted — take over as the active host on this device.
      await update(ref(db, `sessions/${c}`), { hostUid: user.uid });
      navigate(`/session/host?code=${c}&secret=${generateSecret()}`);
    } catch {
      setError('Could not rejoin — check your connection');
      setBusy(false);
    }
  }

  return (
    <div className="page page-centered">
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <button className="btn-back" onClick={() => navigate('/')}>← Back</button>
        <h2>Rejoin as Host</h2>
        <p className="muted" style={{ fontSize: '0.9rem', margin: '8px 0 16px' }}>
          Lost your host tab or switched device? Enter your session code and host password to
          take back control. Your players stay in the session.
        </p>

        <form onSubmit={handleRejoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="text-input"
            type="text"
            placeholder="Session code (e.g. WOLF-4821)"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())}
            maxLength={12}
            autoFocus
          />
          <input
            className="text-input"
            type="password"
            placeholder="Host password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            maxLength={64}
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={busy || !user}>
            {busy ? 'Verifying…' : !user ? 'Connecting…' : 'Rejoin Session →'}
          </button>
        </form>

        <p className="muted field-hint" style={{ marginTop: 14 }}>
          This makes the current device the host. Any other tab still open as host will stop
          being able to control the session.
        </p>
      </div>
    </div>
  );
}
