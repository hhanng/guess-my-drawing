import { useEffect, useMemo, useState } from "react";
import { getClientId } from "./lib/identity";
import { useRoom } from "./hooks/useRoom";
import Lobby from "./components/Lobby";
import GameRoom from "./components/GameRoom";
import FinalLeaderboard from "./components/FinalLeaderboard";

function readCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("room") ?? "";
}

export default function App() {
  const clientId = useMemo(getClientId, []);
  const [code, setCode] = useState(readCodeFromUrl);
  const room = useRoom(code);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, [code]);

  const enterRoom = (nextCode) => setCode(nextCode);
  const leaveRoom = () => setCode("");

  const isPlayer =
    !!room && (room.players ?? []).some((p) => p.id === clientId);

  if (!code) {
    return <Lobby clientId={clientId} onEnterRoom={enterRoom} />;
  }

  if (room === undefined) {
    return <p className="centered">Loading room…</p>;
  }

  if (room === null) {
    return (
      <div className="centered">
        <p>Room {code} not found.</p>
        <button type="button" onClick={leaveRoom}>
          Back
        </button>
      </div>
    );
  }

  if (!isPlayer) {
    return (
      <Lobby
        clientId={clientId}
        code={code}
        room={room}
        isPlayer={false}
        onEnterRoom={enterRoom}
      />
    );
  }

  if (room.status === "lobby") {
    return (
      <Lobby
        clientId={clientId}
        code={code}
        room={room}
        isPlayer
        onEnterRoom={enterRoom}
      />
    );
  }

  if (room.status === "game-over") {
    return (
      <FinalLeaderboard room={room} clientId={clientId} onLeave={leaveRoom} />
    );
  }

  return (
    <GameRoom code={code} room={room} clientId={clientId} onLeave={leaveRoom} />
  );
}
