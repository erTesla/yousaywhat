import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import { db } from '../firebase';

export default function FeedbackCreate() {
  const [code,      setCode]      = useState('');
  const [pin,       setPin]       = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [created,   setCreated]   = useState(false);
  const [savedCode, setSavedCode] = useState('');
  const [savedPin,  setSavedPin]  = useState('');
  const navigate = useNavigate();

  async function handleCreate(e) {
    e.preventDefault();
    setError('');

    const trimCode = code.trim().toUpperCase();
    const trimPin  = pin.trim();

    if (!/^[A-Z0-9]{3,12}$/.test(trimCode)) {
      setError('Session code must be 3–12 letters or numbers');
      return;
    }
    if (trimPin.length < 3) {
      setError('Security PIN must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const existing = await get(ref(db, `feedbackSessions/${trimCode}/createdAt`));
      if (existing.exists()) {
        setError('That code is already taken — choose another');
        return;
      }
      await set(ref(db, `feedbackSessions/${trimCode}`), {
        pin:       trimPin,
        createdAt: Date.now(),
      });
      setSavedCode(trimCode);
      setSavedPin(trimPin);
      setCreated(true);
    } catch {
      setError('Connection error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="page page-centered">
        <div className="feedback-success-icon">✓</div>
        <h2>Session Created!</h2>
        <p className="muted">Share this code with participants:</p>
        <div className="feedback-share-code">{savedCode}</div>
        <p className="muted feedback-pin-reminder">
          Your security PIN: <strong>{savedPin}</strong>
          <br />
          Keep it private — you need it to view feedback.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/feedback-submit?code=${savedCode}`)}
        >
          Submit First Feedback
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/feedback')}>
          Back to Hub
        </button>
      </div>
    );
  }

  return (
    <div className="page page-centered">
      <div className="home-logo">
        <h1>New Session</h1>
        <p className="tagline">Set up your feedback session</p>
      </div>

      <form className="card feedback-card" onSubmit={handleCreate}>
        <div className="feedback-field">
          <label className="feedback-label">Session Code</label>
          <input
            className="text-input feedback-code-input"
            type="text"
            maxLength={12}
            placeholder="e.g. TEAM2024"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
            autoFocus
          />
          <p className="feedback-hint">3–12 letters or numbers — share this with participants</p>
        </div>

        <div className="feedback-field">
          <label className="feedback-label">Security PIN</label>
          <input
            className="text-input"
            type="password"
            maxLength={20}
            placeholder="Your private PIN to view results"
            value={pin}
            onChange={e => setPin(e.target.value)}
          />
          <p className="feedback-hint">Only you need this — used to view submitted feedback</p>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create Session'}
        </button>
      </form>

      <button className="btn btn-back" onClick={() => navigate('/feedback')}>
        ← Back
      </button>
    </div>
  );
}
