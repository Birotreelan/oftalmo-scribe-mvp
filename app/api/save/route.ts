import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// NOTA PARA EL EQUIPO: este endpoint es un stub para el MVP.
// En el siguiente paso del proyecto, acá se debe llamar a la API real del
// sistema médico para persistir la nota en la Historia Clínica del paciente
// correspondiente (usando el patientId/consultaId que el sistema host le
// pase al widget). Por ahora solo se registra en los logs del servidor.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const note = typeof body?.note === "string" ? body.note : "";
    const datosEstructurados = body?.datosEstructurados ?? null;

    if (!note.trim()) {
      return NextResponse.json({ error: "La nota está vacía." }, { status: 400 });
    }

    // El JSON estructurado (datosEstructurados) es lo que en la integración
    // real se mandaría al endpoint de alta de consulta del sistema médico,
    // en vez de (o además de) el texto libre de la nota.
    console.log("[save] Nota recibida para guardar (simulado):", {
      length: note.length,
      datosEstructurados,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      savedAt: new Date().toISOString(),
      message: "Nota guardada (simulado). Falta conectar con el sistema real.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
