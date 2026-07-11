"use client";

import { useState } from "react";

type Status = "idle" | "processing" | "review" | "error";

type DniExtraction = {
  tipoDocumento: string;
  numeroTramite: string | null;
  apellido: string | null;
  nombre: string | null;
  sexo: string | null;
  dni: string | null;
  ejemplar: string | null;
  fechaNacimiento: string | null;
  fechaEmision: string | null;
  nacionalidad: string | null;
  cuil: string | null;
  domicilio: string | null;
  confianza: "alta" | "media" | "baja";
  camposDudosos: string[];
  observaciones: string | null;
};

const CAMPOS: Array<{ key: keyof DniExtraction; label: string }> = [
  { key: "apellido", label: "Apellido" },
  { key: "nombre", label: "Nombre" },
  { key: "dni", label: "N° de DNI" },
  { key: "sexo", label: "Sexo" },
  { key: "fechaNacimiento", label: "Fecha de nacimiento" },
  { key: "nacionalidad", label: "Nacionalidad" },
  { key: "cuil", label: "CUIL" },
  { key: "ejemplar", label: "Ejemplar" },
  { key: "numeroTramite", label: "N° de trámite" },
  { key: "fechaEmision", label: "Fecha de emisión" },
  { key: "domicilio", label: "Domicilio" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EscaneoDni() {
  const [status, setStatus] = useState<Status>("idle");
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [frontData, setFrontData] = useState<string | null>(null);
  const [backData, setBackData] = useState<string | null>(null);
  const [resultado, setResultado] = useState<DniExtraction | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFrontChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setFrontData(dataUrl);
    setFrontPreview(dataUrl);
  };

  const handleBackChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setBackData(dataUrl);
    setBackPreview(dataUrl);
  };

  const handleScan = async () => {
    if (!frontData) return;
    setStatus("processing");
    setErrorMsg("");
    try {
      const res = await fetch("/api/escaneo-dni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage: frontData, backImage: backData || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al escanear el documento.");
      setResultado(data.resultado);
      setStatus("review");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Ocurrió un error al escanear el documento.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setFrontPreview(null);
    setBackPreview(null);
    setFrontData(null);
    setBackData(null);
    setResultado(null);
    setErrorMsg("");
  };

  const updateField = (key: keyof DniExtraction, value: string) => {
    if (!resultado) return;
    setResultado({ ...resultado, [key]: value } as DniExtraction);
  };

  const confianzaColor =
    resultado?.confianza === "alta"
      ? "bg-green-100 text-green-700"
      : resultado?.confianza === "media"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

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
          <a
            href="/prueba-microfono"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Prueba de micrófono
          </a>
          <span className="font-medium text-slate-800">Escaneo de DNI</span>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">Escaneo de DNI (admisión)</h1>
        <p className="mt-1 text-sm text-slate-500">
          MVP · Subí una foto del frente del DNI (y del dorso si querés más datos) para precargar
          los datos de admisión del paciente. Revisá y corregí antes de guardar.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === "idle" || status === "error" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Frente del DNI (obligatorio)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFrontChange}
                className="block w-full text-sm text-slate-600"
              />
              {frontPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontPreview}
                  alt="Vista previa frente del DNI"
                  className="mt-2 max-h-56 rounded-lg border border-slate-200 object-contain"
                />
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dorso del DNI (opcional — suma domicilio y CUIL)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleBackChange}
                className="block w-full text-sm text-slate-600"
              />
              {backPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backPreview}
                  alt="Vista previa dorso del DNI"
                  className="mt-2 max-h-56 rounded-lg border border-slate-200 object-contain"
                />
              ) : null}
            </div>

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <button
              onClick={handleScan}
              disabled={!frontData}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
            >
              Escanear DNI
            </button>
          </div>
        ) : null}

        {status === "processing" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p className="text-sm text-slate-500">Leyendo el documento…</p>
          </div>
        ) : null}

        {status === "review" && resultado ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{resultado.tipoDocumento}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${confianzaColor}`}>
                Confianza: {resultado.confianza}
              </span>
            </div>

            {resultado.tipoDocumento === "no reconocido" ? (
              <p className="text-sm text-red-600">
                La imagen no parece ser un DNI argentino legible. Probá con otra foto.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CAMPOS.map(({ key, label }) => {
                  const isDudoso = resultado.camposDudosos?.includes(key);
                  return (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        {label}
                        {isDudoso ? (
                          <span className="ml-1 text-amber-600">⚠ revisar</span>
                        ) : null}
                      </label>
                      <input
                        type="text"
                        value={(resultado[key] as string) ?? ""}
                        onChange={(e) => updateField(key, e.target.value)}
                        className={`w-full rounded-lg border p-2 text-sm focus:outline-none ${
                          isDudoso
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-300 focus:border-slate-500"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {resultado.observaciones ? (
              <p className="text-xs text-slate-500">Observaciones: {resultado.observaciones}</p>
            ) : null}

            <p className="text-xs text-slate-400">
              Revisá especialmente los campos marcados antes de usar estos datos para la admisión
              — este MVP lee la imagen con IA, todavía no decodifica el código de barras del DNI
              (más confiable para el número de documento y el CUIL).
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Escanear otro documento
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Prototipo MVP — todavía no guarda en el sistema de admisión real; el siguiente paso es
        conectar estos datos al formulario/API de alta de paciente y sumar la lectura del código de
        barras PDF417 y la MRZ como fuentes más confiables.
      </p>
    </main>
  );
}
