import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { GLOSARIO_PROMPT_TRANSCRIPCION, generarNotaDictado } from "@/lib/hc-analysis";

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
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No se recibió audio." }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const file = await toFile(Buffer.from(arrayBuffer), "dictado.webm", {
      type: audioFile.type || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-transcribe",
      language: "es",
      prompt: GLOSARIO_PROMPT_TRANSCRIPCION,
    });

    const transcript = transcription.text?.trim() ?? "";

    if (!transcript) {
      return NextResponse.json(
        { error: "No se detectó voz en la grabación. Probá de nuevo." },
        { status: 422 }
      );
    }

    const { nota, datosEstructurados } = await generarNotaDictado(openai, transcript);

    return NextResponse.json({
      transcript,
      note: nota?.trim() || transcript,
      datosEstructurados,
    });
  } catch (err: unknown) {
    console.error("Error en /api/transcribe:", err);
    const message = err instanceof Error ? err.message : "Error al procesar el audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
