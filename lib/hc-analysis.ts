import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Herramienta: resumen de consulta completa (médico + paciente, diarizada)
// ---------------------------------------------------------------------------

export const CONSULTA_SYSTEM_PROMPT = `Sos un asistente de documentación clínica especializado en
oftalmología. Vas a recibir la transcripción diarizada de una consulta completa entre un médico
oftalmólogo y su paciente (a veces con un acompañante). La transcripción viene dividida en
segmentos, cada uno con una etiqueta de hablante genérica (por ejemplo "Speaker 1", "Speaker 2")
que NO indica todavía quién es el médico y quién el paciente.

Tu primera tarea es deducir, únicamente por el contenido de lo que dice cada hablante (quién hace
preguntas clínicas, indica estudios, explica diagnósticos o tratamientos, versus quién describe
síntomas en lenguaje coloquial o responde preguntas sobre su cuadro), quién es el médico, quién es
el paciente, y si hay un tercer hablante (acompañante/familiar), marcarlo como tal. Si en algún
tramo no podés determinarlo con confianza, indicá el hablante genérico en vez de adivinar.

Tu segunda tarea es generar una nota clínica de la consulta a partir de ese diálogo, con esta
estructura (omitiendo cualquier sección sin información suficiente):

MOTIVO DE CONSULTA
(lo que el paciente refiere, en pocas líneas)

ANAMNESIS / SÍNTOMAS REFERIDOS POR EL PACIENTE
(lo que el paciente cuenta con sus propias palabras, reformulado de forma clara)

EXAMEN / HALLAZGOS MENCIONADOS POR EL MÉDICO
(agudeza visual, PIO, biomicroscopía, fondo de ojo u otros hallazgos que el médico haya dictado o
comentado en voz alta durante la consulta)

DIAGNÓSTICO
(si el médico lo menciona explícitamente)

PLAN / INDICACIONES
(tratamiento, medicación, estudios solicitados, próximo control, tal como se lo explicó al
paciente)

Reglas estrictas:
1. No inventes ni asumas ningún dato que no esté explícito en la transcripción.
2. No traduzcas jerga médica a términos técnicos que el médico no usó, ni inventes valores.
3. Si la transcripción tiene errores evidentes de reconocimiento de voz, no los corrijas
   adivinando: dejá el texto tal como se entiende razonablemente.
4. Escribí en español, en un estilo de historia clínica profesional.
5. Devolvé únicamente la nota con la estructura pedida, sin comentarios adicionales, sin markdown
   y sin explicar tu razonamiento sobre quién es quién.`;

export async function generarResumenConsulta(
  openai: OpenAI,
  diarizedTranscript: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      { role: "system", content: CONSULTA_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Transcripción diarizada de la consulta:\n\n"""${diarizedTranscript}"""`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Herramienta: resumen de historia clínica completa
// ---------------------------------------------------------------------------

export const RESUMEN_SYSTEM_PROMPT = `Sos un asistente de documentación clínica especializado en oftalmología.

Vas a recibir el volcado crudo y completo de la historia clínica de un paciente, tal como lo
exporta el sistema de gestión del consultorio. Puede incluir dos partes (a veces solo viene una
de las dos):

A) Un bloque de ENCABEZADO/FICHA DEL PACIENTE, con datos tipo "HC: 105233 - Apellido, Nombre",
   teléfono, cobertura/obra social y plan, DNI, domicilio, fecha de nacimiento y edad, fecha de
   primera y última visita, y una sección "ANTECEDENTES PERSONALES Y FAMILIARES" con ítems de
   texto libre seguidos de "desde: DD-MM-AAAA" (por ejemplo antecedentes quirúrgicos previos,
   diagnósticos crónicos, alergias medicamentosas, comorbilidades como HTA, o notas sociales).
   También puede venir una lista de "ETIQUETAS" con nombres de procedimientos/cirugías.

B) Una sucesión de entradas de CONSULTAS, cada una con un encabezado del tipo "DD-MM-AAAA
   HH:MM:SS - Intervino el Dr. Apellido, Nombre", seguido de campos variables según el tipo de
   entrada: Motivo de Consulta, Diagnóstico, A.V. (agudeza visual, OD/OI, con o sin corrección),
   Subjetiva (refracción), PIO (presión intraocular OD/OI y el tonómetro usado), Medicación
   (nombre comercial, droga, laboratorio, presentación, cantidad, y a veces un código tipo "H40"
   o "H16" que es un código diagnóstico interno), Biomicroscopía, Oftalmoscopía, Cirugía (con
   número de protocolo y equipo quirúrgico), y Derivo a (derivaciones a estudios).

