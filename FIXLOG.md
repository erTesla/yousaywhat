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
| 3.1 | Word cloud games score 0 → session leaderboard flat while `gamesPlayed` climbs | `pages/Host.jsx` | DONE |
| 3.2 | `poll` offered in type picker but no editor exists in HostSetup — silently yields MCQ | `pages/Create.jsx`, `pages/HostSetup.jsx` | DONE |
| 3.3 | Score tally is 2N sequential round-trips; host closes tab mid-loop → partial credit | `pages/Host.jsx:196-204` | DONE |
| 3.4 | Teams reset every game — the thing sessions were meant to fix. `teamCode` not carried forward. | `components/TeamLobby.jsx`, `pages/SessionPlay.jsx` | DONE |

**3.1** — `revealAnswer` now awards a flat `WORDCLOUD_POINTS` (500) to anyone who submitted
text, so word-cloud rounds move the session leaderboard instead of leaving it flat.
**3.2** — removed the `poll` card from the picker rather than shipping a type with no editor.
Re-add it together with a real poll editor in HostSetup.
**3.3** — collapsed to one read of `sessions/{code}/players` plus a single atomic multi-path
`update()`, so a mid-tally tab close can no longer credit some players and skip others.
**3.4** — teams are now session-scoped. `TeamLobby` takes a `basePath` (`sessions/{code}` in a
session, `games/{pin}` otherwise); Play and Host read teams from that path, and the player's
`teamCode` is read from the session node. Teams and membership now survive between games.
Added rules for `sessions/{code}/teams` — anyone may create a team, but each player can only
write their own `members/{uid}` key, and `captainUid` must equal the writer. This is tighter
than the pre-existing `games/{pin}/teams` rule, which lets any member rewrite the whole node.

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
| 6.1 | Reactions cooldown lives in component state → remount each game resets the 3-per-3-min limit | `components/Reactions.jsx:12-13` | DONE |
| 6.2 | Chat's server-side cooldown rule is dead — `lastMessageAt` is never written anywhere | `components/Chat.jsx` | DONE |
| 6.3 | Reactions re-adds floaters for all recent entries on every change → duplicates | `components/Reactions.jsx:27-35` | DONE |
| 6.4 | `hostView` passed to `Reactions`, which doesn't accept it | `pages/Host.jsx:363` | DONE |
| 6.5 | Players never see the word cloud — `games/{pin}/answers` is host-read-only but Play promises "See the cloud!" | `pages/Play.jsx:231` | DONE |
| 6.6 | Chat/reactions are pin-keyed so history dies every game; waiting room is silent between games | — | WONTFIX |

**6.1** — cooldown state persists to `localStorage` keyed by uid (not pin), so moving between
games in a session no longer resets the limit. Wrapped in try/catch, degrading to in-memory.
**6.2** — `Chat.send` now writes `players/{uid}/lastMessageAt` after the push, so the existing
DB cooldown rule finally has a value to compare against. Written after the push so the rule
evaluates the previous timestamp. The host is exempt (no player node).
**6.3** — tracks last-floated `sentAt` per uid in a ref and only floats genuinely new
reactions. The first snapshot seeds state without floating, so joining a game no longer
replays a burst of everyone's recent reactions.
**6.5** — `games/{pin}/answers` is now readable by everyone while `status === 'reveal'` (the
correct answer is already public at that point). Play attaches an answers listener at reveal
and renders `<WordCloud>` for word-cloud questions, which previously showed "See the cloud!"
above an empty box because `choices` is `[]`. Word-cloud points now show too.
**6.6** — WONTFIX for now. Making chat/reactions session-scoped is a feature change, not a bug
fix: it needs a session-level chat path, new rules, and a decision about whether history should
carry across games at all. Logged as a follow-up rather than bundled in here.

---

## Round 2 — feature requests (2026-10-05)

| # | Request | Status |
|---|---------|--------|
| R1 | Host logged out of a game had no way to rejoin | DONE |
| R2 | Results combined every question instead of separating them | DONE |
| R3 | Team mode should be host-controlled; players only see team options when it's on | DONE |
| R4 | Voting poll reused the quiz UI; needs its own | DONE |
| R5 | Word cloud and poll should not be scored "games" | DONE |
| R6 | Host should be able to save a game for later and pick a saved one to play | DONE |
| R7 | UI should be properly marked/labelled | DONE |

