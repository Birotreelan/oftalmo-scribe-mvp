import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { generarResumenConsulta } from "@/lib/hc-analysis";

export const runtime = "nodejs";
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type DiarizedSegment = {
  speaker?: string;
  speaker_label?: string;
  text?: string;
  transcript?: string;
  start?: number;
  end?: number;
};

function buildDiarizedText(raw: unknown): { diarizedText: string; segmentCount: number } {
  // La forma exacta de la respuesta de gpt-4o-transcribe-diarize es reciente
  // y puede variar; este parser es defensivo: intenta leer "segments" con
  // nombres de campo alternativos, y si no puede, cae al texto plano.
  if (raw && typeof raw === "object") {
    const obj = raw as { segments?: DiarizedSegment[]; text?: string };

    if (Array.isArray(obj.segments) && obj.segments.length > 0) {
      const lines = obj.segments.map((seg) => {
        const speaker = seg.speaker ?? seg.speaker_label ?? "Hablante";
        const text = seg.text ?? seg.transcript ?? "";
        return `${speaker}: ${text}`.trim();
      });
      return { diarizedText: lines.join("\n"), segmentCount: obj.segments.length };
    }

    if (typeof obj.text === "string" && obj.text.trim()) {
      return { diarizedText: obj.text.trim(), segmentCount: 0 };
    }
  }

  if (typeof raw === "string" && raw.trim()) {
    return { diarizedText: raw.trim(), segmentCount: 0 };
  }

  return { diarizedText: "", segmentCount: 0 };
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar OPENAI_API_KEY en el servidor." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";

    if (!blobUrl) {
      return NextResponse.json({ error: "No se recibió blobUrl." }, { status: 400 });
    }

    const audioRes = await fetch(blobUrl);
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: `No se pudo descargar el audio subido (status ${audioRes.status}).` },
        { status: 502 }
      );
    }
    const audioBuffer = await audioRes.arrayBuffer();

    const contentType = audioRes.headers.get("content-type") || "audio/webm";
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: contentType }), "consulta.webm");
    formData.append("model", "gpt-4o-transcribe-diarize");
    formData.append("response_format", "diarized_json");
    formData.append("chunking_strategy", "auto");

    const transcriptionRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const transcriptionJson = await transcriptionRes.json();

    if (!transcriptionRes.ok) {
      console.error("Error de OpenAI en transcripción diarizada:", transcriptionJson);
      return NextResponse.json(
        {
          error:
            transcriptionJson?.error?.message ||
            "Error al transcribir el audio con diarización.",
        },
        { status: 502 }
      );
    }

    // Log del payload crudo: útil para ajustar el parser si el formato real
    // de la respuesta difiere de lo esperado (revisar en los logs de Vercel).
    console.log("[procesar-consulta] respuesta cruda de OpenAI:", JSON.stringify(transcriptionJson).slice(0, 2000));

    const { diarizedText, segmentCount } = buildDiarizedText(transcriptionJson);

    if (!diarizedText) {
      return NextResponse.json(
        { error: "No se pudo obtener transcripción del audio." },
        { status: 422 }
      );
    }

    const summary = await generarResumenConsulta(openai, diarizedText);

    return NextResponse.json({
      diarizedText,
      segmentCount,
      summary,
    });
  } catch (err: unknown) {
    console.error("Error en /api/procesar-consulta:", err);
    const message = err instanceof Error ? err.message : "Error al procesar la consulta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