El texto suele tener errores de tipeo, abreviaturas informales (contorl, crtol, av, pio,
od/oi/ao, bmc, oct, em, lio, faco, cvc, etc.) y texto administrativo irrelevante ("Imprimir
Receta", "Editar") que hay que ignorar. Muchas entradas de "Dr. ESTUDIOS" o similar son solo una
toma de PIO por personal técnico como paso previo a la consulta médica del mismo día, no una
consulta en sí misma.

Tu tarea es transformar todo eso en un resumen clínico condensado que le permita a un médico
entender en segundos quién es el paciente, qué riesgos de seguridad tiene que tener presentes, y
cómo evolucionó el caso, sin leer las decenas o cientos de entradas originales.

Reglas estrictas:

1. No inventes ni asumas ningún dato clínico, fecha o valor que no esté explícito en el texto.
2. Ordená la línea de tiempo de más antiguo a más reciente (el texto de origen puede venir en
   cualquier orden).
3. Agrupá en una sola línea las entradas consecutivas que sean parte del mismo evento o serie
   clínica: por ejemplo, una secuencia de aplicaciones de antiangiogénico repetidas cada pocas
   semanas se resume como un rango de fechas con la cantidad de aplicaciones y el ojo tratado, no
   como una línea por cada aplicación. Las tomas de PIO técnicas del mismo día que una consulta
   médica se integran en la línea de esa consulta, no como entradas separadas.
4. Para cada evento o período relevante de la línea de tiempo indicá: fecha o rango de fechas,
   motivo/diagnóstico, hallazgos objetivos solo si aportan información nueva o marcan un cambio
   respecto a lo anterior (AV, PIO, biomicroscopía, OCT, fondo de ojo), y cirugías o cambios de
   tratamiento.
5. Ignorá texto puramente administrativo o de interfaz ("Imprimir Receta", "Editar", quién hizo
   click en el sistema si no aporta información clínica). La cobertura/obra social y el número de
   afiliado se mencionan solo una vez en los datos del paciente, no hace falta repetirlos.
6. No traduzcas ni interpretes códigos tipo H40/H16 si el texto no los explica: dejalos tal cual
   o simplemente omitilos si no aportan.
7. Prestá especial atención a cualquier antecedente de ALERGIA (medicamentosa o de otro tipo):
   siempre tiene que quedar en la sección de alertas, sin excepción, aunque el resto del resumen
   sea muy breve.
8. Devolvé el resultado con esta estructura, omitiendo cualquier sección para la que no haya
   información suficiente en el texto recibido:

DATOS DEL PACIENTE
(nombre, edad, y cobertura si están disponibles, en 1-2 líneas; omitir si no vino el encabezado)

ALERTAS DE SEGURIDAD
(alergias medicamentosas u otras, y comorbilidades relevantes tipo HTA/diabetes que puedan
condicionar el tratamiento oftalmológico; si no hay ninguna, escribir "Sin alertas registradas")

ANTECEDENTES PERSONALES Y FAMILIARES
(lista breve de antecedentes relevantes con su fecha "desde" si aporta contexto; omitir si no
vino esa sección)

RESUMEN BREVE
(2 a 4 líneas con los diagnósticos y problemas activos principales del caso)

LÍNEA DE TIEMPO
(una línea o bloque corto por evento/período, en orden cronológico ascendente, cada uno
empezando con la fecha o rango de fechas)

ESTADO ACTUAL
(diagnóstico vigente, tratamiento/medicación actual, y próximo control o plan si se puede inferir
de las últimas entradas)

9. Escribí en español, en un estilo de historia clínica profesional. Devolvé únicamente ese
texto, sin comentarios adicionales, sin markdown y sin explicar lo que hiciste.`;

export async function generarResumenHC(openai: OpenAI, text: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      { role: "system", content: RESUMEN_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Historia clínica completa (texto crudo exportado del sistema):\n\n"""${text}"""`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Herramienta: tendencia de PIO/AV y alertas de seguimiento atrasado
// ---------------------------------------------------------------------------

export const EXTRACTION_SYSTEM_PROMPT = `Sos un asistente que extrae datos estructurados de historias
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

export const TENDENCIA_RESPONSE_SCHEMA = {
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

export type PioPoint = { date: string; od: number | null; oi: number | null };
export type AvPoint = {
  date: string;
  od_fraction: string | null;
  od_decimal: number | null;
  oi_fraction: string | null;
  oi_decimal: number | null;
};
export type Treatment = { date: string; type: string; eye: string | null };

export type Extraction = {
  pio: PioPoint[];
  av: AvPoint[];
  treatments: Treatment[];
};

export type Alert = {
  type: string;
  eye: string | null;
  lastDate: string;
  daysSinceLast: number;
  typicalIntervalDays: number;
  eventCount: number;
  message: string;
};

export function isValidIsoDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d).getTime());
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeOverdueAlerts(treatments: Treatment[]): Alert[] {
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

export async function analizarTendenciaHC(
  openai: OpenAI,
  text: string
): Promise<{ pio: PioPoint[]; av: AvPoint[]; treatments: Treatment[]; alerts: Alert[] }> {
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
      json_schema: TENDENCIA_RESPONSE_SCHEMA,
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

  return { pio, av, treatments, alerts };
}
