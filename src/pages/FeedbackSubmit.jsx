import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, push, get } from 'firebase/database';
import { db } from '../firebase';

export default function FeedbackSubmit() {
  const [searchParams] = useSearchParams();
  const urlCode = (searchParams.get('code') || '').toUpperCase();

  const [code,     setCode]     = useState(urlCode);
  const [text,     setText]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  // Start verified if code came from hub (which already checked it); async check confirms
  const [verified, setVerified] = useState(!!urlCode);
  const [done,     setDone]     = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!urlCode) return;
    get(ref(db, `feedbackSessions/${urlCode}/createdAt`)).then(snap => {
      if (snap.exists()) setVerified(true);
      else { setVerified(false); setError('Session not found'); }
    }).catch(() => { setVerified(false); setError('Connection error'); });
  }, [urlCode]);

  async function handleCodeCheck(e) {
    e.preventDefault();
    const trimCode = code.trim().toUpperCase();
    if (!trimCode) { setError('Enter a session code'); return; }
    setLoading(true);
    setError('');
    try {
      const snap = await get(ref(db, `feedbackSessions/${trimCode}/createdAt`));
      if (!snap.exists()) { setError('Session not found'); return; }
      setCode(trimCode);
      setVerified(true);
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimText = text.trim();
    if (!trimText) { setError('Please enter your feedback'); return; }
    setLoading(true);
    setError('');
    try {
      await push(ref(db, `feedbackSessions/${code}/entries`), {
        text:      trimText,
        timestamp: Date.now(),
      });
      setDone(true);
    } catch {
      setError('Connection error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="page page-centered">
        <div className="feedback-success-icon">✓</div>
        <h2>Feedback Sent!</h2>
        <p className="muted">Thank you for your response.</p>
        <button
          className="btn btn-primary"
          onClick={() => { setText(''); setError(''); setDone(false); }}
        >
          Submit Another
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="page page-centered">
        <div className="home-logo">
          <h1>Give Feedback</h1>
          <p className="tagline">Enter the session code</p>
        </div>
        <form className="card feedback-card" onSubmit={handleCodeCheck}>
          <input
            className="text-input feedback-code-input"
            type="text"
            maxLength={12}
            placeholder="Session code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
            autoFocus
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
        <button className="btn btn-back" onClick={() => navigate('/feedback')}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="page page-centered">
      <div className="home-logo">
        <h1>Give Feedback</h1>
        <p className="tagline">
          Session: <span className="feedback-code-highlight">{code}</span>
        </p>
      </div>

      <form className="card feedback-card" onSubmit={handleSubmit}>
        <div className="feedback-field">
          <label className="feedback-label">Your Feedback</label>
          <textarea
            className="text-input feedback-textarea"
            placeholder="Write your feedback here…"
            maxLength={500}
            rows={5}
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
          <p className="feedback-hint feedback-char-count">{text.length} / 500</p>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send Feedback'}
        </button>
      </form>

      <button className="btn btn-back" onClick={() => navigate('/feedback')}>
        ← Back
      </button>
    </div>
  );
}
