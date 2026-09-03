import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export function guessesCol(code) {
  return collection(db, "rooms", code, "guesses");
}

export async function sendGuess(code, { playerId, name, text, round, correct }) {
  await addDoc(guessesCol(code), {
    playerId,
    name,
    text,
    round,
    correct,
    createdAt: serverTimestamp(),
  });
}

export function listenGuesses(code, cb) {
  const q = query(guessesCol(code), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
