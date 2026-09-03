import { useEffect, useRef, useState } from "react";
import { isCorrectGuess } from "../lib/game";
import { sendGuess } from "../lib/guesses";
import { submitCorrectGuess } from "../lib/rooms";
import { useGuesses } from "../hooks/useGuesses";

export default function GuessChat({ code, room, clientId, isDrawer }) {
  const guesses = useGuesses(code);
  const [text, setText] = useState("");
  const logRef = useRef(null);

  const canGuess = !isDrawer && room.status === "playing";
  const me = room.players.find((p) => p.id === clientId);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [guesses.length]);

  const submit = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || !canGuess) return;
    setText("");

    const correct = isCorrectGuess(value, room.currentWord);
    await sendGuess(code, {
      playerId: clientId,
      name: me?.name ?? "Someone",
      text: correct ? "guessed the word! 🎉" : value,
      round: room.roundNumber,
      correct,
    });
    if (correct) {
      await submitCorrectGuess({ code, guesserId: clientId }).catch((err) =>
        console.error("scoring failed", err)
      );
    }
  };

  return (
    <div className="chat">
      <h3>Guesses</h3>
      <div className="chat-log" ref={logRef}>
        {guesses.map((guess) => (
          <div
            key={guess.id}
            className={guess.correct ? "chat-line correct" : "chat-line"}
          >
            <b>{guess.name}:</b> {guess.text}
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            isDrawer
              ? "You are drawing this round"
              : canGuess
                ? "Type your guess"
                : "Waiting for the round to start"
          }
          disabled={!canGuess}
        />
        <button type="submit" disabled={!canGuess}>
          Send
        </button>
      </form>
    </div>
  );
}
