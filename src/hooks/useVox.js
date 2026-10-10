import { useEffect, useRef, useState } from "react";

// VOX: key the radio up by voice. The mic level is watched while the radio is connected; speech above
// the sensitivity threshold keys up, and silence for the hang time keys down. It never keys up while
// someone else is on air (so the speaker can't set it off), and it can't release a PTT held by hand.
export const voxThreshold = (sensitivity) => Math.max(0.008, 0.12 - 0.0112 * sensitivity);
const ATTACK_MS = 150, TICK_MS = 50;

export function useVox({ enabled, sensitivity, hangMs, deviceId, blocked, onKey, onUnkey }) {
  const levelRef = useRef(0);
  const [note, setNote] = useState("");
  const cb = useRef({});
  cb.current = { sensitivity, hangMs, blocked, onKey, onUnkey };

  useEffect(() => {
    if (!enabled) { levelRef.current = 0; setNote(""); return undefined; }
    let stream = null, ctx = null, timer = null, keyed = false, gone = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { ideal: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        if (gone) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        await ctx.resume().catch(() => {});
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        let loudSince = 0, lastLoud = 0;
        setNote("Listening for your voice.");
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          levelRef.current = Math.min(1, rms / 0.15);
          const { sensitivity: s, hangMs: hang, blocked: busy } = cb.current;
          const loud = rms > voxThreshold(s), now = Date.now();
          if (!keyed) {
            if (busy || !loud) { loudSince = 0; return; }
            if (!loudSince) loudSince = now;
            if (now - loudSince >= ATTACK_MS) { keyed = true; lastLoud = now; cb.current.onKey(); }
          } else {
            if (loud) lastLoud = now;
            if (now - lastLoud >= hang) { keyed = false; loudSince = 0; cb.current.onUnkey(); }
          }
        }, TICK_MS);
      } catch (err) { setNote("VOX can't use the microphone: " + (err?.message || err)); }
    })();
    return () => {
      gone = true; clearInterval(timer); levelRef.current = 0;
      if (keyed) cb.current.onUnkey();
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [enabled, deviceId]);

  return { levelRef, note };
}
