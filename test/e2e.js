// End-to-end harness for the Firestore-backed game logic. Exercises the real
// lib/ modules against the live project in .env. Open /test/e2e.html via the
// dev server; results print to the console (prefix [E2E]) and the page.
//
// This is a dev/test-only file and is intentionally not part of the app bundle.

import { collection, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "/src/lib/firebase.js";
import {
  advanceRound,
  createRoom,
  endRoundByTimeout,
  joinRoom,
  listenRoom,
  playAgain,
  roomRef,
  startGame,
  submitCorrectGuess,
} from "/src/lib/rooms.js";
import {
  listenStrokes,
  readStrokePoints,
  writeStrokePoints,
} from "/src/lib/strokes.js";
import { listenGuesses, sendGuess } from "/src/lib/guesses.js";
import { isCorrectGuess, nextDrawerId } from "/src/lib/game.js";

const out = document.getElementById("out");
let passed = 0;
let failed = 0;

function log(kind, msg) {
  const line = document.createElement("div");
  line.className = kind;
  line.textContent = `${kind === "pass" ? "PASS" : kind === "fail" ? "FAIL" : "··· "} ${msg}`;
  out.appendChild(line);
  console.log(`[E2E] ${kind.toUpperCase()} ${msg}`);
}
function check(cond, msg) {
  if (cond) {
    passed += 1;
    log("pass", msg);
  } else {
    failed += 1;
    log("fail", msg);
  }
}
const info = (msg) => log("info", msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(getValue, predicate, { timeout = 8000, label = "condition" } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      let v;
      try {
        v = getValue();
      } catch (err) {
        return reject(err);
      }
      if (predicate(v)) return resolve(v);
      if (Date.now() - started > timeout) {
        return reject(new Error(`timeout waiting for ${label}`));
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

async function deleteCollection(path) {
  const snap = await getDocs(collection(db, path));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

async function cleanup(code) {
  try {
    await deleteCollection(`rooms/${code}/strokes`);
    await deleteCollection(`rooms/${code}/guesses`);
    await deleteDoc(roomRef(code));
    info(`cleaned up room ${code}`);
  } catch (err) {
    info(`cleanup failed for ${code}: ${err.message}`);
  }
}

async function run() {
  // --- pure helpers (no network) ---
  check(isCorrectGuess("  APPLE ", "apple"), "isCorrectGuess: case/space insensitive match");
  check(!isCorrectGuess("apples", "apple"), "isCorrectGuess: rejects near-miss");
  check(
    nextDrawerId([{ id: "a" }, { id: "b" }, { id: "c" }], "c") === "a",
    "nextDrawerId: wraps around"
  );

  const HOST = "e2e_host_" + Math.random().toString(36).slice(2, 7);
  const P2 = "e2e_p2_" + Math.random().toString(36).slice(2, 7);
  let code;
  let room = null;
  let unsubRoom = () => {};

  try {
    // --- 1. Firestore write + read: create room ---
    code = await createRoom({ hostId: HOST, hostName: "Host" });
    check(typeof code === "string" && code.length >= 4, `createRoom returned code ${code}`);

    unsubRoom = listenRoom(code, (data) => {
      room = data;
    });
    await waitFor(() => room, (r) => r && r.code === code, { label: "initial room snapshot" });
    check(room.status === "lobby", "new room status is lobby");
    check(room.players.length === 1 && room.players[0].id === HOST, "host is in players list");

    // --- 2. Live player-list sync: second player joins ---
    await joinRoom({ code, playerId: P2, name: "Bob" });
    await waitFor(
      () => room,
      (r) => r.players.length === 2,
      { label: "player list sync to 2" }
    );
    check(
      room.players.some((p) => p.id === P2 && p.name === "Bob"),
      "joiner appears in synced player list"
    );
    await joinRoom({ code, playerId: P2, name: "Bob" });
    await sleep(400);
    check(room.players.length === 2, "re-join is idempotent (no duplicate player)");

    // --- 3. Start round ---
    await startGame({ code });
    await waitFor(() => room, (r) => r.status === "playing", { label: "status playing" });
    check(room.roundNumber === 1, "round number is 1");
    check(room.totalRounds === 2, "totalRounds = players * ROUNDS_PER_PLAYER (2)");
    check(!!room.currentWord, "a word was assigned");
    check(room.currentDrawerId === HOST, "first drawer is first player (host)");
    check(typeof room.roundEndsAt === "number", "roundEndsAt timestamp set");
    const round1Word = room.currentWord;

    // --- 3b. Stroke-write path: drawer streams points ---
    let liveStrokes = [];
    const unsubStrokes = listenStrokes(code, 1, (pts) => {
      liveStrokes = pts;
    });
    const points = [];
    for (let i = 1; i <= 12; i += 1) {
      points.push({ round: 1, s: 1, seq: i, x: i / 20, y: 0.5, t: Date.now() + i });
    }
    // shuffle write order to prove seq-sorting on read
    await writeStrokePoints(code, [...points].reverse());
    await waitFor(() => liveStrokes, (s) => s.length === 12, { label: "12 stroke points streamed" });
    check(
      liveStrokes.every((p, i) => i === 0 || p.seq >= liveStrokes[i - 1].seq),
      "listenStrokes returns points sorted by seq"
    );
    const readback = await readStrokePoints(code, 1);
    check(readback.length === 12, "readStrokePoints (drawer-refresh seed) returns all points");
    unsubStrokes();

    // --- 3c. Guess feed sync ---
    let liveGuesses = [];
    const unsubGuesses = listenGuesses(code, (g) => {
      liveGuesses = g;
    });
    await sendGuess(code, { playerId: P2, name: "Bob", text: "banana", round: 1, correct: false });
    await waitFor(() => liveGuesses, (g) => g.length === 1, { label: "guess feed sync" });
    check(liveGuesses[0].text === "banana", "wrong guess appears in synced feed");

    // --- 4a. Round-end via correct guess ---
    const scored = await submitCorrectGuess({ code, guesserId: P2 });
    check(scored === true, "submitCorrectGuess returns true");
    await waitFor(() => room, (r) => r.status === "round-end", { label: "status round-end" });
    const p2Score = room.players.find((p) => p.id === P2).score;
    const hostScore = room.players.find((p) => p.id === HOST).score;
    check(p2Score === 2, "guesser awarded GUESSER_POINTS (2)");
    check(hostScore === 1, "drawer awarded DRAWER_POINTS (1)");
    check(room.lastRoundResult?.winnerId === P2, "lastRoundResult records the winner");
    check(room.lastRoundResult?.word === round1Word, "lastRoundResult reveals the word");

    // --- 4b. Idempotency: a second correct guess after round ended (race / drawer gone) ---
    const scoredAgain = await submitCorrectGuess({ code, guesserId: P2 });
    check(scoredAgain === false, "submitCorrectGuess no-ops once status !== playing");
    await sleep(300);
    check(
      room.players.find((p) => p.id === P2).score === 2,
      "scores unchanged by the second correct guess"
    );
    unsubGuesses();

    // --- 5. advanceRound: rotate drawer + clear strokes ---
    await advanceRound({ code });
    await waitFor(() => room, (r) => r.roundNumber === 2, { label: "advance to round 2" });
    check(room.status === "playing", "round 2 is playing");
    check(room.currentDrawerId === P2, "drawer rotated to next player");
    const strokesAfterAdvance = await readStrokePoints(code, 1);
    check(strokesAfterAdvance.length === 0, "previous round's strokes were cleared");

    // --- 4c. Timeout path (this is the non-drawer fallback in the UI) ---
    await endRoundByTimeout({ code });
    await waitFor(() => room, (r) => r.status === "round-end", { label: "timeout -> round-end" });
    check(room.lastRoundResult?.timedOut === true, "timeout sets lastRoundResult.timedOut");
    const scoresBeforeDoubleTimeout = JSON.stringify(room.players);
    await endRoundByTimeout({ code });
    await sleep(300);
    check(
      JSON.stringify(room.players) === scoresBeforeDoubleTimeout,
      "endRoundByTimeout is idempotent (safe for every-client fallback)"
    );

    // --- 6. Final round -> game over -> play again ---
    await advanceRound({ code });
    await waitFor(() => room, (r) => r.status === "game-over", {
      label: "game over after last round",
    });
    check(room.roundNumber === 2, "stayed on final round number at game-over");

    await playAgain({ code });
    await waitFor(() => room, (r) => r.status === "lobby", { label: "playAgain -> lobby" });
    check(
      room.players.every((p) => p.score === 0),
      "playAgain resets all scores to 0"
    );
  } catch (err) {
    failed += 1;
    log("fail", `EXCEPTION: ${err && err.stack ? err.stack : err}`);
  } finally {
    unsubRoom();
    if (code) await cleanup(code);
  }

  const summary = `DONE — ${passed} passed, ${failed} failed`;
  log(failed === 0 ? "pass" : "fail", summary);
  document.title = `E2E ${failed === 0 ? "OK" : "FAIL"} ${passed}/${passed + failed}`;
  window.__E2E_DONE__ = { passed, failed };
}

run();
