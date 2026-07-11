"use client";

import { useEffect, useRef, useState } from "react";
import { parseDniPdf417, type DniBarcodeFields } from "@/lib/dni-barcode";

type Status = "idle" | "processing" | "review" | "error";
type CaptureTarget = "front" | "back";
type ScanStatus = "idle" | "starting" | "scanning" | "error";

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

// Campos que, si vinieron del código de barras, son más confiables que la
// visión por IA — no se pisan cuando después se corre la extracción por IA
// (por ejemplo, con la foto del dorso).
const CAMPOS_PRIORIDAD_BARCODE: Array<keyof DniExtraction> = [
  "numeroTramite",
  "apellido",
  "nombre",
  "sexo",
  "dni",
  "ejemplar",
  "fechaNacimiento",
  "fechaEmision",
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function barcodeFieldsToExtraction(parsed: DniBarcodeFields, prev: DniExtraction | null): DniExtraction {
  return {
    tipoDocumento: "DNI tarjeta",
    numeroTramite: parsed.numeroTramite,
    apellido: parsed.apellido,
    nombre: parsed.nombre,
    sexo: parsed.sexo,
    dni: parsed.dni,
    ejemplar: parsed.ejemplar,
    fechaNacimiento: parsed.fechaNacimiento,
    fechaEmision: parsed.fechaEmision,
    nacionalidad: prev?.nacionalidad ?? null,
    cuil: prev?.cuil ?? parsed.cuilParcial,
    domicilio: prev?.domicilio ?? null,
    confianza: "alta",
    camposDudosos: parsed.posibleNombreDeformado ? ["apellido", "nombre"] : [],
    observaciones: parsed.posibleNombreDeformado
      ? "Datos leídos del código de barras del DNI. El código no admite bien ñ/tildes: confirmá apellido y nombre contra la foto."
      : "Datos leídos del código de barras del DNI (fuente confiable, no es una lectura por IA).",
  };
}

export default function EscaneoDni() {
  const [status, setStatus] = useState<Status>("idle");
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [frontData, setFrontData] = useState<string | null>(null);
  const [backData, setBackData] = useState<string | null>(null);
  const [resultado, setResultado] = useState<DniExtraction | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Captura por cámara + auto-detección del código de barras del frente.
  // Usamos el ponyfill "barcode-detector" (ZXing compilado a WebAssembly) en
  // vez del BarcodeDetector nativo del navegador: el nativo solo funciona en
  // Chrome/Edge sobre macOS y Android (en Windows no existe una API de
  // detección de códigos a nivel de sistema operativo, así que Chrome en
  // Windows no lo soporta en absoluto), mientras que este ponyfill funciona
  // igual en cualquier navegador/sistema operativo porque no depende del SO.
  const [cameraTarget, setCameraTarget] = useState<CaptureTarget | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [barcodeDetectedFront, setBarcodeDetectedFront] = useState(false);
  const [lectorListo, setLectorListo] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barcodeDetectorRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { BarcodeDetector } = await import("barcode-detector/pure");
        if (cancelled) return;
        const detector = new BarcodeDetector({ formats: ["pdf417"] });
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
    // Cortar la cámara si el usuario navega fuera de la página con la cámara
    // abierta.
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
    setCameraTarget(null);
    setScanStatus("idle");
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const handleBarcodeDetected = (parsed: DniBarcodeFields) => {
    const dataUrl = captureFrame();
    if (dataUrl) {
      setFrontData(dataUrl);
      setFrontPreview(dataUrl);
    }
    setBarcodeDetectedFront(true);
    setResultado((prev) => barcodeFieldsToExtraction(parsed, prev));
    setStatus("review");
    stopCamera();
  };

  const startBarcodeLoop = () => {
    detectIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const detector = barcodeDetectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        const pdf417 = barcodes.find((b: any) => b.rawValue);
        if (pdf417) {
          const parsed = parseDniPdf417(pdf417.rawValue);
          if (parsed) handleBarcodeDetected(parsed);
        }
      } catch {
        // Frame ilegible puntual: se ignora y se reintenta en el próximo tick.
      }
    }, 350);
  };

  const openCamera = async (target: CaptureTarget) => {
    setErrorMsg("");
    setCameraTarget(target);
    setScanStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanStatus("scanning");
      if (target === "front") {
        startBarcodeLoop();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      setScanStatus("error");
      setCameraTarget(null);
    }
  };

  const handleManualCapture = () => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    if (cameraTarget === "front") {
      setFrontData(dataUrl);
      setFrontPreview(dataUrl);
      setBarcodeDetectedFront(false);
    } else if (cameraTarget === "back") {
      setBackData(dataUrl);
      setBackPreview(dataUrl);
    }
    stopCamera();
  };

  const handleFrontChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setFrontData(dataUrl);
    setFrontPreview(dataUrl);
    setBarcodeDetectedFront(false);
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

      setResultado((prev) => {
        const nuevo: DniExtraction = data.resultado;
        if (!prev || !barcodeDetectedFront) return nuevo;
        // Si el frente ya vino del código de barras, esos campos son más
        // confiables que la visión por IA: se conservan, y la IA solo aporta
        // lo que el barcode no trae (domicilio, CUIL completo, nacionalidad).
        const merged = { ...nuevo };
        for (const campo of CAMPOS_PRIORIDAD_BARCODE) {
          (merged as any)[campo] = prev[campo];
        }
        merged.cuil = prev.cuil ?? nuevo.cuil;
        merged.confianza = "alta";
        merged.camposDudosos = prev.camposDudosos;
        merged.observaciones = prev.observaciones;
        return merged;
      });
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
    setBarcodeDetectedFront(false);
    stopCamera();
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

  const renderCaptureSlot = (
    target: CaptureTarget,
    label: string,
    preview: string | null,
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  ) => {
    const isCameraOpenHere = cameraTarget === target;

    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>

        {isCameraOpenHere ? (
          <div className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full" playsInline muted />
              <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-dashed border-white/70" />
            </div>
            <p className="text-xs text-slate-500">
              {target === "front"
                ? scanStatus !== "scanning"
                  ? "Iniciando cámara…"
                  : !lectorListo
                  ? "Cargando el lector de código de barras (puede tardar unos segundos la primera vez)… mientras tanto podés capturar manualmente."
                  : "Encuadrá el frente del DNI dentro del marco — se captura solo al detectar el código de barras."
                : "Encuadrá el documento dentro del marco y tocá Capturar."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualCapture}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Capturar ahora
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openCamera(target)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                📷 Usar cámara
              </button>
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Subir archivo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileChange}
                  className="hidden"
                />
              </label>
            </div>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={`Vista previa ${label.toLowerCase()}`}
                className="max-h-56 rounded-lg border border-slate-200 object-contain"
              />
            ) : null}
          </div>
        )}
      </div>
    );
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
          <span className="font-medium text-slate-800">Escaneo de DNI</span>
        </nav>
        <h1 className="text-2xl font-semibold text-slate-800">Escaneo de DNI (admisión)</h1>
        <p className="mt-1 text-sm text-slate-500">
          MVP · Usá la cámara o subí una foto del frente del DNI (y del dorso si querés más datos)
          para precargar los datos de admisión del paciente. Revisá y corregí antes de guardar.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          El lector de código de barras funciona en cualquier navegador — la primera vez que lo
          uses puede tardar unos segundos en cargar (descarga un módulo pequeño la primera vez).
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <canvas ref={canvasRef} className="hidden" />

        {status === "idle" || status === "error" ? (
          <div className="flex flex-col gap-4">
            {renderCaptureSlot("front", "Frente del DNI (obligatorio)", frontPreview, handleFrontChange)}
            {renderCaptureSlot(
              "back",
              "Dorso del DNI (opcional — suma domicilio y CUIL)",
              backPreview,
              handleBackChange
            )}

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <button
              onClick={handleScan}
              disabled={!frontData || cameraTarget !== null}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
            >
              Escanear DNI con IA
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
              <span className="text-sm text-slate-500">
                {resultado.tipoDocumento}
                {barcodeDetectedFront ? " · vía código de barras" : ""}
              </span>
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

            {!backData && barcodeDetectedFront ? (
              <p className="text-xs text-slate-500">
                Faltan domicilio y CUIL completo — capturá también el dorso y tocá "Escanear DNI
                con IA" para completarlos.
              </p>
            ) : null}

            {resultado.observaciones ? (
              <p className="text-xs text-slate-500">Observaciones: {resultado.observaciones}</p>
            ) : null}

            <p className="text-xs text-slate-400">
              Revisá especialmente los campos marcados antes de usar estos datos para la admisión.
            </p>

            <div className="flex flex-wrap gap-3">
              {!barcodeDetectedFront || !backData ? (
                <button
                  onClick={() => {
                    setStatus("idle");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Agregar/cambiar foto
                </button>
              ) : null}
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
        conectar estos datos al formulario/API de alta de paciente.
      </p>
    </main>
  );
}
