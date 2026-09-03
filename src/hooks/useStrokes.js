import { useEffect, useState } from "react";
import { listenStrokes } from "../lib/strokes";

export function useStrokes(code, round) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    if (!code || round == null) {
      setPoints([]);
      return undefined;
    }
    return listenStrokes(code, round, setPoints);
  }, [code, round]);

  return points;
}