**R1 — host password + rejoin.** The hash lives under `sessionAuth/{code}`, which has **no read
grant at all**, so no client can read it. The host proves the password by *writing* its hash to
`sessionAuth/{code}/claims/{uid}` — the rule accepts that write only if the value equals the
stored hash, so a successful write *is* the password check and nothing readable ever leaks. The
`sessions` write rule then honours any uid holding a claim, letting the new device take over.
Hash is salted with the session code. Verified: wrong password rejected, correct password
restores full control, no 64-hex string present in page state.
*Caveat:* Spark has no rate limiting, so a weak password is brute-forceable at one round-trip
per guess — hence the 4-char minimum. A longer password is genuinely safer here.

**R2 — per-question results.** `revealAnswer` now snapshots each question's responses to
`games/{pin}/history/{idx}` before the next question clears `answers`; `endGame` copies that
instead of rebuilding from stale live data. Word-cloud questions show their actual responses
with occurrence counts.

**R3 — team mode.** `sessions/{code}/teamMode`, toggled on the dashboard (persists across
games); one-off games get a checkbox in HostSetup. `TeamLobby` only renders when it's on. Host
sees teams read-only — players still self-organize, per your choice.

**R4/R5 — activities.** Word cloud and poll award no points, never touch the global leaderboard,
and increment `activitiesJoined` instead of `totalScore`/`gamesPlayed`. Ranking is quiz-only.
Poll has its own vote UI with live filling bars, a "no points" banner, a reveal that highlights
the winning option rather than correct/wrong, and an editor with no correct-answer radio.

**R6 — saved games.** `sessions/{code}/drafts`; "Save for later" in HostSetup, and a Saved Games
card on the dashboard with Play/Delete. Play builds the real game from the stored questions and
pushes session players in. Drafts survive replay.

**Bug found while building R4:** `pushQuestion` never wrote `type` into `currentQuestion`, so
Play and Host both treated every question as multiple choice — **word cloud had never rendered
for players at all**. Fixed.

### Verification
`npm run test:e2e` — **47/47 passing**, now also covering host rejoin (wrong + right password),
team-mode default-off, the poll editor, and saving/listing a game. Two earlier "failures" were
test bugs, not product bugs: the URL regex `/\/play\?/` also matched `/session/play?`, and a
label assertion raced the picker's auth-gated render.

---

## Round 3 — word cloud as its own flow (2026-10-05)

| # | Request | Status |
|---|---------|--------|
| W1 | No Reveal Answer button on a word cloud | DONE |
| W2 | Word cloud UI separate from the others; no question number | DONE |
| W3 | Only "save word cloud and go back to dashboard" | DONE |
| W4 | Current/saved cloud visible on the dashboard in a small view | DONE |
| W5 | Option to end the word cloud so player navigation is smooth | DONE |

A word cloud was running on the quiz's numbered-question → reveal → scoreboard
path. Now it has its own screen: the prompt large above a live cloud stage with a
running response count, no Q numbering, and no reveal or scoreboard step at all.
Two actions replace them — **Save & back to dashboard** (snapshots, leaves it
running, marked `live` on the dashboard) and **End word cloud** (snapshots, closes
it, releases players back to the session automatically).

Setup treats a word cloud as a single prompt: no numbering, no type dropdown, no
add-question buttons, prompt-style placeholder, and the launch button reads
"Open Word Cloud".

The dashboard gained a **Word Clouds** panel of small previews with word size
scaled by frequency; live clouds are badged and keep updating.

Players can now watch the cloud build after submitting (answers are readable while
a word cloud is live — there is no correct answer to leak) and get a plain
thank-you end screen with no scores.

**Bug caught by the test run:** players cannot read the game node, so every field
they need has its own public read rule — and `kind` was missing. The listener was
denied and defaulted to `'quiz'`, so a finished word cloud showed players the quiz
end screen ("You Won! 0 pts"). Host side and session tally were already correct,
which is exactly why it was invisible without a browser.

### Verification
`npm run test:e2e` — **57/57 passing**, now covering the single-prompt setup, the
absence of a reveal button, the save/end actions, the live response count, the
player activity end screen, and the dashboard mini cloud.

---

## Round 4 — activity polish, player navigation, compact chrome (2026-10-05)

| # | Request | Status |
|---|---------|--------|
| P1 | No confetti on word cloud ending | DONE |
| P2 | Poll: no reveal screen, just the graph and who polled | DONE |
| P3 | No confetti on poll | DONE |
| P4 | Option to return to dashboard from a poll | DONE |
| P5 | Starting any game switches every player to the waiting lobby | DONE |
| P6 | Players can exit a session/game to join another | DONE |
| P7 | Emoji strip right-side above the chat button | DONE |
| P8 | Leaving removes the player from the session | DONE |

**P1/P3 — confetti.** It was never word-cloud specific: confetti lives inside
`Podium`, and polls were falling through to the quiz ending, which rendered it.
Activities now never render `Podium`, so neither shows confetti.

