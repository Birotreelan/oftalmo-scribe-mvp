import { useEffect, useRef, useState } from "react";

/**
 * Devuelve el nivel de entrada del micrófono (0 a 1) en tiempo real a partir
 * de un MediaStream ya activo, usando la Web Audio API (AnalyserNode). Sirve
 * para mostrarle al usuario que el micrófono está captando audio mientras
 * habla, sin depender de la transcripción para saberlo.
 */
export function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }

    const AudioContextClass: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      // Actualizamos el estado cada 3 frames (~20 veces por segundo) para
      // que se vea fluido sin sobrecargar de renders a React.
      frameCountRef.current += 1;
      if (frameCountRef.current % 3 === 0) {
        setLevel(Math.min(1, rms * 4));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioCtx.close().catch(() => {});
      setLevel(0);
    };
  }, [stream]);

  return level;
}
