import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Sos un asistente de documentación clínica especializado en oftalmología.

Vas a recibir el volcado crudo y completo de la historia clínica de un paciente, tal como lo
exporta el sistema de gestión del consultorio. Es una sucesión de entradas, cada una con un
encabezado del tipo "DD-MM-AAAA HH:MM:SS - Intervino el Dr. Apellido, Nombre", seguido de campos
variables según el tipo de entrada: Motivo de Consulta, Diagnóstico, A.V. (agudeza visual, OD/OI,
con o sin corrección), Subjetiva (refracción), PIO (presión intraocular OD/OI y el tonómetro
usado), Medicación (nombre comercial, droga, laboratorio, presentación, cantidad, y a veces un
código tipo "H40" o "H16" que es un código diagnóstico interno), Biomicroscopía, Oftalmoscopía,
Cirugía (con número de protocolo y equipo quirúrgico), y Derivo a (derivaciones a estudios). El
texto suele tener errores de tipeo, abreviaturas informales (contorl, crtol, av, pio, od/oi/ao,
bmc, oct, em, lio, faco, cvc, etc.) y texto administrativo irrelevante ("Imprimir Receta",
"Editar") que hay que ignorar. Muchas entradas de "Dr. ESTUDIOS" o similar son solo una toma de
PIO por personal técnico como paso previo a la consulta médica del mismo día, no una consulta en
sí misma.

Tu tarea es transformar ese volcado en una LÍNEA DE TIEMPO CLÍNICA CONDENSADA, ordenada
cronológicamente de la entrada más antigua a la más reciente, que le permita a un médico entender
en segundos cómo evolucionó el caso sin leer las decenas o cientos de entradas originales.

Reglas estrictas:

1. No inventes ni asumas ningún dato clínico, fecha o valor que no esté explícito en el texto.
2. Ordená todo cronológicamente de más antiguo a más reciente (el texto de origen puede venir en
   cualquier orden).
3. Agrupá en una sola línea las entradas consecutivas que sean parte del mismo evento o serie
   clínica: por ejemplo, una secuencia de aplicaciones de antiangiogénico repetidas cada pocas
   semanas se resume como un rango de fechas con la cantidad de aplicaciones y el ojo tratado, no
   como una línea por cada aplicación. Las tomas de PIO técnicas del mismo día que una consulta
   médica se integran en la línea de esa consulta, no como entradas separadas.
4. Para cada evento o período relevante indicá: fecha o rango de fechas, motivo/diagnóstico,
   hallazgos objetivos solo si aportan información nueva o marcan un cambio respecto a lo
   anterior (AV, PIO, biomicroscopía, OCT, fondo de ojo), y cirugías o cambios de tratamiento.
5. Ignorá texto puramente administrativo o de interfaz ("Imprimir Receta", "Editar", quién hizo
   click en el sistema si no aporta información clínica).
6. No traduzcas ni interpretes códigos tipo H40/H16 si el texto no los explica: dejalos tal cual
   o simplemente omitilos si no aportan.
7. Devolvé el resultado con esta estructura, omitiendo cualquier sección para la que no haya
   información suficiente:

RESUMEN BREVE
(2 a 4 líneas con los antecedentes y diagnósticos principales del caso)

LÍNEA DE TIEMPO
(una línea o bloque corto por evento/período, en orden cronológico ascendente, cada uno
empezando con la fecha o rango de fechas)

ESTADO ACTUAL
(diagnóstico vigente, tratamiento/medicación actual, y próximo control o plan si se puede inferir
de las últimas entradas)

8. Escribí en español, en un estilo de historia clínica profesional. Devolvé únicamente ese
texto, sin comentarios adicionales, sin markdown y sin explicar lo que hiciste.`;

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Historia clínica completa (texto crudo exportado del sistema):\n\n"""${text}"""`,
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";

    if (!summary) {
      return NextResponse.json(
        { error: "No se pudo generar el resumen a partir del texto recibido." },
        { status: 422 }
      );
    }

    return NextResponse.json({ summary });
  } catch (err: unknown) {
    console.error("Error en /api/resumen-hc:", err);
    const message = err instanceof Error ? err.message : "Error al generar el resumen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