**P2/P4 — poll flow.** Polls run as activities like word cloud: live bar graph
with a vote count and the leading option highlighted, no reveal, no scoreboard,
and **End poll** / **Save & back to dashboard**. Snapshots moved from
`sessions/{code}/clouds` to `sessions/{code}/activities` with a `type`, so the
dashboard panel (now **Activity Results**) renders clouds and poll bars alike.

**P5 — global follow.** `Play.jsx` watches `sessions/{code}/currentGamePin`;
starting a different game or ending the current one moves the player instead of
leaving them on a dead screen. Previously only the waiting room followed.

**P6/P8 — leaving.** Removes the roster entry (and that player's cumulative
session score), their team membership, and their record in the live game. Needed
a rules change: `sessions/{code}/players/{uid}` grants the owner write **only
when `newData` does not exist**, i.e. deletion only. Both exits are two-step
inline confirms, since this discards their standing.

**P7 — emoji strip.** Right-aligned directly above the chat button, smaller
glyphs, tighter spacing, shrinking again under 420px.

### Verification
`npm run test:e2e` — **77 checks**, covering the poll flow end to end, absence of
confetti on both activity endings, follow-on-start, the two-step leave with
roster removal and host count dropping, rejoin after leaving, and the emoji
strip's geometry relative to the chat button.

**Not verified:** the delete-only write grant was briefly "tested" by an injected
script that silently failed to get a Firebase app (`app/no-app`) and so passed
for the wrong reason. That check has been removed rather than left as a false
pass. The rule is reasoned — a value write makes `newData` exist at `$uid`, so the
delete-only grant is false and it falls through to the host-only ancestor — but it
has not been empirically confirmed.

---

## Round 5 — activity gating by question type, end-game control (2026-10-05)

| # | Request | Status |
|---|---------|--------|
| Q1 | Poll host screen still showed Reveal Answer | DONE |
| Q2 | Check word cloud for the same issue | DONE |
| Q3 | Host needs an option to end the game at any point | DONE |
| Q4 | When the host ends, players return to the lobby | DONE |

**Q1/Q2 — the gating bug.** The activity UI was keyed on the **game's** type, so
it only applied when the host picked the Poll or Word Cloud card. Switching a
question to poll or word cloud with the editor dropdown left `gameType` as
`'quiz'`, so the host got the whole quiz flow — Reveal Answer, correct/wrong,
scoreboard — for a question with no correct answer.

Gating now keys off the question on screen:
- A poll or word cloud question gets the live graph/cloud and never a reveal,
  whatever game surrounds it.
- A standalone activity game keeps End + Save to dashboard.
- An activity question inside a scored game advances with Next Question / End
  Game, recording responses via the extracted `questionHistory()` helper so
  per-question results stay correct without a reveal.
- A scored question in the same game still offers Reveal Answer — verified.

**Q3 — End control.** The host topbar now carries a two-step End available from
the lobby, mid-question, at reveal and at the scoreboard, routing to
`endActivity` or `endGame` as appropriate. Previously End Game was reachable only
from the final scoreboard, so a host mid-quiz had no way out.

**Q4 — players return to the lobby.** On a session game ending, players see their
result for 6 seconds with a visible countdown, then land back in the session
lobby automatically. The Back to Session button still skips the wait. Standalone
games are unchanged — there is no lobby to return to. *The 6-second pause is a
judgement call: returning instantly would mean nobody ever sees the podium.*

### Verification
`npm run test:e2e` — **102/102**. New coverage: poll via the editor dropdown,
word cloud via Add Word Cloud inside a 2-question quiz (asserting the scored
question still reveals while the activity one does not), End from the lobby and
mid-question with its confirm and cancel, and the player's countdown and
automatic return.

**Process note:** this bug shipped because my poll test only exercised the
dedicated Poll card — the path I had just built — rather than the editor dropdown
a user would reach for. Three bugs this session have now been found by running
the app rather than reading it. Prefer covering the user's route, not the
implementer's.

---

## Round 6 — optimization pass (2026-10-06)

Four parallel audits (duplication, performance, CSS, documentation). The headline
result: **most of the obvious "optimizations" were not worth doing, and the biggest
wins were bugs hiding inside the duplication.**

