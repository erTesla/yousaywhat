import { useState, useEffect, useRef } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { db } from '../firebase';

const EMOJIS = ['❤️', '🔥', '😂', '🦕', '👏', '💀'];
const MAX_REACTIONS = 3;
const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const FLOAT_DURATION = 2200;

export default function Reactions({ pin, user }) {
  const [floaters, setFloaters]     = useState([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [reactionCount, setReactionCount] = useState(0);
  const [now, setNow]               = useState(Date.now());
  const nextId = useRef(0);

  // Tick every second to update cooldown display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Listen to all reactions and show floaters
  useEffect(() => {
    if (!pin) return;
    const reactRef = ref(db, `games/${pin}/reactions`);
    const unsub = onValue(reactRef, snap => {
      const data = snap.val() || {};
      Object.entries(data).forEach(([uid, r]) => {
        if (!r?.type || !r?.sentAt) return;
        // Show floater for reactions sent within last 3 seconds
        if (Date.now() - r.sentAt < 3000) {
          addFloater(r.type);
        }
      });
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
    const nextCooldown = newCount >= MAX_REACTIONS ? Date.now() + COOLDOWN_MS : cooldownUntil;

    setReactionCount(newCount >= MAX_REACTIONS ? 0 : newCount);
    setCooldownUntil(nextCooldown);
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
