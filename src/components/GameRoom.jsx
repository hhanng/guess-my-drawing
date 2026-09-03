import { useEffect, useRef, useState } from "react";
import { maskWord } from "../lib/game";
import { advanceRound, endRoundByTimeout } from "../lib/rooms";
import DrawingCanvas from "./DrawingCanvas";
import GuessChat from "./GuessChat";
import Scoreboard from "./Scoreboard";

function Countdown({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className="countdown">{secondsLeft}s</span>;
}

const HOST_FALLBACK_MS = 8000;

function RoundEndOverlay({ room, isHost }) {
  const [busy, setBusy] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const result = room.lastRoundResult ?? {};
  const isLastRound = room.roundNumber >= room.totalRounds;

  useEffect(() => {
    if (isHost) return undefined;
    const id = setTimeout(() => setFallbackReady(true), HOST_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [isHost]);

  const handleNext = async () => {
    setBusy(true);
    try {
      await advanceRound({ code: room.code });
    } finally {
      setBusy(false);
    }
  };

  const label = isLastRound ? "See final results" : "Next round";

  return (
    <div className="overlay">
      <div className="overlay-card">
        {result.timedOut ? (
          <h2>Time's up!</h2>
        ) : (
          <h2>{result.winnerName} guessed it!</h2>
        )}
        <p>
          The word was <b>{result.word}</b>
        </p>
        {isHost || fallbackReady ? (
          <button type="button" onClick={handleNext} disabled={busy}>
            {label}
          </button>
        ) : (
          <p>Waiting for the host…</p>
        )}
      </div>
    </div>
  );
}

export default function GameRoom({ code, room, clientId, onLeave }) {
  const isDrawer = room.currentDrawerId === clientId;
  const isHost = room.hostId === clientId;
  const drawer = room.players.find((p) => p.id === room.currentDrawerId);
  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    timeoutFiredRef.current = false;
  }, [room.roundNumber]);

  useEffect(() => {
    if (room.status !== "playing" || !room.roundEndsAt) {
      return undefined;
    }
    // Every client watches the clock. The drawer fires the timeout on time;
    // other clients fire it after a short grace period, so a disconnected or
    // refreshing drawer can't softlock the round. endRoundByTimeout is a
    // transaction guarded on status === "playing", so a race just no-ops.
    const graceMs = isDrawer ? 0 : 4000;
    const id = setInterval(() => {
      if (
        Date.now() >= room.roundEndsAt + graceMs &&
        !timeoutFiredRef.current
      ) {
        timeoutFiredRef.current = true;
        endRoundByTimeout({ code }).catch((err) => {
          timeoutFiredRef.current = false;
          console.error("timeout end failed", err);
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isDrawer, room.status, room.roundEndsAt, code]);

  return (
    <div className="game">
      <header className="game-header">
        <span>Room {code}</span>
        <span>
          Round {room.roundNumber}/{room.totalRounds}
        </span>
        <span>
          Drawer: <b>{drawer?.name ?? "?"}</b>
        </span>
        <Countdown endsAt={room.roundEndsAt} />
        <button type="button" className="link-button" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div className="stage">
        <div className="stage-main">
          <div className="word-display">
            {isDrawer ? (
              <>
                Draw: <b>{room.currentWord}</b>
              </>
            ) : (
              <>
                Word: <span className="mask">{maskWord(room.currentWord)}</span>{" "}
                ({room.currentWord?.length ?? 0} letters)
              </>
            )}
          </div>
          <DrawingCanvas
            code={code}
            round={room.roundNumber}
            isDrawer={isDrawer && room.status === "playing"}
          />
        </div>

        <div className="stage-side">
          <Scoreboard
            players={room.players}
            currentDrawerId={room.currentDrawerId}
            clientId={clientId}
          />
          <GuessChat
            code={code}
            room={room}
            clientId={clientId}
            isDrawer={isDrawer}
          />
        </div>
      </div>

      {room.status === "round-end" && (
        <RoundEndOverlay room={room} isHost={isHost} />
      )}
    </div>
  );
}
