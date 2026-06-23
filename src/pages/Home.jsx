import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';

export default function Home() {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleJoin(e) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!/^\d{6}$/.test(trimmed)) { setError('PIN must be 6 digits'); return; }

    setLoading(true);
    setError('');
    try {
      const snap = await get(ref(db, `games/${trimmed}/status`));
      if (!snap.exists())              setError('Game not found');
      else if (snap.val() === 'ended') setError('This game has already ended');
      else                             navigate(`/join?pin=${trimmed}`);
    } catch {
      setError('Connection error — check your internet');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-centered">
      <div className="home-logo">
        <h1>YouSayWhat?</h1>
        <p className="tagline">The live quiz game</p>
      </div>

      <form className="card join-card" onSubmit={handleJoin}>
        <input
          className="pin-input"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="Game PIN"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        {error && <p className="error-msg">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Checking…' : 'Join Game'}
        </button>
      </form>

      <div className="home-divider">or</div>
      <button className="btn btn-ghost" onClick={() => navigate('/create')}>
        + Create a game
      </button>

      <div className="home-divider">or</div>
      <button className="btn btn-feedback" onClick={() => navigate('/feedback')}>
        Give Feedback
      </button>
    </div>
  );
}
