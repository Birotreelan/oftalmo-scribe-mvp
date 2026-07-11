import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { analizarTendenciaHC } from "@/lib/hc-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar OPENAI_API_KEY en el servidor." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";

    if (!text.trim()) {
      return NextResponse.json({ error: "No se recibió texto de la historia clínica." }, { status: 400 });
    }

    const result = await analizarTendenciaHC(openai, text);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Error en /api/tendencia-hc:", err);
    const message = err instanceof Error ? err.message : "Error al analizar la historia clínica.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
