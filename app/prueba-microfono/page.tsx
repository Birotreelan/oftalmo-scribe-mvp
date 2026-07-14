"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicLevelMeter } from "@/components/MicLevelMeter";
import { useMicLevel } from "@/lib/useMicLevel";

type Status = "idle" | "recording" | "ready" | "error";

export default function PruebaMicrofono() {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const micLevel = useMicLevel(micStream);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTimer();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStream(stream);
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setMicStream(null);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        setStatus("ready");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
      setStatus("error");
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    stopTimer();
    mediaRecorderRef.current?.stop();
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <nav className="mb-3 flex flex-wrap gap-4 text-sm">
          <a href="/" className="text-slate-500 underline underline-offset-2 hover:text-slate-800">
            Dictado de nota
          </a>
          <a
            href="/resumen-hc"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Resumen de HC completa
          </a>
          <a
            href="/tendencia-hc"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Tendencia y alertas
          </a>
          <a
            href="/consulta-completa"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Consulta completa
          </a>
          <span className="font-medium text-slate-800">Prueba de micrófono</span>
          <a
            href="/escaneo-dni"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Escaneo de DNI
          </a>
          <a
            href="/escaneo-codigo-dni"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Código de barras DNI
          </a>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">Prueba de micrófono</h1>
        <p className="mt-1 text-sm text-slate-500">
          Grabá unos segundos y escuchá cómo se capta tu voz antes de usar las otras
          herramientas, para confirmar que el micrófono y el volumen están bien.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === "idle" || status === "error" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <button
              onClick={startRecording}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600"
              aria-label="Grabar prueba"
            >
              <span className="text-3xl">●</span>
            </button>
            <p className="text-sm text-slate-500">Tocá para grabar una prueba corta</p>
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          </div>
        ) : null}

        {status === "recording" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <button
              onClick={stopRecording}
              className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-slate-800 text-white shadow-md"
              aria-label="Detener"
            >
              <span className="text-2xl">■</span>
            </button>
            <p className="font-mono text-lg text-slate-700">{formatTime(seconds)}</p>
            <MicLevelMeter level={micLevel} active={status === "recording"} />
            <p className="text-sm text-slate-500">Grabando… tocá para detener</p>
          </div>
        ) : null}

        {status === "ready" && audioUrl ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm font-medium text-slate-700">
              Escuchá la grabación: ¿se entiende bien y con buen volumen?
            </p>
            <audio controls src={audioUrl} className="w-full" />
            <button
              onClick={startRecording}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Grabar de nuevo
            </button>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Esta prueba no se transcribe ni se guarda — solo se reproduce localmente en tu navegador
        para confirmar que el micrófono funciona bien.
      </p>
    </main>
  );
}
