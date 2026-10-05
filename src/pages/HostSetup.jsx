import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, set, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { generatePin, generateSecret } from '../utils/game';

const BLANK_Q = () => ({
  text: '',
  type: 'mcq',
  choices: ['', '', '', ''],
  correct: 0,
  timeLimit: 20,
});

const BLANK_POLL = () => ({
  text: '',
  type: 'poll',
  choices: ['', '', '', ''],
  correct: null,
  timeLimit: 30,
});

const BLANK_WC = () => ({
  text: '',
  type: 'wordcloud',
  choices: [],
  correct: null,
  timeLimit: 30,
});

const SAMPLE_QUESTIONS = [
  { text: 'What is the capital of France?',         choices: ['London', 'Paris', 'Berlin', 'Madrid'],     correct: 1, timeLimit: 20 },
  { text: 'Which planet is closest to the Sun?',    choices: ['Venus', 'Mars', 'Mercury', 'Earth'],       correct: 2, timeLimit: 20 },
  { text: 'How many sides does a hexagon have?',    choices: ['5', '6', '7', '8'],                        correct: 1, timeLimit: 15 },
  { text: 'What is 12 × 12?',                       choices: ['132', '144', '124', '148'],                correct: 1, timeLimit: 15 },
  { text: 'Which ocean is the largest?',             choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3, timeLimit: 20 },
];

const LABELS = ['A', 'B', 'C', 'D'];

// ── JSON import validation ────────────────────────────────────────────────────

