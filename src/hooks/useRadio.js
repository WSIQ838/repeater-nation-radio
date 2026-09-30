import { useCallback, useRef, useState } from "react";
import { connectRadio, disconnectRadio, enableMicrophone } from "../lib/livekit";

export function useRadio() {
  const roomRef = useRef(null);
  const micRef = useRef(null);
  const [state, setState] = useState("ready");
  const [error, setError] = useState("");

  const connect = useCallback(async (token) => {
    setError("");
    setState("connecting");
    try {
      const room = await connectRadio(token, {
        onDisconnected: () => setState("ready"),
      });
      roomRef.current = room;
      setState("connected");
      return room;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect to radio.");
      setState("error");
      throw err;
    }
  }, []);

  const startMic = useCallback(async (deviceId) => {
    if (!roomRef.current) throw new Error("Connect to the radio first.");
    micRef.current = await enableMicrophone(roomRef.current, deviceId);
    return micRef.current;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectRadio(roomRef.current);
    roomRef.current = null;
    micRef.current = null;
    setState("ready");
  }, []);

  return { state, error, connect, startMic, disconnect, room: roomRef.current };
}
