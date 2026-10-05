import { useState, useEffect, useRef } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { db } from '../firebase';

const EMOJIS = ['❤️', '🔥', '😂', '🦕', '👏', '💀'];
const MAX_REACTIONS = 3;
const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const FLOAT_DURATION = 2200;

// Cooldown is keyed by user, not by game, so moving between games in a session
// can't be used to reset the limit.
function loadCooldown(uid) {
  try {
    const raw = localStorage.getItem(`ysw_react_${uid}`);
    if (!raw) return { cooldownUntil: 0, reactionCount: 0 };
    const v = JSON.parse(raw);
    return { cooldownUntil: v.cooldownUntil || 0, reactionCount: v.reactionCount || 0 };
  } catch {
    return { cooldownUntil: 0, reactionCount: 0 };
  }
}

export default function Reactions({ pin, user }) {
  const [floaters, setFloaters]     = useState([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [reactionCount, setReactionCount] = useState(0);
  const [now, setNow]               = useState(Date.now());
  const nextId = useRef(0);
  const seenAt = useRef({});   // uid -> last sentAt we've already floated
  const primed = useRef(false);

  // Restore any cooldown still running from a previous game/mount
  useEffect(() => {
    if (!user) return;
    const { cooldownUntil: cu, reactionCount: rc } = loadCooldown(user.uid);
    setCooldownUntil(cu);
    setReactionCount(rc);
  }, [user]);

  // Tick only while a cooldown is actually counting down. This used to run
  // forever on every player and host screen, keeping the tab awake for nothing.
  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // cooldownUntil doesn't change when it lapses, so the effect won't re-run:
      // stop from inside once it has passed.
      if (t >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // Listen to all reactions and show floaters
  useEffect(() => {
    if (!pin) return;
    seenAt.current = {};
    primed.current = false;
    const reactRef = ref(db, `games/${pin}/reactions`);
    const unsub = onValue(reactRef, snap => {
      const data = snap.val() || {};
      Object.entries(data).forEach(([uid, r]) => {
        if (!r?.type || !r?.sentAt) return;
        // Only float a reaction we haven't floated before, otherwise every
        // change to the node re-floats everyone else's recent reactions.
        if (r.sentAt <= (seenAt.current[uid] || 0)) return;
        seenAt.current[uid] = r.sentAt;
        if (primed.current && Date.now() - r.sentAt < 3000) addFloater(r.type);
      });
      primed.current = true;   // first snapshot only seeds state, never floats
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function addFloater(emoji) {
    const id = nextId.current++;
    const x = 10 + Math.random() * 80; // % from left
    setFloaters(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), FLOAT_DURATION);
  }

  async function sendReaction(emoji) {
    if (!user || !pin) return;
    if (now < cooldownUntil) return;

    const newCount = reactionCount + 1;
    const hitLimit = newCount >= MAX_REACTIONS;
    const nextCooldown = hitLimit ? Date.now() + COOLDOWN_MS : cooldownUntil;
    const nextCount    = hitLimit ? 0 : newCount;

    setReactionCount(nextCount);
    setCooldownUntil(nextCooldown);
    try {
      localStorage.setItem(`ysw_react_${user.uid}`, JSON.stringify({
        cooldownUntil: nextCooldown, reactionCount: nextCount,
      }));
    } catch { /* storage blocked — cooldown degrades to in-memory only */ }
    addFloater(emoji);

    try {
      await set(ref(db, `games/${pin}/reactions/${user.uid}`), {
        type: emoji,
        sentAt: Date.now(),
      });
    } catch { /* silently drop */ }
  }

  const onCooldown = now < cooldownUntil;
  const secondsLeft = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const minutesLeft = Math.floor(secondsLeft / 60);
  const secsLeft    = secondsLeft % 60;

  return (
    <div className="reactions-widget">
      {/* Floating emojis */}
      {floaters.map(f => (
        <div
          key={f.id}
          className="reaction-floater"
          style={{ left: `${f.x}%` }}
        >
          {f.emoji}
        </div>
      ))}

      {/* Reaction bar */}
      <div className={`reaction-bar${onCooldown ? ' reaction-cooldown' : ''}`}>
        {onCooldown ? (
          <span className="reaction-timer">
            🕐 {minutesLeft}:{String(secsLeft).padStart(2, '0')}
          </span>
        ) : (
          EMOJIS.map(e => (
            <button
              key={e}
              className="reaction-btn"
              onClick={() => sendReaction(e)}
            >
              {e}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
