# YouSayWhat? 🎯

**The free, open-source, self-hosted alternative to Kahoot** — built on React and Firebase.

Run a live, real-time quiz game for any audience, on any device, at zero cost.  
No subscriptions. No player limits. No account required to play.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![Firebase](https://img.shields.io/badge/Firebase-Spark%20(free)-orange)](https://firebase.google.com/pricing)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)

---

## Why YouSayWhat?

| Feature | Kahoot (free plan) | **YouSayWhat** |
|---|---|---|
| Cost | Free with limits | **100% free, forever** |
| Player limit | 10 players (free) | **Unlimited** |
| Account to play | Required | **No account needed** |
| Self-hosted | ❌ | **✅ you own your data** |
| Question limit | Limited | **Unlimited** |
| Open source | ❌ | **✅ MIT licensed** |
| Ads | Yes | **No** |
| Offline / LAN mode | ❌ | **✅ built-in** |

YouSayWhat runs entirely on **Firebase's free Spark plan** — no paid tier, no cloud functions, no server to maintain. Deploy once and run forever.

---

## Features

- **Real-time multiplayer** — answers and scores update live as players respond
- **Host from any browser** — no app install, works on phone, tablet, or laptop
- **Join with a PIN** — players enter a 6-digit code, no account or login needed
- **Speed-based scoring** — faster correct answers earn more points (up to 2000 per question)
- **Tamper-proof hosting** — host URL uses a 256-bit secret; impersonation attempts are logged and alerted in real time
- **Question editor** — build quizzes in-browser with 4-choice questions, per-question time limits, and sample questions to start from
- **JSON import / export** — load questions from a `.json` file or export your quiz to share or reuse
- **Live leaderboard** — scoreboard shown between every question
- **LAN / offline mode** — a built-in local server lets you run the full game on a local network without any internet connection or Firebase account

---

## Demo

> Host screen — waiting for players to join with the PIN

```
┌─────────────────────────────────────────────┐
│  PIN: 482 916          LOBBY        4 👥    │
├─────────────────────────────────────────────┤
│                                             │
│   Waiting for players…                      │
│                                             │
│   [Alice]  [Bob]  [Carol]  [Dave]           │
│                                             │
│   5 questions loaded                        │
│                                             │
│            [ Start Game ]                  │
└─────────────────────────────────────────────┘
```

> Player screen — answering a question

```
┌─────────────────────────────────────────────┐
│  1240 pts                             12s   │
├─────────────────────────────────────────────┤
│                                             │
│   Which planet is closest to the Sun?       │
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  ▲  Venus    │  │  ◆  Mars     │        │
│  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  ●  Mercury  │  │  ■  Earth    │        │
│  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────┘
```

---

## Quick start (local, no Firebase needed)

```bash
git clone https://github.com/erTesla/yousaywhat.git
cd yousaywhat
npm install
npm run dev:mock
```

Open `http://localhost:5173` — the full game runs locally with no cloud account.  
Other devices on the same Wi-Fi can join using the **Network** URL printed in the terminal.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Vite |
| Database | Firebase Realtime Database |
| Auth | Firebase Anonymous Auth |
| Hosting | Firebase Hosting |
| Local dev | Node.js WebSocket server (no Firebase needed) |
| Styling | Vanilla CSS (no framework dependency) |

Everything runs client-side. There are **no Cloud Functions** — the app stays within Firebase's free Spark plan indefinitely.

---

## Running locally (no Firebase account)

The local mock mode runs a tiny WebSocket server on your machine instead of Firebase. The full game — including multi-device play — works on any LAN without an internet connection.

### Start

```bash
npm run dev:mock
```

This starts two processes at once:

| Process | Port | Role |
|---|---|---|
| Mock DB server | 3001 | Shared in-memory database, persisted to `mock-db.json` |
| Vite dev server | 5173 | React app, accessible to all LAN devices |

The terminal shows your addresses:

```
[server]   Network: ws://192.168.1.45:3001
[vite]  ➜  Network: http://192.168.1.45:5173   ← share this with players
```

### Multi-device testing

1. **Tab 1** → `http://localhost:5173` → **Create a game**
2. **Tab 2 or another device** on the same Wi-Fi → Network URL → enter the PIN → join

Each browser tab gets a unique player identity automatically (stored in `sessionStorage`).

### Resetting the database

```bash
# Via browser
http://localhost:3001/reset

# Via terminal — delete the file and restart
del mock-db.json        # Windows
rm  mock-db.json        # Mac / Linux
```

### Pre-seeding data

Edit `src/mock/seed.json` to pre-populate a game. The server loads this file on first run (before `mock-db.json` exists).

---

## Setting up Firebase (for production)

### 1 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → enter a name → Continue
3. Disable Google Analytics (not required) → **Create project**

### 2 — Enable Anonymous Authentication

1. **Build → Authentication → Get started**
2. **Sign-in method** tab → **Anonymous** → Enable → **Save**

### 3 — Enable Realtime Database

1. **Build → Realtime Database → Create database**
2. Choose the region closest to your users
3. Start in **test mode** for now (rules are applied in the next step)

### 4 — Apply security rules

1. Realtime Database → **Rules** tab
2. Replace all content with the contents of [`database.rules.json`](./database.rules.json)
3. **Publish**

What the rules enforce:

- Only the host (`auth.uid === hostUid`) can control game flow
- `hostSecret` has `.read: false` — no client can ever read it
- Players can only write their own record (`players/$uid`) and their own answer
- Answers are writable only while `status === "question"`
- Tamper attempts are logged to `tamperLog`, readable only by the host

### 5 — Get your Firebase config

1. Project settings → **General** → scroll to **Your apps**
2. **Add app → Web** → register the app → copy the `firebaseConfig` values

### 6 — Create `.env.local`

```bash
cp .env.example .env.local   # Mac / Linux
copy .env.example .env.local  # Windows
```

Fill in your values:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123
```

### 7 — Run against real Firebase

```bash
npm run dev
```

---

## Deploying to Firebase Hosting

### 1 — Install the Firebase CLI

```bash
npm install -g firebase-tools
```

### 2 — Log in

```bash
firebase login
```

### 3 — Set your project ID

Edit `.firebaserc`:

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

### 4 — Build and deploy

```bash
npm run build
firebase deploy
```

This deploys both the **React app** (Hosting) and the **security rules** (Database) in one command.

Your app will be live at `https://your-project-id.web.app`.

**Deploy only the app** (skip rules):
```bash
firebase deploy --only hosting
```

**Deploy only the rules** (skip app):
```bash
firebase deploy --only database
```

---

## NPM scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with real Firebase (needs `.env.local`) |
| `npm run dev:mock` | Dev server + local WebSocket mock server — no Firebase needed |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## Question JSON format

Questions can be imported and exported as a `.json` file from the **Create Your Quiz** screen using the **Import JSON** and **Export JSON** buttons.

### Format

The file must be a JSON array where each element is a question object:

```json
[
  {
    "text": "Which planet is closest to the Sun?",
    "choices": ["Venus", "Mars", "Mercury", "Earth"],
    "correct": 2,
    "timeLimit": 20
  },
  {
    "text": "What is 12 × 12?",
    "choices": ["132", "144", "124", "148"],
    "correct": 1,
    "timeLimit": 15
  }
]
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | ✅ | The question text shown to players |
| `choices` | string[4] | ✅ | Exactly 4 answer options |
| `correct` | integer | ✅ | Zero-based index of the correct answer (`0` = A, `1` = B, `2` = C, `3` = D) |
| `timeLimit` | number | optional | Seconds players have to answer. Defaults to `20` if omitted. Supported values: `10`, `15`, `20`, `30`, `45`, `60` |

### Rules

- The root value must be a JSON **array** (not an object)
- Every question must have exactly **4 choices** — no more, no fewer
- `correct` must be an integer between `0` and `3` inclusive
- All strings must be non-empty
- Importing replaces the current question list entirely

### Minimal example (timeLimit omitted, defaults to 20 s)

```json
[
  {
    "text": "What colour is the sky?",
    "choices": ["Red", "Green", "Blue", "Yellow"],
    "correct": 2
  }
]
```

---

## How the game works

```
Host                                   Players
──────────────────────────────────────────────────────────────
Create quiz  (HostSetup page)
  └─ generates 6-digit PIN
  └─ generates 256-bit secret
  └─ writes game to Firebase RTDB
  └─ redirects to /host?pin=X&secret=Y

Lobby: display PIN ──────────────────  /join?pin=X  →  enter name
                                         └─ writes to players/{uid}

[ Start Game ]
  └─ status → "question"
  └─ pushes question text + choices ──  See question + countdown timer
     (correct answer never sent)          └─ tap an answer
                                           └─ writes to answers/{uid}
                                              { choice, elapsed }

[ Reveal Answer ]
  └─ reads all answers/{uid}
  └─ calculates scores:
       correct → 1000 + speed bonus
       wrong   → 0
  └─ writes scores to players/{uid}
  └─ status → "reveal" ───────────────  See correct answer + points earned

[ Show Scoreboard ]
  └─ status → "scoreboard" ───────────  See leaderboard + your rank

[ Next Question ] or [ End Game ]
  └─ repeat or status → "ended" ──────  Final results
```

---

## Security model

| Threat | Mitigation |
|---|---|
| Guessing the host URL | Host URL contains a 256-bit random secret — 2²⁵⁶ possible values |
| Reading the secret from the DB | `hostSecret` field has `.read: false` in DB rules |
| Impersonating the host | All host writes require `auth.uid === hostUid` enforced by DB rules |
| Tamper attempts | Logged to `tamperLog` with UID, timestamp, and user agent; host sees real-time alerts |
| Submitting answers out of turn | `answers/$uid` is only writable when `status === "question"` |
| Faking another player's answer | `answers/$uid` write requires `auth.uid === $uid` |
| Manipulating scores | Scores are calculated and written exclusively by the host client |

---

## Contributing

Contributions are welcome. Some ideas if you want to help:

- **Image/media questions** — attach a photo to a question
- **Question import** — CSV or JSON bulk upload
- **Custom themes** — colour schemes beyond the default dark mode
- **Team mode** — group players into teams with a shared score
- **Answer streaks** — bonus points for consecutive correct answers
- **QR code** — show a QR code on the lobby screen to make joining easier

To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes
4. Open a pull request

---

## License

MIT — free to use, modify, and deploy for personal or commercial projects.  
See [LICENSE](./LICENSE) for the full text.

---

*YouSayWhat is not affiliated with Kahoot. Kahoot is a registered trademark of Kahoot AS.*
