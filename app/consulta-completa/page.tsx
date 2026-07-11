"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";

type Status =
  | "idle"
  | "recording"
  | "uploading"
  | "processing"
  | "review"
  | "saving"
  | "saved"
  | "error";

export default function ConsultaCompleta() {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState("");
  const [diarizedText, setDiarizedText] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

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
      recorder.start(1000); // timeslice: junta datos cada 1s, más seguro para grabaciones largas
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

    setStatus("uploading");

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });

      try {
        const uploaded = await upload(`consulta-${Date.now()}.webm`, blob, {
          access: "public",
          handleUploadUrl: "/api/consulta-upload",
        });

        setStatus("processing");

        const res = await fetch("/api/procesar-consulta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl: uploaded.url }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Error al procesar la consulta.");
        }

        setDiarizedText(data.diarizedText || "");
        setSummary(data.summary || "");
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
        body: JSON.stringify({ note: summary, transcript: diarizedText }),
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
    setSummary("");
    setDiarizedText("");
    setShowTranscript(false);
    setErrorMsg("");
    setConsentChecked(false);
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
          <span className="font-medium text-slate-800">Consulta completa</span>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">Grabación de consulta completa</h1>
        <p className="mt-1 text-sm text-slate-500">
          Graba toda la consulta médico-paciente, la transcribe con separación de hablantes y
          genera una nota clínica distinguiendo motivo de consulta, hallazgos del examen y plan.
        </p>
      </header>

      {status === "idle" ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1"
            />
            <span>
              Confirmo que informé al paciente que la consulta se va a grabar con fines de
              documentación clínica asistida por IA, y que dio su consentimiento.
            </span>
          </label>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === "idle" || status === "error" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <button
              onClick={startRecording}
              disabled={!consentChecked}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Grabar consulta"
            >
              <span className="text-3xl">●</span>
            </button>
            <p className="text-sm text-slate-500">
              {consentChecked
                ? "Tocá para empezar a grabar la consulta"
                : "Confirmá el consentimiento para habilitar la grabación"}
            </p>
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
            <p className="text-sm text-slate-500">Grabando la consulta… tocá para detener</p>
          </div>
        ) : null}

        {status === "uploading" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p className="text-sm text-slate-500">Subiendo audio…</p>
          </div>
        ) : null}

        {status === "processing" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p className="text-sm text-slate-500">
              Transcribiendo con separación de hablantes y armando la nota… puede tardar un rato en
              consultas largas.
            </p>
          </div>
        ) : null}

        {isReviewing ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nota de la consulta (editable antes de guardar)
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm leading-relaxed focus:border-slate-500 focus:outline-none"
                disabled={status === "saving" || status === "saved"}
              />
            </div>

            {diarizedText ? (
              <div>
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="text-xs text-slate-500 underline underline-offset-2"
                >
                  {showTranscript
                    ? "Ocultar transcripción diarizada"
                    : "Ver transcripción diarizada completa"}
                </button>
                {showTranscript ? (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    {diarizedText}
                  </p>
                ) : null}
              </div>
            ) : null}

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <div className="flex gap-3">
              {status !== "saved" ? (
                <button
                  onClick={handleSave}
                  disabled={status === "saving" || !summary.trim()}
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
                {status === "saved" ? "Nueva consulta" : "Descartar"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Prototipo de prueba — quién es médico/paciente se deduce por contenido, puede fallar en
        tramos ambiguos. El guardado es simulado. Revisar y corregir antes de usar en producción.
      </p>
    </main>
  );
}
