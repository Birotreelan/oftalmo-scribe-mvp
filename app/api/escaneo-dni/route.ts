import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { extraerDatosDNI } from "@/lib/dni-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const frontImage = typeof body?.frontImage === "string" ? body.frontImage : "";
    const backImage = typeof body?.backImage === "string" ? body.backImage : undefined;

    if (!frontImage.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "No se recibió una imagen válida del frente del DNI." },
        { status: 400 }
      );
    }

    const resultado = await extraerDatosDNI(openai, frontImage, backImage);

    return NextResponse.json({ resultado });
  } catch (err: unknown) {
    console.error("Error en /api/escaneo-dni:", err);
    const message = err instanceof Error ? err.message : "Error al procesar la imagen del DNI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
