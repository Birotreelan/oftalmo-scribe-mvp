import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXTRACTION_SYSTEM_PROMPT = `Sos un asistente que extrae datos estructurados de historias
clínicas oftalmológicas en texto crudo (formato "DD-MM-AAAA HH:MM:SS - Intervino el Dr. ...",
con campos como PIO, A.V., Subjetiva, Cirugía, etc., con errores de tipeo y abreviaturas).

Extraé TRES listas de la transcripción recibida:

1. "pio": una entrada por cada línea "PIO: OD: X - OI: Y" que tenga fecha asociada (la fecha de
   la entrada donde aparece esa línea). Convertí el valor a número; si dice "ERR", está vacío, o
   no es un número válido, usá null en ese ojo.

2. "av": una entrada por cada línea de agudeza visual con fecha asociada, ya sea "A.V. sin
   corrección Lejos: OD: ... OI: ..." o, si esa no está, "Subjetiva Lejos: ... AV: ...". Guardá
   la fracción tal como aparece (ej. "20/80") en *_fraction, y también su equivalente decimal en
   *_decimal (20/80 = 0.25; si el valor no es una fracción interpretable, usá null en ambos).

3. "treatments": una entrada por cada cirugía o procedimiento intraocular relevante (líneas que
   empiezan con "Cirugia:"). Normalizá el "type" a una de estas categorías canónicas según lo que
   más se parezca (no inventes categorías nuevas salvo que no encaje en ninguna):
   - "Inyección antiVEGF" (para "APLIC SUST ANTI-VEGF", "APLICACION DE SUSTANCIA ANTIGI",
     "aplicación de sustancia antiangiogénica", etc.)
   - "Inyección de triamcinolona"
   - "Cirugía de catarata (FACO+IOL)"
   - "Vitrectomía"
   - "Otro procedimiento" (para cualquier cirugía que no encaje claramente en las anteriores;
     conservá una versión corta del texto original en el campo type, ej. "Otro procedimiento: YAG láser")
   Incluí el ojo tratado (OD, OI, AO) si se menciona, o null si no se puede determinar.

Reglas:
- No inventes valores ni fechas que no estén en el texto.
- Todas las fechas en formato "YYYY-MM-DD".
- Si una misma línea de PIO o AV no tiene fecha clara asociada, no la incluyas.
- Devolvé únicamente el JSON solicitado, sin texto adicional.`;

const RESPONSE_SCHEMA = {
  name: "extraccion_hc_tendencia",
  strict: true,
  schema: {
    type: "object",
    properties: {
      pio: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
            od: { type: ["number", "null"] },
            oi: { type: ["number", "null"] },
          },
          required: ["date", "od", "oi"],
          additionalProperties: false,
        },
      },
      av: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
            od_fraction: { type: ["string", "null"] },
            od_decimal: { type: ["number", "null"] },
            oi_fraction: { type: ["string", "null"] },
            oi_decimal: { type: ["number", "null"] },
          },
          required: ["date", "od_fraction", "od_decimal", "oi_fraction", "oi_decimal"],
          additionalProperties: false,
        },
      },
      treatments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
            type: { type: "string" },
            eye: { type: ["string", "null"] },
          },
          required: ["date", "type", "eye"],
          additionalProperties: false,
        },
      },
    },
    required: ["pio", "av", "treatments"],
    additionalProperties: false,
  },
} as const;

type Extraction = {
  pio: { date: string; od: number | null; oi: number | null }[];
  av: {
    date: string;
    od_fraction: string | null;
    od_decimal: number | null;
    oi_fraction: string | null;
    oi_decimal: number | null;
  }[];
  treatments: { date: string; type: string; eye: string | null }[];
};

type Alert = {
  type: string;
  eye: string | null;
  lastDate: string;
  daysSinceLast: number;
  typicalIntervalDays: number;
  eventCount: number;
  message: string;
};

function isValidIsoDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d).getTime());
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeOverdueAlerts(treatments: Extraction["treatments"]): Alert[] {
  const valid = treatments.filter((t) => isValidIsoDate(t.date));

  const groups = new Map<string, { type: string; eye: string | null; dates: Date[] }>();
  for (const t of valid) {
    const key = `${t.type}__${t.eye ?? "null"}`;
    if (!groups.has(key)) {
      groups.set(key, { type: t.type, eye: t.eye, dates: [] });
    }
    groups.get(key)!.dates.push(new Date(t.date));
  }

  const now = new Date();
  const alerts: Alert[] = [];

  for (const group of groups.values()) {
    if (group.dates.length < 3) continue;

    const sorted = [...group.dates].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    const typicalInterval = median(intervals);
    const lastDate = sorted[sorted.length - 1];
    const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

    if (typicalInterval > 0 && daysSinceLast > typicalInterval * 1.5) {
      const eyeLabel = group.eye ? ` ${group.eye}` : "";
      alerts.push({
        type: group.type,
        eye: group.eye,
        lastDate: lastDate.toISOString().slice(0, 10),
        daysSinceLast: Math.round(daysSinceLast),
        typicalIntervalDays: Math.round(typicalInterval),
        eventCount: sorted.length,
        message: `${group.type}${eyeLabel}: última el ${lastDate.toISOString().slice(0, 10)} (hace ${Math.round(
          daysSinceLast
        )} días). El intervalo habitual entre eventos es de ~${Math.round(
          typicalInterval
        )} días (calculado sobre ${sorted.length} eventos), por lo que el paciente podría estar atrasado en su seguimiento.`,
      });
    }
  }

  return alerts.sort((a, b) => b.daysSinceLast - a.daysSinceLast);
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
    const text = typeof body?.text === "string" ? body.text : "";

    if (!text.trim()) {
      return NextResponse.json({ error: "No se recibió texto de la historia clínica." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Historia clínica completa (texto crudo exportado del sistema):\n\n"""${text}"""`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: RESPONSE_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Extraction;

    const pio = (parsed.pio ?? [])
      .filter((p) => isValidIsoDate(p.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const av = (parsed.av ?? [])
      .filter((a) => isValidIsoDate(a.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const treatments = (parsed.treatments ?? [])
      .filter((t) => isValidIsoDate(t.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const alerts = computeOverdueAlerts(treatments);

    return NextResponse.json({ pio, av, treatments, alerts });
  } catch (err: unknown) {
    console.error("Error en /api/tendencia-hc:", err);
    const message = err instanceof Error ? err.message : "Error al analizar la historia clínica.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
