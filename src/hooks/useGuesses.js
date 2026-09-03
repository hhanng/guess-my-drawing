import { useEffect, useState } from "react";
import { listenGuesses } from "../lib/guesses";

export function useGuesses(code) {
  const [guesses, setGuesses] = useState([]);

  useEffect(() => {
    if (!code) {
      setGuesses([]);
      return undefined;
    }
    return listenGuesses(code, setGuesses);
  }, [code]);

  return guesses;
}
