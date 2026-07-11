import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Genera el token de subida directa a Vercel Blob para el audio de la
// consulta completa. El audio nunca pasa por esta función (solo el token y,
// al final, la confirmación) — así se evita el límite de 4.5 MB por request
// de las funciones de Vercel, que un audio de una consulta larga supera
// fácilmente.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4"],
          addRandomSuffix: true,
          maximumSizeInBytes: 300 * 1024 * 1024, // 300 MB, margen amplio para consultas largas
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[consulta-upload] audio subido:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al generar el token de subida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
