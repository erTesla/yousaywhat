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

// Flat award for submitting a word-cloud answer (no correct answer to score).
const WORDCLOUD_POINTS = 500;

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

  // ── Game state listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!verified || !pin) return;

    const unsub = onValue(ref(db, `games/${pin}`), snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      setGame(data);
      if (!sessionCode) setTeams(data.teams || {});
    });
    return unsub;
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
          choices:   q.choices,
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

  async function revealAnswer() {
    if (!game) return;
    const q = game.questions[currentIdx];
    setBusy(true);

    const isWordcloud = q.type === 'wordcloud';
    const updates = { status: 'reveal', 'reveal/index': currentIdx, 'reveal/correct': q.correct };

    for (const [uid, ans] of Object.entries(answers)) {
      // Word cloud has no correct answer — award participation so session
      // totals still move instead of staying flat at zero.
      const earned = isWordcloud
        ? (ans.text ? WORDCLOUD_POINTS : 0)
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

  async function showScoreboard() {
    await update(ref(db, `games/${pin}`), { status: 'scoreboard' });
  }

  async function nextQuestion() {
    await pushQuestion(currentIdx + 1);
  }

  async function endGame() {
    setBusy(true);
    try {
      // Build frozen results snapshot
      const qs = game.questions || [];
      const summary = {};
      qs.forEach((q, idx) => {
        if (q.type === 'wordcloud') return;
        const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
        Object.values(answers).forEach(a => {
          if (a.choice !== undefined && a.choice !== null) counts[a.choice] = (counts[a.choice] || 0) + 1;
        });
        summary[idx] = { choiceCounts: counts, correct: q.correct };
      });

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

        const sessionUpdates = {
          currentGamePin: null,
          status: 'between',
          [`games/${pin}/endedAt`]:       endedAt,
          [`games/${pin}/questionCount`]: qs.length,
          [`games/${pin}/playerCount`]:   Object.keys(playerHistory).length,
          [`games/${pin}/winnerName`]:    topPlayer?.[1]?.name  || '',
          [`games/${pin}/winnerScore`]:   topPlayer?.[1]?.score || 0,
        };

        for (const [uid, p] of Object.entries(playerHistory)) {
          const prev = prevPlayers[uid] || {};
          sessionUpdates[`players/${uid}/name`]        = p.name;
          sessionUpdates[`players/${uid}/totalScore`]  = (prev.totalScore  || 0) + (p.score || 0);
          sessionUpdates[`players/${uid}/gamesPlayed`] = (prev.gamesPlayed || 0) + 1;
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
          <p className="muted">{questionCount} question{questionCount !== 1 ? 's' : ''} loaded</p>
          <button
            className="btn btn-primary btn-large"
            onClick={startGame}
            disabled={playerCount === 0 || busy}
          >
            {busy ? 'Starting…' : 'Start Game'}
          </button>
        </div>
      )}

      {/* ── QUESTION ── */}
      {status === 'question' && game.currentQuestion && (
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
                const cnt = Object.values(answers).filter(a => a.choice === i).length;
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
      {status === 'reveal' && game.reveal && game.currentQuestion && (
        <div className="host-section">
          <h2>{game.currentQuestion.type === 'wordcloud' ? '☁️ Results' : 'Answer Revealed'}</h2>
          {game.currentQuestion.type === 'wordcloud' ? (
            <WordCloud answers={answers} />
          ) : (
            <div className="host-choices-grid">
              {game.currentQuestion.choices.map((c, i) => {
                const cnt     = Object.values(answers).filter(a => a.choice === i).length;
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
      {status === 'scoreboard' && (
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

      {/* ── ENDED ── */}
      {status === 'ended' && (
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

function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}
