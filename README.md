# Guess My Drawing

[![CI](https://github.com/hhanng/guess-my-drawing/actions/workflows/ci.yml/badge.svg)](https://github.com/hhanng/guess-my-drawing/actions/workflows/ci.yml)

Real-time multiplayer Pictionary where the drawer draws with a hand-tracked neon
trail (MediaPipe HandLandmarker) and everyone else guesses in a text chat. The
drawing engine is ported from the `neonpoint` project.

## Stack

- React + Vite
- Firebase Firestore for real-time sync (rooms, live strokes, guesses, scores)
- `@mediapipe/tasks-vision` HandLandmarker for hand tracking

## Setup

```bash
npm install
cp .env.example .env   # then fill in your Firebase web app config
npm run dev
```

Open the printed URL. Use a webcam-capable browser (Chrome recommended). Open a
second browser / device and join with the room code to test multiplayer.

### Test harnesses

Dev-only pages under `test/` (not part of the app bundle), run against the dev
server:

- `test/e2e.html` — drives the real `lib/` modules through a full game against
  the Firestore project in `.env`: room create/join, live player-list sync,
  stroke write/stream/read, correct-guess scoring, timeout, drawer rotation,
  idempotency of the round-end paths, game-over, play-again. Creates and then
  deletes a throwaway room.
- `test/handtracking-smoke.html` — confirms the ported `handTracking.js` /
  `neonRender.js` load, that `createHandDrawer` boots the MediaPipe
  HandLandmarker, and that the render helpers run without throwing. No webcam
  or Firebase needed.

### Firebase

1. Create a Firebase project and add a **Web app**.
2. Enable **Cloud Firestore**.
3. Copy the config values into `.env` (all keys are `VITE_`-prefixed so Vite
   exposes them to the client).

`.env` is gitignored, so keys stay out of the repo and its history. Note that a
Firebase **web** config is not a secret: Vite inlines these values into the
built JS, so anything deployed (see below) ships the config in plain text. That
is expected for client-side Firebase — the real access boundary is the Firestore
security rules, not the config.

### Firestore security rules

[`firestore.rules`](firestore.rules) locks access to the `/rooms` tree only and
shape/size-checks every write. There is no auth, so it can't gate on a user —
it's "reasonable for a public demo", not production-grade. Publish it either way:

```bash
npx firebase-tools deploy --only firestore:rules   # uses .firebaserc + firebase.json
```

or paste the file into **Firebase console → Firestore → Rules → Publish**. Do
this before the 30-day test-mode rules expire.

## Deployment (GitHub Pages)

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
it builds with Vite and publishes `dist/` to GitHub Pages. The Firebase config is
injected at build time from repo **Actions secrets** (`VITE_FIREBASE_*`), so `.env`
is never needed in CI. `vite.config.js` sets `base: "./"` so the hashed asset
paths resolve under the `/guess-my-drawing/` project-pages subpath.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Live: **https://vuhanhan.com/guess-my-drawing/**
(the account has a user-level custom domain; `https://hhanng.github.io/guess-my-drawing/`
redirects there).

## How to play

1. One player **creates a room** and shares the 4-character code.
2. Others **join** with the code and a name. The player list syncs live.
3. Host **starts the game**. Each round one player is the drawer.
4. **Drawer** raises their **left hand**, holds the **index finger extended for
   1 second** to start a neon stroke (a progress ring fills at the fingertip),
   then moves the fingertip to draw. **Pinch thumb + index** to pause; re-extend
   within a short grace window to resume without re-holding.
5. **Guessers** see the strokes stream onto their own canvas and the word as
   blanks (`_ _ _`). They type guesses in the chat.
6. First **case-insensitive correct guess** scores both the guesser (+2) and the
   drawer (+1) and ends the round. A 90s timer ends the round with no winner.
7. The drawer role rotates to the next player each round. After one full
   rotation the **final leaderboard** shows.

## Data model

```
rooms/{code}
  code, status: lobby | playing | round-end | game-over
  hostId
  players: [{ id, name, score }]
  currentDrawerId, currentWord
  roundNumber, totalRounds
  roundEndsAt            (client epoch ms; see round-end handling below)
  lastRoundResult: { winnerId, winnerName, word, timedOut }
  createdAt

rooms/{code}/strokes/{autoId}
  round, s (stroke index), seq (monotonic), x, y (normalized 0..1), t

rooms/{code}/guesses/{autoId}
  playerId, name, text, round, correct, createdAt
```

Stroke points are buffered on the drawer and flushed to Firestore in batched
writes (~150ms). Guessers group points by `s` into polylines and render the same
layered-bloom neon style.

### Round-end / disconnect handling

- A correct guess runs a transaction that awards points and sets
  `status: "round-end"`.
- Every client watches `roundEndsAt`. The drawer fires `endRoundByTimeout` on
  time; other clients fire it ~4s later as a fallback, so a drawer who
  disconnects or refreshes can't softlock the round. The call is a
  status-guarded transaction, so a race just no-ops.
- On the round-end screen the host advances the round; if the host is absent,
  any player gets the "Next round" button after ~8s.
- A drawer who refreshes mid-round re-seeds their canvas from the strokes
  already in Firestore and continues with offset stroke ids.

## Known MVP limitations

- `currentWord` lives on the room doc, so a determined guesser could read it in
  devtools. The UI never shows it to non-drawers. Truly hiding it needs Cloud
  Functions or a private subcollection with security rules.
- `roundEndsAt` uses wall-clock time from whichever client set it; no server
  clock, so a few seconds of skew between players is possible.
- No auth — identity is a random id in `localStorage`.
- No presence tracking: a player who leaves stays in the score list and the
  drawer rotation. If an absent player's turn comes up, that round just runs
  out the clock and auto-advances.
- Old strokes are deleted between rounds with client-side batch deletes.
