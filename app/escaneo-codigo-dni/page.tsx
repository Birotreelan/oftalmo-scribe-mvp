"use client";

import { useEffect, useRef, useState } from "react";
import { parseDniPdf417, type DniBarcodeFields } from "@/lib/dni-barcode";

type Status = "idle" | "scanning" | "detected" | "error";

const CAMPOS: Array<{ key: keyof DniBarcodeFields; label: string }> = [
  { key: "apellido", label: "Apellido" },
  { key: "nombre", label: "Nombre" },
  { key: "dni", label: "N° de DNI" },
  { key: "sexo", label: "Sexo" },
  { key: "fechaNacimiento", label: "Fecha de nacimiento" },
  { key: "ejemplar", label: "Ejemplar" },
  { key: "numeroTramite", label: "N° de trámite" },
  { key: "fechaEmision", label: "Fecha de emisión" },
  { key: "cuilParcial", label: "CUIL (parcial, ver nota)" },
];

export default function EscaneoCodigoDni() {
  const [status, setStatus] = useState<Status>("idle");
  const [resultado, setResultado] = useState<DniBarcodeFields | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [lectorListo, setLectorListo] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonCopiado, setJsonCopiado] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barcodeDetectorRef = useRef<any>(null);

  // Mismo ponyfill que en /escaneo-dni (ZXing + WebAssembly): funciona en
  // cualquier navegador/sistema operativo, a diferencia del BarcodeDetector
  // nativo (no soportado en Chrome/Windows ni en Safari/Firefox).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { BarcodeDetector } = await import("barcode-detector/pure");
        if (cancelled) return;
        // Se incluye "qr_code" por si alguna variante del documento (o del
        // futuro DNI con chip) llegara a usar un QR real en vez de PDF417 —
        // hoy el DNI tarjeta usa PDF417.
        const detector = new BarcodeDetector({ formats: ["pdf417", "qr_code"] });
        detector.addEventListener("load", () => {
          if (!cancelled) setLectorListo(true);
        });
        detector.addEventListener("error", (e: any) => {
          console.error("No se pudo cargar el lector de código de barras:", e.detail);
        });
        barcodeDetectorRef.current = detector;
      } catch (err) {
        console.error("No se pudo inicializar el lector de código de barras:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startBarcodeLoop = () => {
    detectIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const detector = barcodeDetectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        const encontrado = barcodes.find((b: any) => b.rawValue);
        if (!encontrado) return;

        const parsed = parseDniPdf417(encontrado.rawValue);
        if (parsed) {
          setResultado(parsed);
          setStatus("detected");
          stopCamera();
        }
        // Si se detectó un código pero no tiene el formato esperado de DNI
        // (por ejemplo, otro tipo de credencial u otro código cualquiera),
        // seguimos escaneando en vez de cortar — puede ser una lectura
        // parcial de un frame en movimiento.
      } catch {
        // Frame ilegible puntual: se ignora y se reintenta en el próximo tick.
      }
    }, 300);
  };

  const startScanning = async () => {
    setErrorMsg("");
    setResultado(null);
    setStatus("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      startBarcodeLoop();
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    stopCamera();
    setStatus("idle");
    setResultado(null);
    setErrorMsg("");
    setShowJson(false);
    setJsonCopiado(false);
  };

  const updateField = (key: keyof DniBarcodeFields, value: string) => {
    if (!resultado) return;
    setResultado({ ...resultado, [key]: value } as DniBarcodeFields);
  };

  const handleCopyJson = async () => {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(resultado, null, 2));
      setJsonCopiado(true);
      setTimeout(() => setJsonCopiado(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar el JSON:", err);
    }
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
          <a
            href="/prueba-microfono"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Prueba de micrófono
          </a>
          <a
            href="/escaneo-dni"
            className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Escaneo de DNI
          </a>
          <span className="font-medium text-slate-800">Código de barras del DNI</span>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">
          Lectura rápida por código de barras
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Acercá solo el código de barras del frente del DNI a la cámara (no hace falta encuadrar
          el documento entero) — apenas se lee, se completan los datos sin usar IA.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Es más rápido que "Escaneo de DNI" porque no llama a ningún modelo: decodifica el código
          directamente. A cambio, solo trae los datos que el código incluye (no domicilio ni CUIL
          completo) — para eso, usá{" "}
          <a href="/escaneo-dni" className="underline underline-offset-2">
            Escaneo de DNI
          </a>{" "}
          con la foto del dorso.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === "idle" || status === "error" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <button
              onClick={startScanning}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
            >
              📷 Escanear código de barras
            </button>
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          </div>
        ) : null}

        {status === "scanning" ? (
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full" playsInline muted />
              <div className="pointer-events-none absolute inset-10 rounded-md border-2 border-dashed border-white/70" />
            </div>
            <p className="text-center text-xs text-slate-500">
              {lectorListo
                ? "Acercá el código de barras (franjas verticales, parte inferior del frente del DNI) hasta que ocupe buena parte del recuadro."
                : "Cargando el lector de código de barras (puede tardar unos segundos la primera vez)…"}
            </p>
            <button
              onClick={handleReset}
              className="mx-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        ) : null}

        {status === "detected" && resultado ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">DNI tarjeta · vía código de barras</span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                Confianza: alta
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CAMPOS.map(({ key, label }) => {
                const isDudoso =
                  resultado.posibleNombreDeformado && (key === "apellido" || key === "nombre");
                return (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {label}
                      {isDudoso ? <span className="ml-1 text-amber-600">⚠ revisar</span> : null}
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

            <p className="text-xs text-slate-500">
              "CUIL (parcial)" son solo los 3 caracteres que trae el código (2 antes del primer
              guión y 1 después del segundo), no el CUIL completo — para el CUIL completo y el
              domicilio hace falta la foto del dorso en{" "}
              <a href="/escaneo-dni" className="underline underline-offset-2">
                Escaneo de DNI
              </a>
              .
            </p>

            {resultado.posibleNombreDeformado ? (
              <p className="text-xs text-amber-600">
                El código de barras no admite bien ñ/tildes — confirmá apellido y nombre contra el
                documento antes de usarlos.
              </p>
            ) : null}

            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowJson((v) => !v)}
                  className="text-xs text-slate-500 underline underline-offset-2"
                >
                  {showJson ? "Ocultar JSON" : "Ver JSON para el sistema"}
                </button>
                {showJson ? (
                  <button
                    onClick={handleCopyJson}
                    className="text-xs text-slate-500 underline underline-offset-2"
                  >
                    {jsonCopiado ? "¡Copiado!" : "Copiar JSON"}
                  </button>
                ) : null}
              </div>
              {showJson ? (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(resultado, null, 2)}
                </pre>
              ) : null}
            </div>

            <button
              onClick={handleReset}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Escanear otro DNI
            </button>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-slate-400">
        Prototipo MVP — todavía no guarda en el sistema de admisión real.
      </p>
    </main>
  );
}
