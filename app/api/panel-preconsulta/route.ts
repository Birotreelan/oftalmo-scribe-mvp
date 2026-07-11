import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { analizarTendenciaHC, generarResumenHC } from "@/lib/hc-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Endpoint pensado para ser llamado SERVIDOR-A-SERVIDOR desde el backend del
// sistema médico (no desde el navegador del médico), típicamente en el
// momento en que se "llama" al paciente desde la cola de espera. Corre en
// paralelo el resumen y el análisis de tendencia sobre el mismo texto de HC
// y devuelve todo junto, para que el panel de preconsulta se pueda mostrar
// de forma instantánea cuando el médico lo abre.
//
// Autenticación: header `x-api-key` con el valor de WIDGET_API_KEY.
// Si WIDGET_API_KEY no está configurada, el chequeo se salta (solo para
// pruebas locales/manuales) — no desplegar así a producción.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const expectedKey = process.env.WIDGET_API_KEY;
  if (expectedKey) {
    const providedKey = req.headers.get("x-api-key");
    if (providedKey !== expectedKey) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar OPENAI_API_KEY en el servidor." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const patientId = typeof body?.patientId === "string" ? body.patientId : null;
    const hcText = typeof body?.hcText === "string" ? body.hcText : "";

    if (!hcText.trim()) {
      return NextResponse.json({ error: "No se recibió hcText." }, { status: 400 });
    }

    const [resumen, tendencia] = await Promise.all([
      generarResumenHC(openai, hcText),
      analizarTendenciaHC(openai, hcText),
    ]);

    return NextResponse.json({
      patientId,
      generatedAt: new Date().toISOString(),
      resumen,
      pio: tendencia.pio,
      av: tendencia.av,
      treatments: tendencia.treatments,
      alerts: tendencia.alerts,
    });
  } catch (err: unknown) {
    console.error("Error en /api/panel-preconsulta:", err);
    const message = err instanceof Error ? err.message : "Error al generar el panel de preconsulta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
