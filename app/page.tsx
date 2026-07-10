"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status =
  | "idle"
  | "recording"
  | "processing"
  | "review"
  | "saving"
  | "saved"
  | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => stopTimer, []);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
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
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    setStatus("processing");

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });

      try {
        const formData = new FormData();
        formData.append("audio", blob, "dictado.webm");

        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Error al transcribir el audio.");
        }

        setTranscript(data.transcript || "");
        setNoteText(data.note || "");
        setStatus("review");
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err?.message || "Ocurrió un error al procesar la grabación.");
        setStatus("error");
      }
    };

    recorder.stop();
  }, []);

  const handleSave = async () => {
    setStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al guardar la nota.");
      setStatus("saved");
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al guardar.");
      setStatus("review");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setSeconds(0);
    setNoteText("");
    setTranscript("");
    setShowTranscript(false);
    setErrorMsg("");
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  const isReviewing = status === "review" || status === "saving" || status === "saved";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <nav className="mb-3 flex gap-4 text-sm">
          <span className="font-medium text-slate-800">Dictado de nota</span>
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
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">Nota clínica por voz</h1>
        <p className="mt-1 text-sm text-slate-500">
          MVP · Oftalmología — grabá un dictado breve al finalizar la consulta y se convierte en un
          borrador de nota para la Historia Clínica.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {(status === "idle" || status === "error") && !isReviewing ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <button
              onClick={startRecording}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600"
              aria-label="Grabar"
            >
              <span className="text-3xl">●</span>
            </button>
            <p className="text-sm text-slate-500">Tocá para empezar a grabar el dictado</p>
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
            <p className="text-sm text-slate-500">Grabando… tocá para detener</p>
          </div>
        ) : null}

        {status === "processing" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p className="text-sm text-slate-500">Transcribiendo y armando la nota…</p>
          </div>
        ) : null}

        {isReviewing ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nota generada (editable antes de guardar)
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={14}
                className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm leading-relaxed focus:border-slate-500 focus:outline-none"
                disabled={status === "saving" || status === "saved"}
              />
            </div>

            {transcript ? (
              <div>
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="text-xs text-slate-500 underline underline-offset-2"
                >
                  {showTranscript ? "Ocultar transcripción original" : "Ver transcripción original"}
                </button>
                {showTranscript ? (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    {transcript}
                  </p>
                ) : null}
              </div>
            ) : null}

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <div className="flex gap-3">
              {status !== "saved" ? (
                <button
                  onClick={handleSave}
                  disabled={status === "saving" || !noteText.trim()}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
                >
                  {status === "saving" ? "Guardando…" : "Guardar en HC"}
                </button>
              ) : (
                <span className="rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
                  ✓ Nota guardada
                </span>
              )}
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {status === "saved" ? "Nueva nota" : "Descartar"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Prototipo MVP — el guardado actual es simulado (queda registrado en los logs del servidor).
        La integración con la Historia Clínica real del sistema se define en el siguiente paso del
        proyecto.
      </p>
    </main>
  );
}
