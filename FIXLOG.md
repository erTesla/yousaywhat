# YouSayWhat — Audit Fix Log

Tracks every issue found in the 2026-10-05 four-way audit (session flow, DB rules, UI/CSS,
cross-feature regressions) and its fix status.

Status key: `DONE` fixed & deployed · `WIP` in progress · `TODO` not started · `WONTFIX` deliberate

---

## Phase 0 — Production-breaking (shipped before this log existed)

| # | Issue | File | Status |
|---|-------|------|--------|
| 0.1 | `TeamLeaderboard` destructured `playerList` but all 4 call sites pass `players` → `Scoreboard.map()` on undefined → white screen on EVERY scoreboard | `components/TeamLeaderboard.jsx:6` | DONE |
| 0.2 | `feedbackSessions` had no rule in repo; live rules were console-edited, so the new CI database deploy wiped them | `database.rules.json` | DONE |
| 0.3 | `results` had `.read` only on children; RTDB needs grant at/above read path → player results view always denied | `database.rules.json` | DONE |

Commit: `a20a479`

---

## Phase 1 — Critical session flow

| # | Issue | File | Status |
|---|-------|------|--------|
| 1.1 | Auto-join uses `set()` + `followedPin` useRef resets on mount → back button/reload/2nd tab wipes `score`/`lastPoints`/`teamCode`, player re-enters live game at 0. Inescapable loop. | `pages/SessionPlay.jsx:27-33` | DONE |
| 1.2 | Host locked out of running game — "Game in progress" is plain text, dashboard never fetches that game's secret. No Resume, no Cancel; session stuck `playing` forever. | `pages/SessionHost.jsx:68-72` | DONE |
| 1.3 | Session flipped to `playing` at game-CREATE time, before questions are authored. Host abandons setup → every player stranded permanently. | `pages/Create.jsx:65-73` | DONE |

**1.1** — join is now guarded: checks game `status !== 'ended'`, and only writes the player
node when it doesn't already exist, so a rejoin never clobbers `score`. The followed pin moved
from a `useRef` to `sessionStorage`, so returning to the waiting room shows a **Rejoin Game**
button instead of yanking the player forward in a loop.
**1.2** — `resumeGame()` fetches that game's `hostSecret` (the host already has read access to
`games/$pin`) and navigates back into `/host`. Added a **Cancel** button that clears
`currentGamePin`/`status`, and "Start New Game" is now disabled while a game is live.
**1.3** — the `playing` flip moved from `Create.jsx` to `HostSetup.handleLaunch`, after
questions are saved. Abandoning setup now leaves the session idle instead of stranding players.

## Phase 2 — Security

| # | Issue | File | Status |
|---|-------|------|--------|
| 2.1 | `players/$uid` write is unvalidated → player sets own `totalScore: 1e9`, tops both leaderboards | `database.rules.json` | DONE |
| 2.2 | `hostSecret` readable by anyone (`.read:true` cascades, `.read:false` is dead code) AND vestigial — written 3x, never read from DB | `database.rules.json`, `pages/SessionCreate.jsx:29` | DONE |
| 2.3 | Session enumeration — unauthenticated `.read:true` over a 180k keyspace harvests all player names/scores/history | `database.rules.json` | PARTIAL |
| 2.4 | `globalLeaderboard` same forge hole — add monotonic guard | `database.rules.json` | PARTIAL |

