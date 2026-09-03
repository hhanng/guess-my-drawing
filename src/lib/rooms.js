import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { clearStrokes } from "./strokes";
import { pickWord } from "./wordBank";
import {
  DRAWER_POINTS,
  GUESSER_POINTS,
  MIN_PLAYERS,
  ROUNDS_PER_PLAYER,
  ROUND_SECONDS,
  nextDrawerId,
} from "./game";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(length = 4) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function roomRef(code) {
  return doc(db, "rooms", code);
}

export async function createRoom({ hostId, hostName }) {
  let code = makeCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snap = await getDoc(roomRef(code));
    if (!snap.exists()) break;
    code = makeCode();
  }
  await setDoc(roomRef(code), {
    code,
    status: "lobby",
    hostId,
    players: [{ id: hostId, name: hostName, score: 0 }],
    currentDrawerId: null,
    currentWord: null,
    roundNumber: 0,
    totalRounds: 0,
    roundEndsAt: null,
    lastRoundResult: null,
    createdAt: serverTimestamp(),
  });
  return code;
}

export async function joinRoom({ code, playerId, name }) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error("Room not found");
    const data = snap.data();
    const players = data.players ?? [];
    if (players.some((p) => p.id === playerId)) return;
    players.push({ id: playerId, name, score: 0 });
    tx.update(roomRef(code), { players });
  });
}

export function listenRoom(code, cb) {
  return onSnapshot(roomRef(code), (snap) => cb(snap.exists() ? snap.data() : null));
}

export async function startGame({ code }) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    const data = snap.data();
    const players = data.players ?? [];
    if (players.length < MIN_PLAYERS) throw new Error("Need at least 2 players");
    tx.update(roomRef(code), {
      status: "playing",
      roundNumber: 1,
      totalRounds: players.length * ROUNDS_PER_PLAYER,
      currentDrawerId: players[0].id,
      currentWord: pickWord(),
      roundEndsAt: Date.now() + ROUND_SECONDS * 1000,
      lastRoundResult: null,
    });
  });
  await clearStrokes(code);
}

export async function submitCorrectGuess({ code, guesserId }) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    const data = snap.data();
    if (data.status !== "playing") return false;
    const drawerId = data.currentDrawerId;
    if (guesserId === drawerId) return false;

    const players = data.players.map((p) => {
      if (p.id === guesserId) return { ...p, score: p.score + GUESSER_POINTS };
      if (p.id === drawerId) return { ...p, score: p.score + DRAWER_POINTS };
      return p;
    });
    const guesser = data.players.find((p) => p.id === guesserId);

    tx.update(roomRef(code), {
      status: "round-end",
      players,
      roundEndsAt: null,
      lastRoundResult: {
        winnerId: guesserId,
        winnerName: guesser?.name ?? "Someone",
        word: data.currentWord,
        timedOut: false,
      },
    });
    return true;
  });
}

export async function endRoundByTimeout({ code }) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    const data = snap.data();
    if (data.status !== "playing") return;
    tx.update(roomRef(code), {
      status: "round-end",
      roundEndsAt: null,
      lastRoundResult: {
        winnerId: null,
        winnerName: null,
        word: data.currentWord,
        timedOut: true,
      },
    });
  });
}

export async function advanceRound({ code }) {
  let didAdvance = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    const data = snap.data();
    if (data.status !== "round-end") return;

    if (data.roundNumber >= data.totalRounds) {
      tx.update(roomRef(code), { status: "game-over", roundEndsAt: null });
      return;
    }

    tx.update(roomRef(code), {
      status: "playing",
      roundNumber: data.roundNumber + 1,
      currentDrawerId: nextDrawerId(data.players, data.currentDrawerId),
      currentWord: pickWord(data.currentWord),
      roundEndsAt: Date.now() + ROUND_SECONDS * 1000,
      lastRoundResult: null,
    });
    didAdvance = true;
  });
  if (didAdvance) await clearStrokes(code);
}

export async function playAgain({ code }) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    const data = snap.data();
    tx.update(roomRef(code), {
      status: "lobby",
      players: data.players.map((p) => ({ ...p, score: 0 })),
      currentDrawerId: null,
      currentWord: null,
      roundNumber: 0,
      totalRounds: 0,
      roundEndsAt: null,
      lastRoundResult: null,
    });
  });
  await clearStrokes(code);
}
