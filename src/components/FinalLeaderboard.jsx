import { useState } from "react";
import { sortedByScore } from "../lib/game";
import { playAgain } from "../lib/rooms";

export default function FinalLeaderboard({ room, clientId, onLeave }) {
  const [busy, setBusy] = useState(false);
  const ranked = sortedByScore(room.players);
  const topScore = ranked[0]?.score ?? 0;
  const isHost = room.hostId === clientId;

  const handlePlayAgain = async () => {
    setBusy(true);
    try {
      await playAgain({ code: room.code });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <h1>Final scores</h1>
      <ol className="leaderboard">
        {ranked.map((player) => (
          <li
            key={player.id}
            className={player.score === topScore ? "winner" : ""}
          >
            <span>
              {player.name}
              {player.id === clientId ? " (you)" : ""}
            </span>
            <span>{player.score}</span>
          </li>
        ))}
      </ol>

      {isHost ? (
        <button type="button" onClick={handlePlayAgain} disabled={busy}>
          Play again
        </button>
      ) : (
        <p>Waiting for the host to restart…</p>
      )}
      <button type="button" className="link-button" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}