function parseImport(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('File is not valid JSON'); }

  if (!Array.isArray(data))  throw new Error('JSON must be an array of question objects');
  if (data.length === 0)     throw new Error('File contains no questions');

  return data.map((q, i) => {
    const n = i + 1;

    if (typeof q.text !== 'string' || !q.text.trim())
      throw new Error(`Q${n}: "text" must be a non-empty string`);

    if (!Array.isArray(q.choices) || q.choices.length !== 4)
      throw new Error(`Q${n}: "choices" must be an array of exactly 4 items`);

    if (q.choices.some(c => typeof c !== 'string' || !c.trim()))
      throw new Error(`Q${n}: every choice must be a non-empty string`);

    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3)
      throw new Error(`Q${n}: "correct" must be an integer from 0 to 3`);

    const tl = q.timeLimit != null ? Number(q.timeLimit) : 20;
    if (!Number.isFinite(tl) || tl <= 0)
      throw new Error(`Q${n}: "timeLimit" must be a positive number`);

    return {
      text:      q.text.trim(),
      choices:   q.choices.map(c => String(c).trim()),
      correct:   q.correct,
      timeLimit: tl,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HostSetup() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const user          = useAuth();
  const fileInputRef  = useRef(null);

  // When coming from Create picker, session already exists
  const existingPin    = params.get('pin');
  const existingSecret = params.get('secret');
  const gameType       = params.get('type') || 'quiz';
  const sessionCode    = params.get('sessionCode')?.toUpperCase();
  const sessionSecret  = params.get('sessionSecret');

  const defaultQ = gameType === 'wordcloud' ? BLANK_WC()
    : gameType === 'poll'    ? BLANK_POLL()
    : BLANK_Q();

  const [questions, setQuestions] = useState([defaultQ]);
  // Only relevant for one-off games; inside a session the host toggles team
  // mode on the session dashboard so it persists across games.
  const [teamMode,  setTeamMode]  = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error,     setError]     = useState('');
  const [importMsg, setImportMsg] = useState('');

  // ── Editing helpers ─────────────────────────────────────────────────────────

  function updateQ(idx, field, value) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  }

  function updateChoice(qIdx, cIdx, value) {
    setQuestions(qs => qs.map((q, i) => {
      if (i !== qIdx) return q;
      const choices = [...q.choices];
      choices[cIdx] = value;
      return { ...q, choices };
    }));
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseImport(ev.target.result);
        setQuestions(parsed);
        setImportMsg(`✓ Imported ${parsed.length} question${parsed.length !== 1 ? 's' : ''}`);
        setError('');
      } catch (err) {
        setError(err.message);
        setImportMsg('');
      }
      e.target.value = ''; // allow re-importing the same file
    };
    reader.readAsText(file);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  function handleExport() {
    const data = questions.map(q => ({
      text:      q.text,
      choices:   q.choices,
      correct:   q.correct,
      timeLimit: q.timeLimit,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'questions.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Launch validation ───────────────────────────────────────────────────────

  function validate() {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return `Q${i + 1}: question text is required`;
      if (q.type !== 'wordcloud') {
        const filled = q.choices.filter(c => c.trim()).length;
        if (q.type === 'poll') {
          if (filled < 2) return `Q${i + 1}: a poll needs at least 2 options`;
        } else {
          for (let j = 0; j < 4; j++) {
            if (!q.choices[j].trim()) return `Q${i + 1}: answer ${LABELS[j]} is empty`;
          }
        }
      }
    }
    return null;
  }

  async function handleLaunch() {
    const err = validate();
    if (err) { setError(err); return; }
    if (!user) return;

    setLaunching(true);
    setError('');

    const qs = questions.map(q => ({
      text:      q.text.trim(),
      type:      q.type || 'mcq',
      choices:   q.type === 'wordcloud' ? [] : q.choices.map(c => c.trim()),
      correct:   (q.type === 'wordcloud' || q.type === 'poll') ? null : q.correct,
      timeLimit: Number(q.timeLimit),
    }));

    try {
      if (existingPin && existingSecret) {
        // Session already created by picker — just write questions
        const gameUpdates = { questions: qs };
        if (!sessionCode) gameUpdates.teamMode = teamMode;
        await update(ref(db, `games/${existingPin}`), gameUpdates);
        // Only now is the game playable, so push session players into it
        if (sessionCode) {
          await update(ref(db, `sessions/${sessionCode}`), {
            currentGamePin: existingPin,
            status:         'playing',
          });
        }
        const sessionParams = sessionCode
          ? `&sessionCode=${sessionCode}&sessionSecret=${sessionSecret}`
          : '';
        navigate(`/host?pin=${existingPin}&secret=${existingSecret}${sessionParams}`);
      } else {
        // Legacy flow (direct /create route)
        const pin    = generatePin();
        const secret = generateSecret();
        await set(ref(db, `games/${pin}`), {
          hostUid:         user.uid,
          hostSecret:      secret,
          status:          'lobby',
          currentQuestion: null,
          reveal:          null,
          chatEnabled:     true,
          questions:       qs,
        });
        navigate(`/host?pin=${pin}&secret=${secret}`);
      }
    } catch (e) {
      setError('Failed to create game: ' + e.message);
      setLaunching(false);
    }
  }

  if (!user) return <div className="page page-centered"><p className="muted">Connecting…</p></div>;

  return (
    <div className="page setup-page">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="setup-header">
        <button className="btn-back" onClick={() => navigate('/')}>← Back</button>
        <h1>Build Your Session</h1>
        {existingPin && (
          <div className="setup-pin-tag">PIN: <strong>{existingPin}</strong></div>
        )}
        <div className="setup-header-actions">
          <button className="btn btn-ghost" onClick={() => { setQuestions(SAMPLE_QUESTIONS); setImportMsg(''); setError(''); }}>
            Samples
          </button>
          <button className="btn btn-ghost" onClick={() => fileInputRef.current.click()}>
            Import JSON
          </button>
          <button className="btn btn-ghost" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </div>

      {importMsg && <p className="import-success">{importMsg}</p>}

      <div className="questions-list">
        {questions.map((q, qi) => (
          <div key={qi} className="card question-editor">
            <div className="q-editor-header">
              <span className="q-num">Q{qi + 1}</span>
              <select
                value={q.type || 'mcq'}
                onChange={e => {
                  const t = e.target.value;
                  updateQ(qi, 'type', t);
                  if (t === 'wordcloud') { updateQ(qi, 'choices', []); updateQ(qi, 'correct', null); }
                  else {
                    if (!q.choices.length) updateQ(qi, 'choices', ['', '', '', '']);
                    if (t === 'poll') updateQ(qi, 'correct', null);
                  }
                }}
                className="time-select"
              >
                <option value="mcq">Multiple choice</option>
                <option value="poll">Poll / vote</option>
                <option value="wordcloud">Word cloud</option>
              </select>
              <select
                value={q.timeLimit}
                onChange={e => updateQ(qi, 'timeLimit', Number(e.target.value))}
                className="time-select"
              >
                {[10, 15, 20, 30, 45, 60].map(t => (
                  <option key={t} value={t}>{t}s</option>
                ))}
              </select>
              {questions.length > 1 && (
                <button
                  className="btn-remove"
                  onClick={() => setQuestions(qs => qs.filter((_, i) => i !== qi))}
                  title="Remove question"
                >✕</button>
              )}
            </div>

            <input
              className="text-input question-text-input"
              type="text"
              placeholder="Question text…"
              value={q.text}
              onChange={e => updateQ(qi, 'text', e.target.value)}
            />

            {(q.type || 'mcq') === 'wordcloud' ? (
              <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '8px 0' }}>
                ☁️ Players type a short answer — shown as a live word cloud.
              </p>
            ) : (
              <div className="choices-grid">
                {(q.choices.length ? q.choices : ['', '', '', '']).map((c, ci) => (
                  <div key={ci} className={`choice-wrap choice-color-${ci}`}>
                    {q.type === 'poll' ? (
                      // A poll has no right answer, so no correct-answer radio
                      <span className="choice-lbl choice-lbl-static">{LABELS[ci]}</span>
                    ) : (
                      <label className="correct-radio" title="Mark as correct">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          checked={q.correct === ci}
                          onChange={() => updateQ(qi, 'correct', ci)}
                        />
                        <span className="choice-lbl">{LABELS[ci]}</span>
                      </label>
                    )}
                    <input
                      className="text-input"
                      type="text"
                      placeholder={q.type === 'poll' ? `Option ${LABELS[ci]}${ci > 1 ? ' (optional)' : ''}` : `Answer ${LABELS[ci]}`}
                      value={c}
                      onChange={e => updateChoice(qi, ci, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!sessionCode && (
        <label className="setup-option">
          <input
            type="checkbox"
            checked={teamMode}
            onChange={e => setTeamMode(e.target.checked)}
          />
          <span>
            <strong>Team mode</strong>
            <span className="muted"> — players can create and join teams in the lobby</span>
          </span>
        </label>
      )}
      {sessionCode && (
        <p className="muted setup-option-note">
          Team mode for this game is controlled on the session dashboard.
        </p>
      )}

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={() => setQuestions(qs => [...qs, BLANK_Q()])}>
          + Add Question
        </button>
        <button className="btn btn-ghost" onClick={() => setQuestions(qs => [...qs, BLANK_POLL()])}>
          📊 Add Poll
        </button>
        <button className="btn btn-ghost" onClick={() => setQuestions(qs => [...qs, BLANK_WC()])}>
          ☁️ Add Word Cloud
        </button>
        {error && <p className="error-msg">{error}</p>}
        <button className="btn btn-primary btn-large" onClick={handleLaunch} disabled={launching}>
          {launching ? 'Launching…' : 'Launch Game →'}
        </button>
      </div>
    </div>
  );
}
