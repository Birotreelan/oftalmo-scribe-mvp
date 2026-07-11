import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Herramienta: escaneo de DNI argentino → JSON para admisión de paciente
//
// Etapa actual (MVP, decidido junto con el usuario): extracción por visión
// (GPT-4o + structured outputs) leyendo directamente la imagen del frente
// (y opcionalmente el dorso) del documento. Es la vía más rápida de poner en
// marcha, pero depende de que el texto impreso sea legible en la foto.
//
// Etapa futura (ya asesorada, pendiente de construir): sumar como fuente
// primaria la decodificación del código de barras PDF417 del frente
// (formato documentado: numeroTramite@apellidos@nombres@sexo@dni@ejemplar@
// fechaNacimiento@fechaEmision@inicioYFinCUIL, separados por "@") y el
// parseo de la zona de lectura mecánica (MRZ) del dorso, ambos determinísticos
// y más confiables que la visión por LLM para los campos numéricos (DNI,
// CUIL). La visión quedaría como método de respaldo cuando el código de
// barras no sea legible, y para el resto de los datos que el código no trae.
// ---------------------------------------------------------------------------

export const DNI_EXTRACTION_SYSTEM_PROMPT = `Sos un asistente que extrae datos estructurados del
Documento Nacional de Identidad (DNI) argentino a partir de una o dos fotos (frente, y
opcionalmente dorso) para precargar un formulario de admisión de paciente.

El DNI argentino en formato tarjeta (el más común) tiene en el frente: foto, apellido, nombre,
sexo, fecha de nacimiento, nacionalidad, ejemplar (letra que indica qué copia del documento es) y
número de documento. El dorso suele tener domicilio, fecha de emisión, número de trámite y CUIL.
También puede tratarse del formato anterior tipo "libreta" (más antiguo, menos común hoy), con
datos similares pero otra disposición.

Reglas estrictas:
1. Extraé únicamente lo que puedas leer con claridad en la imagen. Si un campo no está visible,
   está borroso, tapado, o tenés cualquier duda razonable sobre un dígito o letra, usá null en ese
   campo y agregalo a "camposDudosos" — NUNCA completes un número de documento, CUIL o fecha
   "adivinando" un dígito que no se lee bien. Esto es un dato de identidad de una persona real: un
   error silencioso es peor que dejar el campo vacío para que lo confirme un humano.
2. Convertí las fechas a formato "YYYY-MM-DD" cuando puedas interpretarlas sin ambigüedad; si el
   formato original es ambiguo o ilegible, dejá el campo en null y anotá el texto tal cual se ve
   en "observaciones".
3. Si la imagen no corresponde a un DNI argentino (otro documento, o algo que no es un documento
   de identidad), indicá "tipoDocumento": "no reconocido" y dejá el resto de los campos en null.
4. Evaluá tu propia confianza en el resultado ("alta" si el documento se ve nítido y todos los
   campos clave se leyeron con claridad; "media" si hay algún campo dudoso pero los principales
   están claros; "baja" si la imagen está borrosa, con reflejos, o faltan campos importantes).
5. No agregues comentarios fuera del JSON solicitado.`;

export const DNI_RESPONSE_SCHEMA = {
  name: "extraccion_dni_argentino",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tipoDocumento: {
        type: "string",
        enum: ["DNI tarjeta", "DNI libreta", "no reconocido"],
      },
      numeroTramite: { type: ["string", "null"] },
      apellido: { type: ["string", "null"] },
      nombre: { type: ["string", "null"] },
      sexo: { type: ["string", "null"], enum: ["M", "F", "X", null] },
      dni: { type: ["string", "null"], description: "Solo dígitos, sin puntos." },
      ejemplar: { type: ["string", "null"] },
      fechaNacimiento: { type: ["string", "null"], description: "Formato YYYY-MM-DD si es interpretable." },
      fechaEmision: { type: ["string", "null"], description: "Formato YYYY-MM-DD si es interpretable." },
      nacionalidad: { type: ["string", "null"] },
      cuil: { type: ["string", "null"], description: "Solo dígitos y guiones, tal como se ve." },
      domicilio: { type: ["string", "null"] },
      confianza: { type: "string", enum: ["alta", "media", "baja"] },
      camposDudosos: { type: "array", items: { type: "string" } },
      observaciones: { type: ["string", "null"] },
    },
    required: [
      "tipoDocumento",
      "numeroTramite",
      "apellido",
      "nombre",
      "sexo",
      "dni",
      "ejemplar",
      "fechaNacimiento",
      "fechaEmision",
      "nacionalidad",
      "cuil",
      "domicilio",
      "confianza",
      "camposDudosos",
      "observaciones",
    ],
    additionalProperties: false,
  },
} as const;

export type DniExtraction = {
  tipoDocumento: "DNI tarjeta" | "DNI libreta" | "no reconocido";
  numeroTramite: string | null;
  apellido: string | null;
  nombre: string | null;
  sexo: "M" | "F" | "X" | null;
  dni: string | null;
  ejemplar: string | null;
  fechaNacimiento: string | null;
  fechaEmision: string | null;
  nacionalidad: string | null;
  cuil: string | null;
  domicilio: string | null;
  confianza: "alta" | "media" | "baja";
  camposDudosos: string[];
  observaciones: string | null;
};

export async function extraerDatosDNI(
  openai: OpenAI,
  frontImageDataUrl: string,
  backImageDataUrl?: string
): Promise<DniExtraction> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: DNI_EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: backImageDataUrl
          ? [
              {
                type: "text",
                text: "Frente y dorso del DNI adjuntos. Extraé los datos según las reglas indicadas.",
              },
              { type: "image_url", image_url: { url: frontImageDataUrl } },
              { type: "image_url", image_url: { url: backImageDataUrl } },
            ]
          : [
              {
                type: "text",
                text: "Frente del DNI adjunto (sin dorso). Extraé los datos según las reglas indicadas.",
              },
              { type: "image_url", image_url: { url: frontImageDataUrl } },
            ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: DNI_RESPONSE_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as DniExtraction;
}
