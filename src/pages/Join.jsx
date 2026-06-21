import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';

export default function Join() {
  const [params]  = useSearchParams();
  const pin       = params.get('pin');
  const navigate  = useNavigate();
  const user      = useAuth();

  const [name, setName]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!pin) navigate('/'); }, [pin, navigate]);

  async function handleJoin(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed)          { setError('Enter a nickname'); return; }
    if (trimmed.length > 20) { setError('Max 20 characters'); return; }
    if (!user) return;

    setLoading(true);
    setError('');
    try {
      const statusSnap = await get(ref(db, `games/${pin}/status`));
      if (!statusSnap.exists()) { setError('Game not found'); return; }
      if (statusSnap.val() === 'ended') { setError('Game has ended'); return; }

      await set(ref(db, `games/${pin}/players/${user.uid}`), {
        name: trimmed,
        score: 0,
        lastPoints: 0,
      });
      navigate(`/play?pin=${pin}`);
    } catch {
      setError('Failed to join — try again');
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className="page page-centered"><p className="muted">Connecting…</p></div>;

  return (
    <div className="page page-centered">
      <div className="home-logo"><h1>YouSayWhat?</h1></div>

      <div className="card join-card">
        <p className="pin-label">PIN: <strong>{pin}</strong></p>
        <form onSubmit={handleJoin}>
          <input
            className="text-input"
            type="text"
            placeholder="Your nickname"
            maxLength={20}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Joining…' : "Let's Go!"}
          </button>
        </form>
      </div>
    </div>
  );
}
