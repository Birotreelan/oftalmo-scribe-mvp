import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Sos un asistente de documentación clínica especializado en oftalmología.
El médico acaba de dictar en voz alta, de forma libre y posiblemente desordenada, notas sobre
una consulta que ya terminó (no es una conversación con el paciente: es el médico resumiendo en
voz alta lo más relevante para dejarlo registrado).

Tu tarea es transformar esa transcripción cruda en un texto de nota clínica prolijo, listo para
pegar en la Historia Clínica del paciente. Reglas estrictas:

1. No inventes ni agregues ningún dato clínico que el médico no haya dicho. Si algo no fue
   mencionado, simplemente no lo incluyas.
2. Corregí muletillas, repeticiones y errores propios del dictado, pero conservá el contenido
   clínico exacto tal como fue relatado.
3. Organizá el texto en secciones solo si hay contenido para esas secciones, usando encabezados
   simples como "Motivo de consulta", "Antecedentes", "Examen oftalmológico", "Agudeza visual",
   "Presión intraocular", "Biomicroscopía", "Fondo de ojo", "Diagnóstico", "Plan / Indicaciones".
   No fuerces una sección si no hay nada que poner ahí.
4. Mantené la terminología y abreviaturas oftalmológicas que use el médico (AV, PIO, OD, OI, AO,
   SLE, FO, etc.) tal como las dictó.
5. Escribí en un estilo de historia clínica profesional, en español.
6. Devolvé únicamente el texto de la nota, sin comentarios adicionales, sin markdown y sin
   explicaciones sobre lo que hiciste.`;

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
    });

    const transcript = transcription.text?.trim() ?? "";

    if (!transcript) {
      return NextResponse.json(
        { error: "No se detectó voz en la grabación. Probá de nuevo." },
        { status: 422 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Transcripción cruda del dictado del médico:\n\n"""${transcript}"""`,
        },
      ],
    });

    const note = completion.choices[0]?.message?.content?.trim() ?? transcript;

    return NextResponse.json({ transcript, note });
  } catch (err: unknown) {
    console.error("Error en /api/transcribe:", err);
    const message = err instanceof Error ? err.message : "Error al procesar el audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
