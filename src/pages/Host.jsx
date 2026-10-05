import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ref, get, set, update, remove, push, onValue, onChildAdded,
} from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { calcPoints } from '../utils/game';
import Timer from '../components/Timer';
import Podium from '../components/Podium';
import Chat from '../components/Chat';
import Reactions from '../components/Reactions';
import TeamLeaderboard from '../components/TeamLeaderboard';
import WordCloud from '../components/WordCloud';
import Splash from '../components/Splash';
import { tallyChoices, pollBars, wordFrequency } from '../utils/poll';

// Word cloud and poll are activities, not scored games: participation is
// tracked but no points are awarded and they never affect ranking.
const ACTIVITY_TYPES = ['wordcloud', 'poll'];
const isActivityQuestion = q => ACTIVITY_TYPES.includes(q?.type);

export default function Host() {
  const [params]  = useSearchParams();
  const pin           = params.get('pin');
  const secret        = params.get('secret');
  const sessionCode   = params.get('sessionCode');
  const sessionSecret = params.get('sessionSecret');
  const navigate  = useNavigate();
  const user      = useAuth();

  const [verified, setVerified]       = useState(null); // null=checking | true | false
  const [verifyErr, setVerifyErr]     = useState(false);
  const [game, setGame]               = useState(null);
  const [tamperAlerts, setTamperAlerts] = useState([]);
  const [timerDone, setTimerDone]     = useState(false);
  const [busy, setBusy]               = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [teams,       setTeams]       = useState({});
  const [confirmEnd,  setConfirmEnd]  = useState(false);

  // ── Verify host identity ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !pin || !secret) return;

    get(ref(db, `games/${pin}/hostUid`))
      .then(snap => {
        if (!snap.exists()) { navigate('/'); return; }

        if (snap.val() === user.uid) {
          setVerified(true);
        } else {
          // Log tamper attempt (best-effort)
          push(ref(db, `games/${pin}/tamperLog`), {
            uid:       user.uid,
            timestamp: Date.now(),
            userAgent: navigator.userAgent.slice(0, 200),
          }).catch(() => {});
          setVerified(false);
        }
      })
      .catch(() => setVerifyErr(true));
  }, [user, pin, secret, navigate]);

  // ── Game state listeners ────────────────────────────────────────────────────
  // Deliberately NOT one listener on `games/${pin}`. That node also holds chat,
  // reactions, tamperLog, results and history, so every chat message and every
  // incoming answer re-delivered the entire game object - questions array and
  // all - and re-rendered this whole screen. Subscribe only to what is drawn.
  // Chat and Reactions have their own listeners; tamperLog uses onChildAdded.
  useEffect(() => {
    if (!verified || !pin) return;

    const base = `games/${pin}`;
    // `history` is not rendered, but endGame() reads it to build results/summary.
    // Leaving it out silently produced an empty per-question breakdown.
    const fields = ['status', 'currentQuestion', 'reveal', 'players', 'answers',
                    'questions', 'gameType', 'kind', 'chatEnabled', 'history'];

    const unsubs = fields.map(field =>
      onValue(ref(db, `${base}/${field}`), snap => {
        setGame(prev => ({ ...(prev || {}), [field]: snap.val() }));
      }),
    );

    // Teams come from the session in a session game so they persist between
    // rounds; only a one-off game keeps them on the game node.
    if (!sessionCode) {
      unsubs.push(onValue(ref(db, `${base}/teams`), snap => setTeams(snap.val() || {})));
    }

    return () => unsubs.forEach(u => u());
  }, [verified, pin, sessionCode]);

  // Session games keep teams on the session so they persist between rounds
  useEffect(() => {
    if (!verified || !sessionCode) return;
    const unsub = onValue(ref(db, `sessions/${sessionCode}/teams`), snap => setTeams(snap.val() || {}));
    return unsub;
  }, [verified, sessionCode]);

  // ── Tamper log listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!verified || !pin) return;

    const unsub = onChildAdded(ref(db, `games/${pin}/tamperLog`), snap => {
      setTamperAlerts(prev => {
        if (prev.some(a => a.id === snap.key)) return prev; // dedupe on reconnect
        return [...prev, { id: snap.key, ...snap.val() }];
      });
    });
    return unsub;
  }, [verified, pin]);

  // ── Reset timer flag when question changes ──────────────────────────────────
  const currentIdx = game?.currentQuestion?.index ?? -1;
  useEffect(() => { setTimerDone(false); }, [currentIdx]);

  const handleTimerExpired = useCallback(() => setTimerDone(true), []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const pushQuestion = useCallback(async (idx) => {
    if (!game) return;
    const q = game.questions[idx];
    setBusy(true);
    try {
      await Promise.all([
        remove(ref(db, `games/${pin}/answers`)),
        set(ref(db, `games/${pin}/reveal`), null),
      ]);
      await update(ref(db, `games/${pin}`), {
        status: 'question',
        currentQuestion: {
          index:     idx,
          text:      q.text,
          type:      q.type || 'mcq',
          choices:   q.choices || [],
          timeLimit: q.timeLimit,
          startedAt: Date.now(),
        },
      });
    } finally {
      setBusy(false);
    }
  }, [game, pin]);

  async function startGame() {
    await pushQuestion(0);
  }

  // Snapshot a question's responses before the next question clears `answers`.
  // Without this, every question in the results breakdown showed the same
  // distribution — whatever happened to be in `answers` at the end.
  function questionHistory(q) {
    const entry = { type: q.type || 'mcq', text: q.text, correct: q.correct ?? null };
    if (q.type === 'wordcloud') {
      entry.words = Object.values(answers).map(a => a.text).filter(Boolean).slice(0, 200);
    } else {
      entry.choiceCounts = { ...tallyChoices(answers) };
      entry.choices      = q.choices || [];
    }
    entry.responseCount = Object.keys(answers).length;
    return entry;
  }

  async function revealAnswer() {
    if (!game) return;
    const q = game.questions[currentIdx];
    setBusy(true);

    const isActivity = isActivityQuestion(q);
    const updates = { status: 'reveal', 'reveal/index': currentIdx, 'reveal/correct': q.correct };

    updates[`history/${currentIdx}`] = questionHistory(q);

    for (const [uid, ans] of Object.entries(answers)) {
      // Activities award nothing — ranking is driven only by quiz questions.
      const earned = isActivity
        ? 0
        : (ans.choice === q.correct ? calcPoints(ans.elapsed, q.timeLimit) : 0);

      if (earned > 0) {
        updates[`players/${uid}/score`] = (players[uid]?.score || 0) + earned;
      }
      updates[`players/${uid}/lastPoints`] = earned;
    }

    try {
      await update(ref(db, `games/${pin}`), updates);
    } finally {
      setBusy(false);
    }
  }

  // Activities (word cloud, poll) are a single live prompt, not a scored round:
  // no reveal, no scoreboard. Snapshot onto the session so the dashboard shows it.
  function activitySnapshot() {
    const prompt = game.currentQuestion?.text || game.questions?.[0]?.text || '';
    const type   = game.gameType === 'poll' ? 'poll' : 'wordcloud';

    if (type === 'poll') {
      const choices = game.currentQuestion?.choices || game.questions?.[0]?.choices || [];
      const counts  = tallyChoices(answers);
      const options = choices.filter(Boolean).map((label, i) => ({ label, count: counts[i] }));
      return { type, prompt, options, responseCount: Object.keys(answers).length, savedAt: Date.now() };
    }

    const words = Object.values(answers).map(a => a.text).filter(Boolean);
    return {
      type,
      prompt,
      words: wordFrequency(words, { limit: 60 }),
      responseCount: words.length,
      savedAt: Date.now(),
    };
  }

  async function saveActivity(thenExit) {
    if (!sessionCode) return;
    setBusy(true);
    try {
      await set(ref(db, `sessions/${sessionCode}/activities/${pin}`), { ...activitySnapshot(), live: !thenExit });
      if (thenExit) navigate(`/session/host?code=${sessionCode}&secret=${sessionSecret}`);
    } finally {
      setBusy(false);
    }
  }

  async function endActivity() {
    setBusy(true);
    try {
      const snap = activitySnapshot();
      const endedAt = Date.now();
      const histEntry = snap.type === 'poll'
        ? {
            type: 'poll',
            text: snap.prompt,
            choices: (game.currentQuestion?.choices || []).filter(Boolean),
            choiceCounts: { ...tallyChoices(answers) },
            responseCount: snap.responseCount,
          }
        : {
            type: 'wordcloud',
            text: snap.prompt,
            words: Object.values(answers).map(a => a.text).filter(Boolean).slice(0, 200),
            responseCount: snap.responseCount,
          };

      await update(ref(db, `games/${pin}`), {
        status: 'ended',
        'results/endedAt': endedAt,
        'results/questionCount': 1,
        [`history/0`]: histEntry,
      });

      if (sessionCode) {
        const prevSnap    = await get(ref(db, `sessions/${sessionCode}/players`));
        const prevPlayers = prevSnap.val() || {};
        const upd = {
          currentGamePin: null,
          status: 'between',
          [`activities/${pin}`]:          { ...snap, live: false },
          [`games/${pin}/endedAt`]:       endedAt,
          [`games/${pin}/questionCount`]: 1,
          [`games/${pin}/playerCount`]:   Object.keys(players).length,
          [`games/${pin}/kind`]:          'activity',
          [`games/${pin}/gameType`]:      game.gameType || 'wordcloud',
        };
        for (const [uid, p] of Object.entries(players)) {
          const prev = prevPlayers[uid] || {};
          upd[`players/${uid}/name`] = p.name;
          upd[`players/${uid}/activitiesJoined`] = (prev.activitiesJoined || 0) + 1;
        }
        await update(ref(db, `sessions/${sessionCode}`), upd);
      }
    } finally {
      setBusy(false);
    }
  }

  // Activity question inside a scored game: record its responses, then advance.
  // There is no correct answer, so the reveal step is skipped entirely.
  async function finishActivityQuestion() {
    const q = game.questions[currentIdx];
    setBusy(true);
    try {
      await update(ref(db, `games/${pin}`), { [`history/${currentIdx}`]: questionHistory(q) });
    } finally {
      setBusy(false);
    }
    if (isLastQ) await endGame();
    else         await nextQuestion();
  }

  async function showScoreboard() {
    await update(ref(db, `games/${pin}`), { status: 'scoreboard' });
  }

  async function nextQuestion() {
    await pushQuestion(currentIdx + 1);
  }

  async function endGame() {
    setBusy(true);
    try {
      // Per-question responses were captured at each reveal - or, for an
      // activity question, by finishActivityQuestion(), which has no reveal
      // step. Either way use that history rather than the live `answers` node,
      // which only ever holds the most recent question.
      const qs = game.questions || [];
      const summary = game.history || {};

      const playerHistory = {};
      Object.entries(players).forEach(([uid, p]) => {
        playerHistory[uid] = { name: p.name, score: p.score || 0, teamCode: p.teamCode || null };
      });

      const endedAt = Date.now();
      await update(ref(db, `games/${pin}`), {
        status: 'ended',
        'results/players': playerHistory,
        'results/summary': summary,
        'results/endedAt': endedAt,
        'results/questionCount': qs.length,
      });

      // Update session state and cumulative scores in ONE atomic write, so the
      // host closing the tab mid-tally can't leave some players credited and
      // others silently skipped.
      if (sessionCode) {
        const topPlayer = Object.entries(playerHistory).sort((a, b) => (b[1].score || 0) - (a[1].score || 0))[0];
        const prevSnap    = await get(ref(db, `sessions/${sessionCode}/players`));
        const prevPlayers = prevSnap.val() || {};

        const isActivityGame = game.kind === 'activity';
        const sessionUpdates = {
          currentGamePin: null,
          status: 'between',
          [`games/${pin}/endedAt`]:       endedAt,
          [`games/${pin}/questionCount`]: qs.length,
          [`games/${pin}/playerCount`]:   Object.keys(playerHistory).length,
          [`games/${pin}/kind`]:          isActivityGame ? 'activity' : 'quiz',
          [`games/${pin}/gameType`]:      game.gameType || 'quiz',
        };
        if (!isActivityGame) {
          sessionUpdates[`games/${pin}/winnerName`]  = topPlayer?.[1]?.name  || '';
          sessionUpdates[`games/${pin}/winnerScore`] = topPlayer?.[1]?.score || 0;
        }

        for (const [uid, p] of Object.entries(playerHistory)) {
          const prev = prevPlayers[uid] || {};
          sessionUpdates[`players/${uid}/name`] = p.name;
          if (isActivityGame) {
            // Participation only — never touches score or ranking.
            sessionUpdates[`players/${uid}/activitiesJoined`] = (prev.activitiesJoined || 0) + 1;
          } else {
            sessionUpdates[`players/${uid}/totalScore`]  = (prev.totalScore  || 0) + (p.score || 0);
            sessionUpdates[`players/${uid}/gamesPlayed`] = (prev.gamesPlayed || 0) + 1;
          }
        }

        await update(ref(db, `sessions/${sessionCode}`), sessionUpdates);
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Guard renders ───────────────────────────────────────────────────────────

  if (!pin || !secret)    return <Splash>Invalid host URL.</Splash>;
  if (verifyErr)          return <Splash>Could not reach the database — check your connection and reload.</Splash>;
  if (!user || verified === null) return <Splash>Verifying…</Splash>;
  if (verified === false) {
    return (
      <div className="page page-centered">
        <div className="card" style={{ textAlign: 'center', maxWidth: 360 }}>
          <h2>Access Denied</h2>
          <p className="muted">You are not the host of this game.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }
  if (!game) return <Splash>Loading game…</Splash>;

  const players      = game.players || {};
  const answers      = game.answers || {};
  const status       = game.status;
  const questionCount = game.questions?.length || 0;
  const isLastQ      = currentIdx >= questionCount - 1;
  const answerCount  = Object.keys(answers).length;
  const playerList   = Object.entries(players).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  const playerCount  = playerList.length;
  const allAnswered  = playerCount > 0 && answerCount >= playerCount;
  const choiceCounts = tallyChoices(answers);
  // Whole-game activity (picked from the Poll / Word Cloud card)…
  const activityGame    = game.kind === 'activity' || game.gameType === 'wordcloud' || game.gameType === 'poll';
  // …versus the type of the question on screen right now, which is what
  // decides the UI. A poll question inside a quiz must not show Reveal Answer.
  const qType           = game.currentQuestion?.type || game.questions?.[currentIdx]?.type || 'mcq';
  const isPollQ         = qType === 'poll';
  const isWordCloudQ    = qType === 'wordcloud';
  const isActivityQ     = isPollQ || isWordCloudQ;
  const firstQType      = game.questions?.[0]?.type || 'mcq';

  return (
    <div className="page host-page">

      {/* Tamper alerts */}
      {tamperAlerts.map(a => (
        <div key={a.id} className="tamper-banner">
          <strong>Tamper attempt</strong> — UID: {a.uid.slice(0, 8)}…
          <button onClick={() => setTamperAlerts(p => p.filter(x => x.id !== a.id))}>✕</button>
        </div>
      ))}

      {/* Top bar */}
      <div className="host-topbar">
        <div className="pin-badge">PIN: {pin}</div>
        <div className={`kind-badge${game.kind === 'activity' ? ' kind-activity' : ''}`}>
          {game.kind === 'activity'
            ? (game.gameType === 'poll' ? '📊 Poll · no scoring' : '☁️ Word Cloud · no scoring')
            : '🧠 Quiz · scored'}
        </div>
        <div className="status-chip">{status}</div>
        <div className="player-pill">{playerCount} 👥</div>
        <button
          className={`btn-chat-toggle ${chatEnabled ? 'chat-on' : 'chat-off'}`}
          onClick={() => {
            const next = !chatEnabled;
            setChatEnabled(next);
            update(ref(db, `games/${pin}`), { chatEnabled: next });
          }}
          title={chatEnabled ? 'Disable chat' : 'Enable chat'}
        >
          {chatEnabled ? '💬' : '🚫'}
        </button>

        {/* End at any point, not only from the final scoreboard */}
        {status !== 'ended' && (
          confirmEnd ? (
            <span className="end-confirm">
              <span className="end-confirm-q">End now?</span>
              <button
                className="end-yes"
                disabled={busy}
                onClick={() => { setConfirmEnd(false); activityGame ? endActivity() : endGame(); }}
              >
                {busy ? '…' : 'End'}
              </button>
              <button className="end-no" disabled={busy} onClick={() => setConfirmEnd(false)}>
                Keep going
              </button>
            </span>
          ) : (
            <button className="btn-end-game" onClick={() => setConfirmEnd(true)} title="End this game now">
              ⏹ End
            </button>
          )
        )}
      </div>

      {/* ── LOBBY ── */}
      {status === 'lobby' && (
        <div className="host-section">
          <h2>Waiting for players…</h2>
          <div className="lobby-grid">
            {playerList.map(([uid, p]) => (
              <div key={uid} className="lobby-chip">{p.name}</div>
            ))}
            {playerCount === 0 && <p className="muted">Share PIN <strong>{pin}</strong> to invite players</p>}
          </div>
          <p className="muted">
            {activityGame && firstQType === 'wordcloud' ? '☁️ Word cloud prompt ready'
              : activityGame && firstQType === 'poll'    ? '📊 Poll ready'
              : `${questionCount} question${questionCount !== 1 ? 's' : ''} loaded`}
          </p>
          <button
            className="btn btn-primary btn-large"
            onClick={startGame}
            disabled={playerCount === 0 || busy}
          >
            {busy ? 'Starting…'
              : activityGame && firstQType === 'wordcloud' ? 'Open Word Cloud'
              : activityGame && firstQType === 'poll'      ? 'Open Poll'
              : 'Start Game'}
          </button>
        </div>
      )}

      {/* ── ACTIVITY (own flow: no Q numbers, no reveal, no scoreboard) ── */}
      {status === 'question' && game.currentQuestion && isActivityQ && (
        <div className="host-section wc-host">
          <div className="wc-prompt-bar">
            <span className="wc-chip">{isPollQ ? '📊 Live poll' : '☁️ Live word cloud'}</span>
            <span className="muted wc-count">
              {answerCount} {isPollQ ? 'vote' : 'response'}{answerCount !== 1 ? 's' : ''} from {playerCount} player{playerCount !== 1 ? 's' : ''}
            </span>
          </div>

          <h2 className="wc-prompt">{game.currentQuestion.text}</h2>

          <div className="wc-stage">
            {answerCount === 0 ? (
              <p className="muted">Waiting for the first {isPollQ ? 'vote' : 'response'}…</p>
            ) : isPollQ ? (
              <div className="host-poll-graph">
                {pollBars(game.currentQuestion.choices, choiceCounts).map(({ label, count, pct, isLead }) => (
                  <div key={label} className={`hpg-row${isLead ? ' hpg-lead' : ''}`}>
                    <span className="hpg-label">{label}</span>
                    <div className="hpg-track">
                      <div className="hpg-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="hpg-val">{pct}% ({count})</span>
                  </div>
                ))}
              </div>
            ) : (
              <WordCloud answers={answers} />
            )}
          </div>

          <div className="wc-actions">
            {activityGame ? (
              <>
                {sessionCode && (
                  <button className="btn btn-ghost" onClick={() => saveActivity(true)} disabled={busy}>
                    💾 Save & back to dashboard
                  </button>
                )}
                <button className="btn btn-primary" onClick={endActivity} disabled={busy}>
                  ⏹ End {isPollQ ? 'poll' : 'word cloud'}
                </button>
              </>
            ) : (
              // An activity question inside a quiz: no reveal, just move on.
              <button className="btn btn-primary" onClick={finishActivityQuestion} disabled={busy}>
                {isLastQ ? '⏹ End Game' : 'Next Question →'}
              </button>
            )}
          </div>
          <p className="muted wc-hint">
            {activityGame
              ? `Ending it saves the ${isPollQ ? 'results' : 'cloud'} and sends everyone back to the session automatically.`
              : 'No right answer here, so there is nothing to reveal — scores are unchanged.'}
          </p>
        </div>
      )}

      {/* ── QUESTION ── */}
      {status === 'question' && game.currentQuestion && !isActivityQ && (
        <div className="host-section">
          <div className="question-meta">
            <span>Q{currentIdx + 1} / {questionCount}</span>
            <span>{answerCount} / {playerCount} answered</span>
          </div>

          <h2 className="host-question-text">{game.currentQuestion.text}</h2>

          <Timer
            startedAt={game.currentQuestion.startedAt}
            timeLimit={game.currentQuestion.timeLimit}
            onExpired={handleTimerExpired}
          />

          {game.currentQuestion.type === 'wordcloud' ? (
            <WordCloud answers={answers} />
          ) : (
            <div className="host-choices-grid">
              {game.currentQuestion.choices.map((c, i) => {
                const cnt = choiceCounts[i];
                return (
                  <div key={i} className={`host-choice host-choice-${i}`}>
                    <span className="hc-text">{c}</span>
                    <span className="hc-count">{cnt}</span>
                  </div>
                );
              })}
            </div>
          )}

          {(timerDone || allAnswered) && (
            <button
              className="btn btn-primary btn-large"
              onClick={revealAnswer}
              disabled={busy}
            >
              {busy ? 'Calculating…' : 'Reveal Answer'}
            </button>
          )}
        </div>
      )}

      {/* ── REVEAL ── */}
      {status === 'reveal' && game.reveal && game.currentQuestion && !isActivityQ && (
        <div className="host-section">
          <h2>{game.currentQuestion.type === 'wordcloud' ? '☁️ Results' : 'Answer Revealed'}</h2>
          {game.currentQuestion.type === 'wordcloud' ? (
            <WordCloud answers={answers} />
          ) : (
            <div className="host-choices-grid">
              {game.currentQuestion.choices.map((c, i) => {
                const cnt     = choiceCounts[i];
                const correct = i === game.reveal.correct;
                return (
                  <div key={i} className={`host-choice host-choice-${i}${correct ? ' hc-correct' : ' hc-wrong'}`}>
                    <span className="hc-text">{c}</span>
                    <span className="hc-count">{cnt}</span>
                    {correct && <span className="hc-tick">✓</span>}
                  </div>
                );
              })}
            </div>
          )}
          <button className="btn btn-primary btn-large" onClick={showScoreboard} disabled={busy}>
            Show Scoreboard
          </button>
        </div>
      )}

      {/* ── SCOREBOARD ── */}
      {status === 'scoreboard' && !activityGame && (
        <div className="host-section">
          <h2>Leaderboard</h2>
          <TeamLeaderboard players={playerList} teams={teams} showDelta />
          <button
            className="btn btn-primary btn-large"
            onClick={isLastQ ? endGame : nextQuestion}
            disabled={busy}
          >
            {isLastQ ? 'End Game' : 'Next Question →'}
          </button>
        </div>
      )}

      {/* ── ENDED: activities have no scores, so no podium and no confetti ── */}
      {status === 'ended' && activityGame && (
        <div className="host-section wc-host">
          <h2>{game.gameType === 'poll' ? '📊 Poll closed' : '☁️ Word cloud closed'}</h2>
          <p className="muted">{game.currentQuestion?.text || game.questions?.[0]?.text}</p>
          <div className="wc-stage">
            {game.gameType === 'poll' ? (
              <div className="host-poll-graph">
                {pollBars(game.currentQuestion?.choices, choiceCounts).map(({ label, count, pct, isLead }) => (
                  <div key={label} className={`hpg-row${isLead ? ' hpg-lead' : ''}`}>
                    <span className="hpg-label">{label}</span>
                    <div className="hpg-track"><div className="hpg-fill" style={{ width: `${pct}%` }} /></div>
                    <span className="hpg-val">{pct}% ({count})</span>
                  </div>
                ))}
              </div>
            ) : (
              <WordCloud answers={answers} />
            )}
          </div>
          {sessionCode ? (
            <button
              className="btn btn-primary btn-large"
              onClick={() => navigate(`/session/host?code=${sessionCode}&secret=${sessionSecret}`)}
            >
              🔁 Back to Session Dashboard
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => navigate('/')}>Back to Home</button>
          )}
        </div>
      )}

      {/* ── ENDED ── */}
      {status === 'ended' && !activityGame && (
        <div className="host-section">
          <h2>🏆 Final Results</h2>
          <Podium players={playerList} />
          <TeamLeaderboard players={playerList} teams={teams} final />
          <a
            className="btn btn-primary btn-large"
            href={`/results?pin=${pin}&secret=${secret}`}
            target="_blank"
            rel="noreferrer"
          >
            📊 View Full Results
          </a>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Players can view at: <strong>/results?pin={pin}</strong>
          </p>
          {sessionCode ? (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/session/host?code=${sessionCode}&secret=${sessionSecret}`)}
            >
              🔁 Back to Session Dashboard
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => navigate('/')}>Back to Home</button>
          )}
        </div>
      )}
      <Reactions pin={pin} user={user} />
      <Chat
        pin={pin}
        user={user}
        playerName="Host"
        isHost
        chatEnabled={chatEnabled}
      />
    </div>
  );
}
