import { useEffect } from 'react';
import confetti from 'canvas-confetti';

const MEDALS = ['🥇', '🥈', '🥉'];
const HEIGHTS = ['140px', '100px', '70px'];
const ORDER = [1, 0, 2]; // display order: 2nd, 1st, 3rd

export default function Podium({ players }) {
  const top3 = players.slice(0, 3);

  useEffect(() => {
    const t1 = setTimeout(() => {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 } });
    }, 400);
    const t2 = setTimeout(() => {
      confetti({ particleCount: 60, angle: 60,  spread: 55, origin: { x: 0, y: 0.6 } });
      confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
    }, 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="podium">
      {ORDER.map((pos) => {
        const entry = top3[pos];
        if (!entry) return <div key={pos} className="podium-slot" />;
        const [, p] = entry;
        return (
          <div key={pos} className="podium-slot" style={{ animationDelay: `${pos * 150}ms` }}>
            <div className="podium-medal">{MEDALS[pos]}</div>
            <div className="podium-name">{p.name}</div>
            <div className="podium-score">{p.score || 0} pts</div>
            <div className="podium-block" style={{ height: HEIGHTS[pos] }}>
              <span className="podium-rank">#{pos + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
