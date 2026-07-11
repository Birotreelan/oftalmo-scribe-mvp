"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Status = "idle" | "loading" | "done" | "error";

type PioPoint = { date: string; od: number | null; oi: number | null };
type AvPoint = {
  date: string;
  od_fraction: string | null;
  od_decimal: number | null;
  oi_fraction: string | null;
  oi_decimal: number | null;
};
type Treatment = { date: string; type: string; eye: string | null };
type Alert = {
  type: string;
  eye: string | null;
  lastDate: string;
  daysSinceLast: number;
  typicalIntervalDays: number;
  eventCount: number;
  message: string;
};

type ResultData = {
  pio: PioPoint[];
  av: AvPoint[];
  treatments: Treatment[];
  alerts: Alert[];
};

export default function TendenciaHC() {
  const [rawText, setRawText] = useState("");
  const [data, setData] = useState<ResultData | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/tendencia-hc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Error al analizar la historia clínica.");
      }
      setData(json);
      setStatus("done");
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al analizar la historia clínica.");
      setStatus("error");
    }
  };

  const avChartData =
    data?.av.map((p) => ({
      date: p.date,
      OD: p.od_decimal,
      OI: p.oi_decimal,
    })) ?? [];

  const pioChartData =
    data?.pio.map((p) => ({
      date: p.date,
      OD: p.od,
      OI: p.oi,
    })) ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
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
          <span className="font-medium text-slate-800">Tendencia y alertas</span>
          <a
            href="/consulta-completa"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Consulta completa
          </a>
          <a
            href="/prueba-microfono"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Prueba de micrófono
          </a>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">
          Tendencia de PIO/AV y alerta de seguimiento
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pegá el historial completo del paciente. Se extraen los valores de PIO y agudeza
          visual con su fecha para graficar la evolución, y se detecta si el paciente está
          atrasado respecto a su patrón histórico de controles o tratamientos (ej. inyecciones
          antiVEGF).
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
          onClick={handleAnalyze}
          disabled={status === "loading" || !rawText.trim()}
          className="self-start rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
        >
          {status === "loading" ? "Analizando…" : "Analizar tendencia"}
        </button>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </section>

      {data ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Alertas de seguimiento</h2>
            {data.alerts.length === 0 ? (
              <p className="text-sm text-slate-500">
                No se detectaron atrasos respecto al patrón histórico de tratamientos.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.alerts.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    ⚠ {a.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pioChartData.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                Presión intraocular (PIO) en el tiempo
              </h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pioChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="OD" stroke="#2563eb" connectNulls dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="OI" stroke="#dc2626" connectNulls dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {avChartData.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                Agudeza visual (decimal) en el tiempo
              </h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={avChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="OD" stroke="#2563eb" connectNulls dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="OI" stroke="#dc2626" connectNulls dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {data.treatments.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                Procedimientos / tratamientos detectados
              </h2>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1 pr-3">Fecha</th>
                      <th className="py-1 pr-3">Tipo</th>
                      <th className="py-1">Ojo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.treatments.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1 pr-3">{t.date}</td>
                        <td className="py-1 pr-3">{t.type}</td>
                        <td className="py-1">{t.eye ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <p className="text-center text-xs text-slate-400">
        Prototipo de prueba — los valores se extraen automáticamente y pueden tener errores; las
        alertas de atraso son orientativas y no reemplazan el criterio médico.
      </p>
    </main>
  );
}
