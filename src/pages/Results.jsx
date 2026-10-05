import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import Splash from '../components/Splash';
import ScoreRow from '../components/ScoreRow';
import { pollBars, wordFrequency } from '../utils/poll';
import { MEDALS, CHOICE_LABELS } from '../utils/display';
import { useAuth } from '../hooks/useAuth';

// Bar fills for the per-question breakdown. Distinct from WordCloud's hex
// palette, which serves a different purpose despite the similar name.
const BAR_COLORS = ['var(--red)', 'var(--blue)', 'var(--yellow)', 'var(--green)'];

export default function Results() {
  const [params]   = useSearchParams();
  const pin        = params.get('pin');
  const secret     = params.get('secret');
  const navigate   = useNavigate();
  const user       = useAuth();

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [isHost,   setIsHost]   = useState(false);
  const [results,  setResults]  = useState(null);   // { players, summary, endedAt, questionCount }
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    if (!pin || !user) return;

    async function load() {
      try {
        // Check if host
        const hostSnap = await get(ref(db, `games/${pin}/hostUid`));
        const hostUid  = hostSnap.val();
        const host     = user.uid === hostUid;
        setIsHost(host);

        // Load results (readable by all — see DB rules)
        const resSnap = await get(ref(db, `games/${pin}/results`));
        if (!resSnap.exists()) { setError('No results found for this session.'); setLoading(false); return; }
        setResults(resSnap.val());

        // Host also loads questions for breakdown labels
        if (host && secret) {
          const qSnap = await get(ref(db, `games/${pin}/questions`));
          if (qSnap.exists()) setQuestions(qSnap.val());
        }
      } catch {
        setError('Could not load results.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pin, user, secret]);

  if (!pin) return <Splash>Invalid results URL.</Splash>;
  if (!user || loading) return <Splash>Loading results…</Splash>;
  if (error) return <Splash>{error}</Splash>;
  if (!results) return <Splash>No results yet.</Splash>;

  const playerList = Object.entries(results.players || {})
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

  const myEntry = playerList.find(([uid]) => uid === user.uid);
  const myRank  = myEntry ? playerList.indexOf(myEntry) + 1 : null;

  return (
    <div className="page results-page">
      <div className="results-header">
        <button className="btn-back" onClick={() => navigate('/')}>← Home</button>
        <div>
          <h2>📊 Session Results</h2>
          <span className="feedback-session-badge">{pin}</span>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {new Date(results.endedAt).toLocaleString()}
        </p>
      </div>

      {/* My result banner (player view) */}
      {myEntry && !isHost && (
        <div className="my-result-banner">
          <span className="mrb-rank">{myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`}</span>
          <div>
            <div className="mrb-name">{myEntry[1].name}</div>
            <div className="mrb-score">{myEntry[1].score?.toLocaleString() || 0} pts</div>
          </div>
        </div>
      )}

      {/* Final leaderboard */}
      <section className="results-section">
        <h3>Final Standings</h3>
        <div className="scoreboard">
          {playerList.map(([uid, p], i) => (
            <ScoreRow
              key={uid}
              index={i}
              name={p.name}
              points={p.score}
              meta={p.teamCode || null}
              highlight={uid === user.uid}
              delayMs={60}
            />
          ))}
        </div>
      </section>

      {/* Per-question breakdown — host only (has questions data) */}
      {isHost && questions.length > 0 && results.summary && (
        <section className="results-section">
          <h3>Question Breakdown</h3>
          {questions.map((q, idx) => {
            const s = results.summary[idx];
            if (!s) return (
              <div key={idx} className="qb-card">
                <div className="qb-header">
                  <span className="qb-num">Q{idx + 1}</span>
                  <span className="qb-text">{q.text}</span>
                  <span className="qb-badge">no responses</span>
                </div>
              </div>
            );

            // Word cloud / poll: show the actual responses for THIS question
            if ((s.type || q.type) === 'wordcloud') {
              const ranked = wordFrequency(s.words, { limit: 200 });
              return (
                <div key={idx} className="qb-card">
                  <div className="qb-header">
                    <span className="qb-num">Q{idx + 1}</span>
                    <span className="qb-text">{q.text}</span>
                    <span className="qb-badge wc">☁️ Word Cloud</span>
                  </div>
                  <p className="qb-meta">{s.responseCount || 0} response{s.responseCount !== 1 ? 's' : ''}</p>
                  {ranked.length === 0 ? (
                    <p className="muted" style={{ fontSize: '0.85rem' }}>No responses.</p>
                  ) : (
                    <div className="qb-words">
                      {ranked.map(({ word, count }) => (
                        <span key={word} className="qb-word">
                          {word}{count > 1 && <span className="qb-word-n">×{count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={idx} className="qb-card">
                <div className="qb-header">
                  <span className="qb-num">Q{idx + 1}</span>
                  <span className="qb-text">{q.text}</span>
                </div>
                <p className="qb-meta">{s.responseCount || 0} response{s.responseCount !== 1 ? 's' : ''}</p>
                <div className="qb-bars">
                  {pollBars(q.choices, CHOICE_LABELS.map((_, ci) => s.choiceCounts?.[ci] || 0))
                    .map(({ count, pct }, ci) => {
                      const correct = ci === s.correct;
                      return (
                        <div key={ci} className="qb-bar-row">
                          <span className={`qb-label${correct ? ' qb-correct' : ''}`}>
                            {CHOICE_LABELS[ci]}{correct ? ' ✓' : ''}
                          </span>
                          <div className="qb-bar-track">
                            <div
                              className="qb-bar-fill"
                              style={{ width: `${pct}%`, background: correct ? 'var(--green)' : BAR_COLORS[ci] }}
                            />
                          </div>
                          <span className="qb-pct">{pct}%</span>
                          <span className="qb-count">({count})</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Player count summary */}
      <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem', paddingBottom: 32 }}>
        {playerList.length} player{playerList.length !== 1 ? 's' : ''} · {results.questionCount} question{results.questionCount !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
