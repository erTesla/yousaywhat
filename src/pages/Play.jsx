import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, onValue, set, get, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { leaveSession, followedKey } from '../utils/session';
import Timer from '../components/Timer';
import Podium from '../components/Podium';
import Chat from '../components/Chat';
import Reactions from '../components/Reactions';
import TeamLobby from '../components/TeamLobby';
import TeamLeaderboard from '../components/TeamLeaderboard';
import WordCloud from '../components/WordCloud';

const CHOICE_COLORS  = ['ans-red', 'ans-blue', 'ans-yellow', 'ans-green'];
const CHOICE_SHAPES  = ['▲', '◆', '●', '■'];
// Seconds a player lingers on the result before returning to the session lobby
const RETURN_SECONDS = 6;

export default function Play() {
  const [params]    = useSearchParams();
  const pin         = params.get('pin');
  const sessionCode = params.get('sessionCode')?.toUpperCase();
  const navigate    = useNavigate();
  const user        = useAuth();
  const teamBase    = sessionCode ? `sessions/${sessionCode}` : `games/${pin}`;

  const [status,          setStatus]          = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [reveal,          setReveal]          = useState(null);
  const [players,         setPlayers]         = useState({});
  const [myAnswer,        setMyAnswer]        = useState(null);
  const [scorePop,        setScorePop]        = useState(null);
  const [chatEnabled,     setChatEnabled]     = useState(true);
  const [teams,           setTeams]           = useState({});
  const [myTeamCode,      setMyTeamCode]      = useState(null);
  const [teamMode,        setTeamMode]        = useState(false);
  const [gameKind,        setGameKind]        = useState('quiz');
  const [revealAnswers,   setRevealAnswers]   = useState({});
  const [confirmLeave,    setConfirmLeave]    = useState(false);
  const [returnIn,        setReturnIn]        = useState(RETURN_SECONDS);
  const prevQIdx       = useRef(-1);
  const prevPoints     = useRef(0);
  const globalWritten  = useRef(false);
  const noop = useCallback(() => {}, []);

  useEffect(() => { if (!pin) navigate('/'); }, [pin, navigate]);

  useEffect(() => {
    if (!pin || !user) return;

    // Read individual permitted paths — players cannot read the full game node
    // because that would expose questions[].correct for all questions upfront.
    const unsubStatus = onValue(ref(db, `games/${pin}/status`), snap => {
      if (!snap.exists()) { navigate('/'); return; }
      setStatus(snap.val());
    });

    const unsubQuestion = onValue(ref(db, `games/${pin}/currentQuestion`), snap => {
      const q = snap.val();
      const newIdx = q?.index ?? -1;
      if (newIdx !== prevQIdx.current) {
        prevQIdx.current = newIdx;
        setMyAnswer(null);
      }
      setCurrentQuestion(q);
    });

    const unsubReveal   = onValue(ref(db, `games/${pin}/reveal`),       snap => setReveal(snap.val()));
    const unsubPlayers  = onValue(ref(db, `games/${pin}/players`),      snap => setPlayers(snap.val() || {}));
    const unsubChat     = onValue(ref(db, `games/${pin}/chatEnabled`),  snap => setChatEnabled(snap.val() !== false));
    const unsubKind     = onValue(ref(db, `games/${pin}/kind`),         snap => setGameKind(snap.val() || 'quiz'));
    // Answers become readable to everyone at reveal, which is how players get
    // to see the word cloud they contributed to.
    // In a session, teams live on the session so they survive between games.
    const unsubTeams    = onValue(ref(db, `${teamBase}/teams`),         snap => setTeams(snap.val() || {}));
    // Team options only appear when the host has switched team mode on.
    const unsubTeamMode = onValue(ref(db, `${teamBase}/teamMode`),      snap => setTeamMode(snap.val() === true));
    const unsubMyTeam   = sessionCode
      ? onValue(ref(db, `sessions/${sessionCode}/players/${user.uid}/teamCode`), snap => setMyTeamCode(snap.val() || null))
      : () => {};

    return () => {
      unsubStatus();
      unsubQuestion();
      unsubReveal();
      unsubPlayers();
      unsubChat();
      unsubKind();
      unsubTeams();
      unsubTeamMode();
      unsubMyTeam();
    };
  }, [pin, user, navigate, sessionCode, teamBase]);

  async function handleAnswer(choiceIdx) {
    if (myAnswer !== null || !user || status !== 'question' || !currentQuestion) return;
    setMyAnswer(choiceIdx); // optimistic lock

    const elapsed = currentQuestion.startedAt
      ? Math.max(0, Date.now() - currentQuestion.startedAt)
      : 0;

    try {
      await set(ref(db, `games/${pin}/answers/${user.uid}`), {
        choice:  choiceIdx,
        elapsed: elapsed,
      });
    } catch {
      // DB write failed (e.g. timer expired before submit) — keep local lock
    }
  }

  // Write global leaderboard entry once when game ends
  useEffect(() => {
    // Activities never affect the global leaderboard.
    if (status !== 'ended' || !user || globalWritten.current || gameKind === 'activity') return;
    const myScore = players[user.uid]?.score || 0;
    const myName  = players[user.uid]?.name  || 'Anonymous';
    if (myScore === 0) return;
    globalWritten.current = true;

    const glRef = ref(db, `globalLeaderboard/${user.uid}`);
    get(glRef).then(snap => {
      const prev = snap.val() || { totalScore: 0, gamesPlayed: 0 };
      update(glRef, {
        name:        myName,
        totalScore:  (prev.totalScore || 0) + myScore,
        gamesPlayed: (prev.gamesPlayed || 0) + 1,
        lastPlayedAt: Date.now(),
      });
    }).catch(() => {});
  }, [status, user, players, gameKind]);

  // Score pop: fire when lastPoints changes and is > 0
  useEffect(() => {
    if (!user) return;
    const pts = players[user.uid]?.lastPoints || 0;
    if (pts > 0 && pts !== prevPoints.current) {
      prevPoints.current = pts;
      setScorePop(pts);
      const t = setTimeout(() => setScorePop(null), 1500);
      return () => clearTimeout(t);
    }
  }, [players, user]);

  // Answers are readable at reveal (word cloud results) and throughout a live
  // poll question, where watching votes land is the whole point.
  const liveOpen = status === 'question' &&
    (currentQuestion?.type === 'poll' || currentQuestion?.type === 'wordcloud');
  useEffect(() => {
    if (!pin || (status !== 'reveal' && !liveOpen)) return;
    // onValue fires immediately with current data, and the host clears answers
    // on each new question, so there's no stale-flash to guard against here.
    const unsub = onValue(
      ref(db, `games/${pin}/answers`),
      snap => setRevealAnswers(snap.val() || {}),
      () => {},
    );
    return unsub;
  }, [status, pin, liveOpen]);


  // Follow the session from inside a game: if the host starts a different game,
  // or ends this one, move the player rather than leaving them on a dead screen.
  useEffect(() => {
    if (!sessionCode || !pin) return;
    const unsub = onValue(ref(db, `sessions/${sessionCode}/currentGamePin`), snap => {
      const next = snap.val();
      if (next && next !== pin) {
        sessionStorage.removeItem(`ysw_followed_${sessionCode}`);
        navigate(`/session/play?code=${sessionCode}`, { replace: true });
      }
    });
    return unsub;
  }, [sessionCode, pin, navigate]);

  async function handleLeave() {
    if (sessionCode) {
      await leaveSession({ code: sessionCode, uid: user.uid, gamePin: pin, teamCode: myTeamCode });
    }
    navigate('/');
  }


  // The host ended the game: send players back to the session lobby instead of
  // parking them on a dead screen. Short pause so they still see the outcome.
  useEffect(() => {
    if (status !== 'ended' || !sessionCode) return;
    const tick = setInterval(() => setReturnIn(n => Math.max(0, n - 1)), 1000);
    const go = setTimeout(() => {
      try { sessionStorage.removeItem(followedKey(sessionCode)); } catch { /* storage blocked */ }
      navigate(`/session/play?code=${sessionCode}`, { replace: true });
    }, RETURN_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, [status, sessionCode, navigate]);

  if (!user || !pin) return <Splash>Connecting…</Splash>;

  const myPlayer   = players[user.uid];
  const playerList = Object.entries(players).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

  const chatWidget = (
    <Chat
      pin={pin}
      user={user}
      playerName={myPlayer?.name}
      isHost={false}
      chatEnabled={chatEnabled}
    />
  );

  const reactionsWidget = <Reactions pin={pin} user={user} />;

  const exitWidget = confirmLeave ? (
    <div className="exit-confirm">
      <span>Leave and lose your score here?</span>
      <button className="btn-exit-yes" onClick={handleLeave}>Leave</button>
      <button className="btn-exit-no" onClick={() => setConfirmLeave(false)}>Stay</button>
    </div>
  ) : (
    <button
      className="btn-exit"
      onClick={() => setConfirmLeave(true)}
      title="Leave and join another session"
    >
      ✕ Leave
    </button>
  );

  // ── LOBBY ────────────────────────────────────────────────────────────────────
  if (!status || status === 'lobby') {
    return (
      <div className="page page-centered">
        <div className="lobby-waiting">
          <div className="avatar">{myPlayer?.name?.[0]?.toUpperCase() || '?'}</div>
          <h2>{myPlayer?.name || '…'}</h2>
          <div className="pulse-ring" />
          <p className="muted">Waiting for host to start…</p>
          <p className="player-count-tag">{Object.keys(players).length} players joined</p>
        </div>
        {teamMode && (
          <TeamLobby
            basePath={teamBase}
            user={user}
            teams={teams}
            myTeamCode={sessionCode ? myTeamCode : myPlayer?.teamCode}
          />
        )}
        {reactionsWidget}
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  // ── QUESTION ─────────────────────────────────────────────────────────────────
  if (status === 'question' && currentQuestion) {
    const isPoll = currentQuestion.type === 'poll';
    return (
      <div className="page play-page">
        <div className="play-topbar">
          <span className="play-score">{myPlayer?.score || 0} pts</span>
          <Timer
            startedAt={currentQuestion.startedAt}
            timeLimit={currentQuestion.timeLimit}
            onExpired={noop}
            compact
          />
        </div>

        {currentQuestion.type === 'wordcloud' ? (
          myAnswer === null ? (
            <WordCloudInput question={currentQuestion} pin={pin} user={user} onSubmit={txt => setMyAnswer(txt)} />
          ) : (
            <div className="wc-player-live">
              <div className="answered-check">✓</div>
              <h2>"{myAnswer}"</h2>
              <p className="muted">Here's the cloud so far…</p>
              <WordCloud answers={revealAnswers} />
            </div>
          )
        ) : isPoll ? (
          <>
            <div className="poll-banner">📊 Poll — no points, just your opinion</div>
            <h2 className="play-question">{currentQuestion.text}</h2>
            {myAnswer === null ? (
              <div className="poll-options">
                {currentQuestion.choices.filter(Boolean).map((c, i) => (
                  <button key={i} className="poll-option" onClick={() => handleAnswer(i)}>
                    <span className="po-letter">{['A','B','C','D'][i]}</span>
                    <span className="po-text">{c}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="poll-voted">
                <p className="muted">✓ Your vote is in — waiting for everyone else…</p>
                <div className="poll-results">
                  {currentQuestion.choices.filter(Boolean).map((c, i) => {
                    const count = Object.values(revealAnswers).filter(a => a.choice === i).length;
                    const total = Object.keys(revealAnswers).length || 1;
                    const pct   = Math.round((count / total) * 100);
                    return (
                      <div key={i} className="poll-res-row">
                        <span className="po-text">{c}{i === myAnswer && <span className="po-mine"> your vote</span>}</span>
                        <div className="poll-bar-track">
                          <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="poll-pct">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : myAnswer === null ? (
          <>
            <h2 className="play-question">{currentQuestion.text}</h2>
            <div className="answer-grid">
              {currentQuestion.choices.map((c, i) => (
                <button
                  key={i}
                  className={`answer-btn ${CHOICE_COLORS[i]}`}
                  onClick={() => handleAnswer(i)}
                >
                  <span className="ans-shape">{CHOICE_SHAPES[i]}</span>
                  <span className="ans-text">{c}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="answered-splash">
            <div className="answered-check">✓</div>
            <h2>Answer locked in!</h2>
            <p className="muted">Waiting for everyone else…</p>
          </div>
        )}
        {reactionsWidget}
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  // ── REVEAL ───────────────────────────────────────────────────────────────────
  if (status === 'reveal' && reveal && currentQuestion) {
    const isWordCloud = currentQuestion.type === 'wordcloud';
    const isPollQ     = currentQuestion.type === 'poll';
    const isActivity  = isWordCloud || isPollQ;
    const isCorrect   = !isActivity && myAnswer === reveal.correct;
    const points      = myPlayer?.lastPoints || 0;

    return (
      <div className="page play-reveal">
        {scorePop && (
          <div className="score-pop" key={scorePop}>+{scorePop} pts</div>
        )}
        <div className={`reveal-banner ${isActivity ? 'reveal-wordcloud' : isCorrect ? 'reveal-correct' : 'reveal-wrong'}`}>
          <span className="reveal-emoji">{isWordCloud ? '☁️' : isPollQ ? '📊' : isCorrect ? '🎉' : '😬'}</span>
          <h2>{isWordCloud ? 'See the cloud!' : isPollQ ? 'Results are in' : isCorrect ? 'Correct!' : 'Wrong!'}</h2>
          {isCorrect && <p className="reveal-points">+{points} pts</p>}
          {isActivity && <p className="muted reveal-note">Activity — no points awarded</p>}
        </div>

        {isWordCloud ? (
          <WordCloud answers={revealAnswers} />
        ) : isPollQ ? (
          <div className="poll-results poll-results-final">
            {currentQuestion.choices.filter(Boolean).map((c, i) => {
              const count = Object.values(revealAnswers).filter(a => a.choice === i).length;
              const total = Object.keys(revealAnswers).length || 1;
              const pct   = Math.round((count / total) * 100);
              const top   = count > 0 && count === Math.max(
                ...currentQuestion.choices.filter(Boolean).map((_, j) =>
                  Object.values(revealAnswers).filter(a => a.choice === j).length));
              return (
                <div key={i} className={`poll-res-row${top ? ' poll-res-top' : ''}`}>
                  <span className="po-text">{c}{i === myAnswer && <span className="po-mine"> your vote</span>}</span>
                  <div className="poll-bar-track">
                    <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="poll-pct">{pct}% ({count})</span>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="reveal-choices">
          {currentQuestion.choices.map((c, i) => (
            <div
              key={i}
              className={[
                'reveal-choice',
                i === reveal.correct           ? 'rc-correct'  : '',
                i === myAnswer && !isCorrect   ? 'rc-my-wrong' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="rc-shape">{CHOICE_SHAPES[i]}</span>
              <span>{c}</span>
              {i === reveal.correct && <span className="rc-tick">✓</span>}
            </div>
          ))}
        </div>
        )}

        {!isActivity && <div className="reveal-total">Total: {myPlayer?.score || 0} pts</div>}
        {reactionsWidget}
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  // ── SCOREBOARD ───────────────────────────────────────────────────────────────
  if (status === 'scoreboard') {
    const myRank = playerList.findIndex(([uid]) => uid === user.uid) + 1;
    return (
      <div className="page play-scoreboard">
        <h2>Leaderboard</h2>
        <div className="my-rank-banner">You're #{myRank}</div>
        <TeamLeaderboard players={playerList} teams={teams} highlightUid={user.uid} showDelta />
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  // ── ENDED: word cloud / activity has no ranking to show ──────────────────────
  if (status === 'ended' && gameKind === 'activity') {
    return (
      <div className="page play-ended">
        <h2>☁️ That's a wrap</h2>
        <p className="muted">Thanks for taking part — no points, just your words.</p>
        {Object.keys(revealAnswers).length > 0 && <WordCloud answers={revealAnswers} />}
        {sessionCode ? (
          <>
            <button className="btn btn-primary" onClick={() => navigate(`/session/play?code=${sessionCode}`)}>
              🔁 Back to Session
            </button>
            <p className="muted return-note">Returning to the lobby in {returnIn}s…</p>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Home</button>
        )}
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  // ── ENDED ────────────────────────────────────────────────────────────────────
  if (status === 'ended') {
    const myRank = playerList.findIndex(([uid]) => uid === user.uid) + 1;
    return (
      <div className="page play-ended">
        <h2>{myRank === 1 ? '🏆 You Won!' : 'Game Over!'}</h2>
        {myRank !== 1 && <p className="my-final-rank">You finished #{myRank}</p>}
        <Podium players={playerList} />
        <TeamLeaderboard players={playerList} teams={teams} highlightUid={user.uid} final />
        <a className="btn btn-ghost" href={`/results?pin=${pin}`} target="_blank" rel="noreferrer">
          📊 View My Results
        </a>
        {sessionCode ? (
          <>
            <button className="btn btn-primary" onClick={() => navigate(`/session/play?code=${sessionCode}`)}>
              🔁 Back to Session
            </button>
            <p className="muted return-note">Returning to the lobby in {returnIn}s…</p>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Play Again
          </button>
        )}
        {chatWidget}
        {exitWidget}
      </div>
    );
  }

  return <Splash>Loading…</Splash>;
}

function Splash({ children }) {
  return <div className="page page-centered"><p className="muted">{children}</p></div>;
}

function WordCloudInput({ question, pin, user, onSubmit }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  async function submit() {
    const trimmed = text.trim().slice(0, 40);
    if (!trimmed || sent) return;
    setSent(true);
    onSubmit(trimmed);
    try {
      await set(ref(db, `games/${pin}/answers/${user.uid}`), {
        text,
        elapsed: question.startedAt ? Math.max(0, Date.now() - question.startedAt) : 0,
      });
    } catch { /* keep local lock */ }
  }

  return (
    <div className="wc-input-screen">
      <h2 className="play-question">{question.text}</h2>
      <div className="wc-input-wrap">
        <input
          className="text-input wc-text-input"
          placeholder="Type your answer…"
          value={text}
          onChange={e => setText(e.target.value.slice(0, 40))}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
          maxLength={40}
          disabled={sent}
        />
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim() || sent}>
          Send ➤
        </button>
      </div>
    </div>
  );
}
