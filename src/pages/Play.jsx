import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ref, onValue, set, get, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import Timer from '../components/Timer';
import Scoreboard from '../components/Scoreboard';
import Podium from '../components/Podium';
import Chat from '../components/Chat';
import Reactions from '../components/Reactions';
import TeamLobby from '../components/TeamLobby';
import TeamLeaderboard from '../components/TeamLeaderboard';

const CHOICE_COLORS  = ['ans-red', 'ans-blue', 'ans-yellow', 'ans-green'];
const CHOICE_SHAPES  = ['▲', '◆', '●', '■'];

export default function Play() {
  const [params] = useSearchParams();
  const pin      = params.get('pin');
  const navigate = useNavigate();
  const user     = useAuth();

  const [status,          setStatus]          = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [reveal,          setReveal]          = useState(null);
  const [players,         setPlayers]         = useState({});
  const [myAnswer,        setMyAnswer]        = useState(null);
  const [scorePop,        setScorePop]        = useState(null);
  const [chatEnabled,     setChatEnabled]     = useState(true);
  const [teams,           setTeams]           = useState({});
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
    const unsubTeams    = onValue(ref(db, `games/${pin}/teams`),        snap => setTeams(snap.val() || {}));

    return () => {
      unsubStatus();
      unsubQuestion();
      unsubReveal();
      unsubPlayers();
      unsubChat();
      unsubTeams();
    };
  }, [pin, user, navigate]);

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
    if (status !== 'ended' || !user || globalWritten.current) return;
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
  }, [status, user, players]);

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
        <TeamLobby
          pin={pin}
          user={user}
          playerName={myPlayer?.name}
          teams={teams}
          myTeamCode={myPlayer?.teamCode}
        />
        {reactionsWidget}
        {chatWidget}
      </div>
    );
  }

  // ── QUESTION ─────────────────────────────────────────────────────────────────
  if (status === 'question' && currentQuestion) {
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
            <div className="answered-splash">
              <div className="answered-check">✓</div>
              <h2>"{myAnswer}"</h2>
              <p className="muted">Waiting for everyone else…</p>
            </div>
          )
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
      </div>
    );
  }

  // ── REVEAL ───────────────────────────────────────────────────────────────────
  if (status === 'reveal' && reveal && currentQuestion) {
    const isWordCloud = currentQuestion.type === 'wordcloud';
    const isCorrect   = !isWordCloud && myAnswer === reveal.correct;
    const points      = myPlayer?.lastPoints || 0;

    return (
      <div className="page play-reveal">
        {scorePop && (
          <div className="score-pop" key={scorePop}>+{scorePop} pts</div>
        )}
        <div className={`reveal-banner ${isWordCloud ? 'reveal-wordcloud' : isCorrect ? 'reveal-correct' : 'reveal-wrong'}`}>
          <span className="reveal-emoji">{isWordCloud ? '☁️' : isCorrect ? '🎉' : '😬'}</span>
          <h2>{isWordCloud ? 'See the cloud!' : isCorrect ? 'Correct!' : 'Wrong!'}</h2>
          {isCorrect && <p className="reveal-points">+{points} pts</p>}
        </div>

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

        <div className="reveal-total">Total: {myPlayer?.score || 0} pts</div>
        {reactionsWidget}
        {chatWidget}
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
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Play Again
        </button>
        {chatWidget}
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
