import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';

export default function FeedbackHub() {
  const [submitCode, setSubmitCode] = useState('');
  const [viewCode,   setViewCode]   = useState('');
  const [viewPin,    setViewPin]    = useState('');
  const [submitErr,  setSubmitErr]  = useState('');
  const [viewErr,    setViewErr]    = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [viewBusy,   setViewBusy]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmitJoin(e) {
    e.preventDefault();
    const code = submitCode.trim().toUpperCase();
    if (!code) { setSubmitErr('Enter a session code'); return; }
    setSubmitBusy(true);
    setSubmitErr('');
    try {
      const snap = await get(ref(db, `feedbackSessions/${code}/createdAt`));
      if (!snap.exists()) { setSubmitErr('Session not found'); return; }
      navigate(`/feedback-submit?code=${code}`);
    } catch {
      setSubmitErr('Connection error');
    } finally {
      setSubmitBusy(false);
    }
  }

  async function handleViewJoin(e) {
    e.preventDefault();
    const code = viewCode.trim().toUpperCase();
    const pin  = viewPin.trim();
    if (!code) { setViewErr('Enter a session code'); return; }
    if (!pin)  { setViewErr('Enter the security PIN'); return; }
    setViewBusy(true);
    setViewErr('');
    try {
      const snap = await get(ref(db, `feedbackSessions/${code}/pin`));
      if (!snap.exists())     { setViewErr('Session not found'); return; }
      if (snap.val() !== pin) { setViewErr('Incorrect PIN'); return; }
      // Pass verification flag via router state (not URL — keeps PIN out of history)
      navigate(`/feedback-view?code=${code}`, { state: { pinVerified: true } });
    } catch {
      setViewErr('Connection error');
    } finally {
      setViewBusy(false);
    }
  }

  return (
    <div className="page page-centered">
      <div className="home-logo">
        <h1>Feedback</h1>
        <p className="tagline">Collect real-time responses</p>
      </div>

      <button
        className="btn btn-primary btn-large"
        onClick={() => navigate('/feedback-create')}
      >
        + Create Feedback Session
      </button>

      <div className="home-divider">give feedback</div>

      <form className="card feedback-card" onSubmit={handleSubmitJoin}>
        <p className="feedback-section-title">Have a session code?</p>
        <input
          className="text-input feedback-code-input"
          type="text"
          maxLength={12}
          placeholder="Session code"
          value={submitCode}
          onChange={e => {
            setSubmitCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''));
            setSubmitErr('');
          }}
        />
        {submitErr && <p className="error-msg">{submitErr}</p>}
        <button className="btn btn-primary" type="submit" disabled={submitBusy}>
          {submitBusy ? 'Checking…' : 'Give Feedback'}
        </button>
      </form>

      <div className="home-divider">or view results</div>

      <form className="card feedback-card" onSubmit={handleViewJoin}>
        <p className="feedback-section-title">View session feedback</p>
        <input
          className="text-input feedback-code-input"
          type="text"
          maxLength={12}
          placeholder="Session code"
          value={viewCode}
          onChange={e => {
            setViewCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''));
            setViewErr('');
          }}
        />
        <input
          className="text-input"
          type="password"
          maxLength={20}
          placeholder="Security PIN"
          value={viewPin}
          onChange={e => {
            setViewPin(e.target.value);
            setViewErr('');
          }}
        />
        {viewErr && <p className="error-msg">{viewErr}</p>}
        <button className="btn btn-ghost" type="submit" disabled={viewBusy}>
          {viewBusy ? 'Verifying…' : 'View Results'}
        </button>
      </form>

      <button className="btn btn-back" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
    </div>
  );
}
