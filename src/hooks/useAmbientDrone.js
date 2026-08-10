import { useEffect, useRef } from "react";
import { getAudioCtx } from "../audio/sfx";

export default function useAmbientDrone(enabled, scrollRef) {
  const nodesRef = useRef(null);
  useEffect(() => {
    if (!enabled) {
      const active = nodesRef.current;
      if (active) {
        active.gain.gain.linearRampToValueAtTime(0, active.ctx.currentTime + 0.6);
        const timerId = setTimeout(() => {
          active.osc1.stop();
          active.osc2.stop();
        }, 700);
        nodesRef.current = null;
        return () => clearTimeout(timerId);
      }
      return;
    }
    if (!window.AudioContext && !window.webkitAudioContext) return;
    const audioCtx = getAudioCtx();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 55;
    osc2.type = "sine";
    osc2.frequency.value = 55 * 1.5;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start();
    osc2.start();
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 1.2);
    nodesRef.current = { osc1, osc2, gain, filter, ctx: audioCtx };

    let raf;
    function followScroll() {
      raf = requestAnimationFrame(followScroll);
      filter.frequency.value = 350 + (scrollRef.current || 0) * 900;
    }
    followScroll();

    return () => cancelAnimationFrame(raf);
  }, [enabled, scrollRef]);

  useEffect(
    () => () => {
      const active = nodesRef.current;
      if (active) {
        try {
          active.osc1.stop();
          active.osc2.stop();
        } catch {
          /* already stopped */
        }
      }
    },
    []
  );
}
