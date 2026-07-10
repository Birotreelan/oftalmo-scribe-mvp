"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

export default function ResumenHC() {
  const [rawText, setRawText] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSummarize = async () => {
    if (!rawText.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/resumen-hc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Error al generar el resumen.");
      }
      setSummary(data.summary || "");
      setStatus("done");
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al generar el resumen.");
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <nav className="mb-3 flex gap-4 text-sm">
          <a
            href="/"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Dictado de nota
          </a>
          <span className="font-medium text-slate-800">Resumen de HC completa</span>
          <a
            href="/tendencia-hc"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Tendencia y alertas
          </a>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">
          Resumen de historia clínica completa
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pegá el historial completo del paciente tal como lo exporta el sistema — ficha del
          paciente y antecedentes personales/familiares (si los tenés) más todas las consultas,
          cirugías y controles — y generá un resumen con alertas de seguridad y una línea de
          tiempo clínica condensada.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Historia clínica completa (texto crudo)
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={14}
            placeholder="Pegá acá el historial completo del paciente…"
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed focus:border-slate-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleSummarize}
          disabled={status === "loading" || !rawText.trim()}
          className="self-start rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
        >
          {status === "loading" ? "Generando línea de tiempo…" : "Generar línea de tiempo"}
        </button>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        {summary ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Línea de tiempo condensada (editable)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={22}
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm leading-relaxed focus:border-slate-500 focus:outline-none"
            />
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Prototipo de prueba — el resumen es un borrador para revisión del médico y no reemplaza la
        lectura de la historia clínica completa ante dudas puntuales.
      </p>
    </main>
  );
}
