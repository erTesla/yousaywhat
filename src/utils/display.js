// Presentation constants shared across pages.
// MEDALS was previously declared in eight files and the choice labels in two.

export const MEDALS = ['🥇', '🥈', '🥉'];

// Multiple-choice answer identity, consistent between the editor, the play
// screen and the results breakdown.
export const CHOICE_LABELS = ['A', 'B', 'C', 'D'];
export const CHOICE_SHAPES = ['▲', '◆', '●', '■'];
export const CHOICE_COLORS = ['ans-red', 'ans-blue', 'ans-yellow', 'ans-green'];

// Rank label for a zero-based position: a medal for the top three, else "#4".
export const rankLabel = i => (i < MEDALS.length ? MEDALS[i] : `#${i + 1}`);

// Rank class for a zero-based position, or '' outside the top three.
export const rankClass = i => (i < MEDALS.length ? `rank-${i + 1}` : '');