**2.1** — players can now only write `name` and `joinedAt`, each with a `.validate`.
`totalScore`/`gamesPlayed` have no player grant, so only the host (via the ancestor rule) can
write them. `SessionJoin.jsx` updated to stop sending score fields, which would now be denied
and fail the whole atomic `update()`.
**2.2** — `hostSecret` is no longer stored on the session node at all. Authorization was always
by `hostUid`; the URL secret is just an opaque bookmark token. Leak gone.
Note: `games/{pin}/hostSecret` is NOT a leak — `games/$pin/.read` is host-only, so there is no
public cascade there (its `.read:false` is inert but harmless), and Resume Game needs it.
**2.3** — PARTIAL. Changed `.read: true` → `.read: "auth != null"` and grew the keyspace from
180k to 540k (20→60 words). Anonymous auth is free to obtain, so a determined scraper can still
enumerate. A real fix needs server-side rate limiting, which Spark doesn't offer — accepting
this for a quiz app, but it should not hold anything sensitive.
**2.4** — PARTIAL. Added a monotonic guard (`totalScore` can't decrease) plus type/range
`.validate`. A player can still write an arbitrarily *high* score; scores are computed
client-side, so this is unfixable without a server. Mitigation only.

## Phase 3 — Scoring correctness

| # | Issue | File | Status |
|---|-------|------|--------|
| 3.1 | Word cloud games score 0 → session leaderboard flat while `gamesPlayed` climbs | `pages/Host.jsx` | TODO |
| 3.2 | `poll` offered in type picker but no editor exists in HostSetup — silently yields MCQ | `pages/Create.jsx`, `pages/HostSetup.jsx` | TODO |
| 3.3 | Score tally is 2N sequential round-trips; host closes tab mid-loop → partial credit | `pages/Host.jsx:196-204` | TODO |
| 3.4 | Teams reset every game — the thing sessions were meant to fix. `teamCode` not carried forward. | `components/TeamLobby.jsx`, `pages/SessionPlay.jsx` | TODO |

## Phase 4 — Robustness

| # | Issue | File | Status |
|---|-------|------|--------|
| 4.1 | Code collision → rule denies write, user sees "check your connection", no retry (~likely at 420 sessions) | `pages/SessionCreate.jsx:23` | DONE |

**4.1** — `handleCreate` now probes up to 5 candidate codes for an existing `hostUid` and only
`set()`s an unused one, with a distinct error if all 5 collide. Word list grew 20→60, so the
birthday-collision threshold moved from ~420 sessions to ~730.
| 4.2 | Permanent "Verifying…" spinner — no `.catch` on host verify | `pages/SessionHost.jsx:21`, `pages/Host.jsx:36` | DONE |
| 4.3 | `verified === false` is a bare text dead end; Host.jsx has a proper Access Denied card pattern | `pages/SessionHost.jsx:37` | DONE |
| 4.4 | `Create.jsx` doesn't uppercase `sessionCode` from URL → lowercase link writes a divergent node | `pages/Create.jsx` | DONE |

**4.2** — both verify calls now `.catch` into a connection-error splash instead of hanging.
**4.3** — SessionHost got the Access Denied card + Go Home button, matching `Host.jsx`.
**4.4** — `sessionCode` is uppercased on read in both `Create.jsx` and `HostSetup.jsx`.

## Phase 5 — UI / CSS

| # | Issue | File | Status |
|---|-------|------|--------|
| 5.1 | `.my-score-row` undefined — player can't spot own row (convention is `.score-row.highlight`) | `pages/SessionPlay.jsx:82` | DONE |
| 5.2 | `.sgr-left` undefined | `pages/SessionHost.jsx:100` | DONE |
| 5.3 | Status chip has no padding/radius (background flush against glyphs) and inherits `flex:1` into a column | `src/index.css` | DONE |
| 5.4 | `.pin-input` tuned for 6 digits (`letter-spacing:8px`) clips 10-char codes at phone width; no uppercase transform | `src/index.css`, `pages/Home.jsx` | DONE |
| 5.5 | No copy/share button for the session code — the one thing the feature hangs on | `pages/SessionHost.jsx` | DONE |
| 5.6 | Breakpoint drift — session pages use 600px, app uses 700/480 | `src/index.css` | DONE |
| 5.7 | Dashboard past-games list links nowhere | `pages/SessionHost.jsx:102-113` | DONE |

**5.1** — switched to the existing `.score-row.highlight` convention rather than adding a class.
**5.2/5.3** — defined `.sgr-left`; re-pilled the status chip inside `.session-host-meta`
(`flex: 0 0 auto`, padding, `border-radius: 999px`) so it no longer stretches or smears.
**5.4** — `.pin-input` gets `text-transform: uppercase`, and tracking steps down at 480px/360px
so a 12-char code can't clip.
**5.5** — Copy button next to the code, with a 2s "✓ Copied" confirmation.
**5.7** — past-game rows are now links to `/results?pin=…` with a hover state.

## Phase 6 — Cross-feature

| # | Issue | File | Status |
|---|-------|------|--------|
| 6.1 | Reactions cooldown lives in component state → remount each game resets the 3-per-3-min limit | `components/Reactions.jsx:12-13` | TODO |
| 6.2 | Chat's server-side cooldown rule is dead — `lastMessageAt` is never written anywhere | `components/Chat.jsx` | TODO |
| 6.3 | Reactions re-adds floaters for all recent entries on every change → duplicates | `components/Reactions.jsx:27-35` | TODO |
| 6.4 | `hostView` passed to `Reactions`, which doesn't accept it | `pages/Host.jsx:363` | TODO |
| 6.5 | Players never see the word cloud — `games/{pin}/answers` is host-read-only but Play promises "See the cloud!" | `pages/Play.jsx:231` | TODO |
| 6.6 | Chat/reactions are pin-keyed so history dies every game; waiting room is silent between games | — | TODO |
