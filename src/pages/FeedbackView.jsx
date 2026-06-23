import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../firebase';

export default function FeedbackView() {
  const [searchParams] = useSearchParams();
  const code       = (searchParams.get('code') || '').toUpperCase();
  const pinFromUrl = searchParams.get('pin') || '';

  const [pinVerified,  setPinVerified]  = useState(false);
  const [autoChecking, setAutoChecking] = useState(!!pinFromUrl);
  const [pinInput,     setPinInput]     = useState('');
  const [pinError,     setPinError]     = useState('');
  const [pinChecking,  setPinChecking]  = useState(false);
  const [entries,      setEntries]      = useState([]);
  const navigate = useNavigate();

  // When PIN came from hub via URL param, verify it automatically
  useEffect(() => {
    if (!code)       { navigate('/feedback'); return; }
    if (!pinFromUrl) return;
    get(ref(db, `feedbackSessions/${code}/pin`))
      .then(snap => {
        if (snap.exists() && snap.val() === pinFromUrl) setPinVerified(true);
      })
      .catch(() => {})
      .finally(() => setAutoChecking(false));
  }, [code, pinFromUrl, navigate]);

  // Subscribe to entries once PIN is verified
  useEffect(() => {
    if (!pinVerified) return;
    const unsub = onValue(ref(db, `feedbackSessions/${code}/entries`), snap => {
      if (!snap.exists()) { setEntries([]); return; }
      const list = Object.entries(snap.val()).map(([id, val]) => ({ id, ...val }));
      list.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(list);
    });
    return () => unsub();
  }, [code, pinVerified]);

  async function handlePinSubmit(e) {
    e.preventDefault();
    const pin = pinInput.trim();
    if (!pin) { setPinError('Enter the security PIN'); return; }
    setPinChecking(true);
    setPinError('');
    try {
      const snap = await get(ref(db, `feedbackSessions/${code}/pin`));
      if (!snap.exists())     { setPinError('Session not found'); return; }
      if (snap.val() !== pin) { setPinError('Incorrect PIN'); return; }
      setPinVerified(true);
    } catch {
      setPinError('Connection error');
    } finally {
      setPinChecking(false);
    }
  }

  if (autoChecking) {
    return (
      <div className="page page-centered">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="page page-centered">
        <div className="home-logo">
          <h1>View Feedback</h1>
          <p className="tagline">
            Session: <span className="feedback-code-highlight">{code}</span>
          </p>
        </div>
        <form className="card feedback-card" onSubmit={handlePinSubmit}>
          <div className="feedback-field">
            <label className="feedback-label">Security PIN</label>
            <input
              className="text-input"
              type="password"
              maxLength={20}
              placeholder="Enter your PIN"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              autoFocus
            />
          </div>
          {pinError && <p className="error-msg">{pinError}</p>}
          <button className="btn btn-primary" type="submit" disabled={pinChecking}>
            {pinChecking ? 'Verifying…' : 'View Results'}
          </button>
        </form>
        <button className="btn btn-back" onClick={() => navigate('/feedback')}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="page feedback-view-page">
      <div className="feedback-view-header">
        <div>
          <h2>Feedback Results</h2>
          <span className="feedback-session-badge">{code}</span>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>Home</button>
      </div>

      <p className="feedback-count muted">
        {entries.length} response{entries.length !== 1 ? 's' : ''}
      </p>

      {entries.length === 0 ? (
        <div className="feedback-empty">
          <p className="muted">No feedback submitted yet.</p>
        </div>
      ) : (
        <div className="feedback-list">
          {entries.map((entry, i) => (
            <div key={entry.id} className="feedback-entry-card">
              <div className="feedback-entry-header">
                <span className="feedback-entry-num">#{entries.length - i}</span>
                <span className="feedback-entry-time">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="feedback-entry-text">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
