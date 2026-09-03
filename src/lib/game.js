export const GUESSER_POINTS = 2;
export const DRAWER_POINTS = 1;
export const ROUNDS_PER_PLAYER = 1;
export const ROUND_SECONDS = 90;
export const MIN_PLAYERS = 2;

export function normalizeGuess(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCorrectGuess(guess, word) {
  if (!word) return false;
  return normalizeGuess(guess) === normalizeGuess(word);
}

export function nextDrawerId(players, currentDrawerId) {
  const i = players.findIndex((p) => p.id === currentDrawerId);
  const next = players[(i + 1) % players.length];
  return next.id;
}

export function maskWord(word) {
  if (!word) return "";
  return word
    .split("")
    .map((c) => (c === " " ? "  " : "_"))
    .join(" ");
}

export function sortedByScore(players) {
  return [...players].sort((a, b) => b.score - a.score);
}
