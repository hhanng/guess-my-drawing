import { useState } from "react";
import { MIN_PLAYERS } from "../lib/game";
import { createRoom, joinRoom, startGame } from "../lib/rooms";
import { getSavedName, saveName } from "../lib/identity";

function HomeForm({ clientId, presetCode, onEnterRoom }) {
  const [name, setName] = useState(getSavedName());
  const [code, setCode] = useState(presetCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const withBusy = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    withBusy(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Enter a name first");
      saveName(trimmed);
      const newCode = await createRoom({ hostId: clientId, hostName: trimmed });
      onEnterRoom(newCode);
    });

  const handleJoin = () =>
    withBusy(async () => {
      const trimmed = name.trim();
      const trimmedCode = code.trim().toUpperCase();
      if (!trimmed) throw new Error("Enter a name first");
      if (!trimmedCode) throw new Error("Enter a room code");
      saveName(trimmed);
      await joinRoom({ code: trimmedCode, playerId: clientId, name: trimmed });
      onEnterRoom(trimmedCode);
    });

  return (
    <div className="home">
      <h1>Guess My Drawing</h1>
      <p className="tagline">Draw with your hand. Guess in the chat.</p>

      <label>
        Your name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Han"
          maxLength={20}
        />
      </label>

      <div className="home-actions">
        <button type="button" onClick={handleCreate} disabled={busy}>
          Create room
        </button>
        <div className="join-row">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={6}
          />
          <button type="button" onClick={handleJoin} disabled={busy}>
            Join
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function WaitingRoom({ clientId, room }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isHost = room.hostId === clientId;
  const canStart = room.players.length >= MIN_PLAYERS;

  const handleStart = async () => {
    setBusy(true);
    setError("");
    try {
      await startGame({ code: room.code });
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <h1>Room {room.code}</h1>
      <p className="tagline">Share this code with your friends.</p>

      <h3>Players ({room.players.length})</h3>
      <ul className="player-list">
        {room.players.map((player) => (
          <li key={player.id}>
            {player.name}
            {player.id === room.hostId ? " (host)" : ""}
            {player.id === clientId ? " (you)" : ""}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button type="button" onClick={handleStart} disabled={busy || !canStart}>
          {canStart ? "Start game" : `Need ${MIN_PLAYERS}+ players`}
        </button>
      ) : (
        <p>Waiting for the host to start…</p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Lobby({ clientId, code, room, isPlayer, onEnterRoom }) {
  if (isPlayer && room && room.status === "lobby") {
    return <WaitingRoom clientId={clientId} room={room} />;
  }
  return (
    <HomeForm clientId={clientId} presetCode={code} onEnterRoom={onEnterRoom} />
  );
}
