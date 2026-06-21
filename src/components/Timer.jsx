import { useState, useEffect, useLayoutEffect, useRef } from 'react';

export default function Timer({ startedAt, timeLimit, onExpired, compact = false }) {
  const [remaining, setRemaining] = useState(timeLimit);
  const expiredFired = useRef(false);
  const onExpiredRef = useRef(onExpired);
  useLayoutEffect(() => { onExpiredRef.current = onExpired; });

  useEffect(() => {
    if (!startedAt) return;
    expiredFired.current = false;

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rem = Math.max(0, timeLimit - elapsed);
      setRemaining(rem);
      if (rem === 0 && !expiredFired.current) {
        expiredFired.current = true;
        onExpiredRef.current();
      }
    };

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startedAt, timeLimit]);

  const pct = (remaining / timeLimit) * 100;
  const urgent = remaining < timeLimit * 0.25;

  if (compact) {
    return (
      <div className={`timer-compact${urgent ? ' urgent' : ''}`}>
        {Math.ceil(remaining)}s
      </div>
    );
  }

  return (
    <div className="timer">
      <div className="timer-track">
        <div
          className={`timer-fill${urgent ? ' urgent' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`timer-num${urgent ? ' urgent' : ''}`}>
        {Math.ceil(remaining)}
      </div>
    </div>
  );
}