### Bugs found by deduplication
| Bug | Cause |
|---|---|
| Dashboard poll bars divided by `Math.max(counts)`, so the leader always drew 100% — a 60/40 split rendered as **100%/67%** beside the true counts | Reused the `max` variable that is correct for word-cloud font scaling |
| Host's **ended** poll screen did not highlight the winner while the live screen did — and the ended screen is the projected one | Copy drift between the two blocks |
| `isActivityType` defined twice with **incompatible contracts** (question object vs game-type string); the local shadowed the import | Renamed to `isActivityQuestion` |
| `.score-row`'s `animation: pop-in` was dead, overridden by a duplicate block | Split selector |
| `.home-right`'s media query preceded its base rule, so only `!important` worked | Ordering |

### Consolidated
`utils/poll.js` (`tallyChoices`, `pollBars`, `wordFrequency`) replaces nine inline
tallies · `components/Splash.jsx` replaces six identical copies ·
`components/ScoreRow.jsx` replaces four near-verbatim rows ·
`utils/display.js` replaces `MEDALS` in eight files.

### Performance
`Host.jsx` held one listener on `games/{pin}`, which also contains chat, reactions,
answers and history — so **every chat message re-delivered the whole game object**,
questions array included, and re-rendered the host view (~200–300 kB per round).
Now per-field listeners. The `Reactions` 1 s interval no longer runs forever.

### Documented
`database.rules.json` had **zero comments**. Added the two RTDB semantics that are
easy to get wrong, the player-read trap (with the two bugs it caused as evidence),
why `sessionAuth` is a sibling, the claim mechanism, and why the delete-only grant
is safe. Corrected **three false claims in the README**, including a security
guarantee about `hostSecret` that was wrong three ways, and the console-edit
instruction that destroyed the `feedbackSessions` rules.

### Deliberately NOT done
- **Code splitting** — Firebase is already per-module; the bundle is
  `@firebase/database` + `auth` + react-dom, all needed on first paint. ~10–15 kB
  gzipped for Suspense on every route.
- **Consolidating Play.jsx's 8 listeners** — would be a *security regression*: they
  are separate precisely so players never read `questions[].correct`.
- **CSS size** — 38 kB raw but **7.4 kB gzipped**, 4% of transfer.
- **Deleting dead CSS** — there is none; all 355 classes are in use.
- Lazy confetti (4 kB), the Timer's 100 ms tick (leaf component, keeps the bar
  smooth), word-cloud frequency dedup beyond the shared helper (no drift, no bug),
  merging the confirm-pill families (structurally different).

### Verification
102/102 after each phase. Net 477 insertions / 388 deletions across 17 files; CSS
2361 → 2341 lines with the duplicate-selector list down to two intentional size
overrides. No new lint errors.

**Not verified:** the pixel-shifting merges (tag pill padding, bar radii/alpha) are
asserted only by class name in the suite, not visually. Worth an eyeball on the host
graph, dashboard previews and type badges.

---

## Remaining / deferred

- **Host password + lost-URL rejoin (from the approved design) is still not built.** Recovery is
  same-browser-anonymous-uid only. This is the largest gap against what was agreed.
- **2.3 / 2.4 are mitigations, not fixes** — client-computed scores can't be trusted without a
  server, and Spark offers no rate limiting.
- **6.6** session-scoped chat/reactions.
---

## Browser verification (2026-10-05)

`npm run test:e2e` drives two browser contexts (host + player, separate anonymous uids) through
two full games in one session against the live site. **33/33 checks pass.**

Confirmed working end to end: session create → player joins by code → auto-join on launch →
answer → reveal → **scoreboard renders (0.1)** → end game → **player results page loads (0.3)**
→ cumulative session tally (3.3) → second game loop → Resume/Cancel (1.2) →
**score preserved across a mid-game rejoin (1.1)**. Zero `permission_denied`, zero JS errors.

The run found two bugs that code review had missed:

| Bug | Cause | Status |
|---|---|---|
| Joining by session code failed from the home page with a connection error | `Home.jsx` never called `useAuth()`, so it was unauthenticated — and Phase 2 changed `sessions` read from `true` to `auth != null`. My own regression. | DONE (`1ce7eda`) |
| "Mixed Session" card still advertised "poll questions" after 3.2 removed the poll type | Stale copy | DONE (`984f45e`) |

### Not covered by the test
- Team persistence across games (3.4) — needs a second player to form a team with.
- Word cloud scoring (3.1) and the player-visible cloud (6.5) — only MCQ games were played.
- Reactions cooldown persistence (6.1) and chat rate limit (6.2).
- Multi-device host password rejoin — not built yet.

### Test data left in the live DB
Each run creates a session plus two games, and one `globalLeaderboard` entry named
`TEST-Player`. One such entry (1,976 pts) is currently **#1 on the public leaderboard**.
Because of the monotonic `totalScore` guard added in 2.4, it cannot be deleted or zeroed from
the client — remove it in the Firebase Console under `globalLeaderboard`.
