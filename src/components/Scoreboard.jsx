import { sortedByScore } from "../lib/game";

export default function Scoreboard({ players, currentDrawerId, clientId }) {
  return (
    <div className="scoreboard">
      <h3>Scores</h3>
      <ul>
        {sortedByScore(players).map((player) => (
          <li
            key={player.id}
            className={player.id === currentDrawerId ? "is-drawer" : ""}
          >
            <span>
              {player.id === currentDrawerId ? "✏️ " : ""}
              {player.name}
              {player.id === clientId ? " (you)" : ""}
            </span>
            <span>{player.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
