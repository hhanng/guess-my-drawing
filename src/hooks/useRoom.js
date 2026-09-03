import { useEffect, useState } from "react";
import { listenRoom } from "../lib/rooms";

export function useRoom(code) {
  const [room, setRoom] = useState(undefined);

  useEffect(() => {
    if (!code) {
      setRoom(undefined);
      return undefined;
    }
    setRoom(undefined);
    return listenRoom(code, setRoom);
  }, [code]);

  return room;
}
