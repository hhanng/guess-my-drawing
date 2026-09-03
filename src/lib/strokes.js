import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export function strokesCol(code) {
  return collection(db, "rooms", code, "strokes");
}

export async function writeStrokePoints(code, points) {
  if (!points.length) return;
  const batch = writeBatch(db);
  for (const point of points) {
    batch.set(doc(strokesCol(code)), point);
  }
  await batch.commit();
}

export async function readStrokePoints(code, round) {
  const snap = await getDocs(query(strokesCol(code), where("round", "==", round)));
  const points = snap.docs.map((d) => d.data());
  points.sort((a, b) => a.seq - b.seq);
  return points;
}

export function listenStrokes(code, round, cb) {
  const q = query(strokesCol(code), where("round", "==", round));
  return onSnapshot(q, (snap) => {
    const points = snap.docs.map((d) => d.data());
    points.sort((a, b) => a.seq - b.seq);
    cb(points);
  });
}

export async function clearStrokes(code) {
  const snap = await getDocs(strokesCol(code));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}
