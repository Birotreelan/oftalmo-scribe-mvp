// ---------------------------------------------------------------------------
// Parseo del código PDF417 del frente del DNI argentino (formato tarjeta).
//
// El código codifica campos de texto separados por "@", en este orden (según
// la documentación pública usada por la comunidad de desarrolladores
// argentina — ver README, sección "Herramienta 5"):
//
//   0. Número de trámite
//   1. Apellidos (ambos, separados por espacio)
//   2. Nombres (ambos, separados por espacio)
//   3. Sexo (M / F)
//   4. Número de DNI
//   5. Ejemplar
//   6. Fecha de nacimiento (DD/MM/AAAA)
//   7. Fecha de emisión del documento (DD/MM/AAAA)
//   8. Inicio y fin de CUIL (3 caracteres: 2 antes del primer guión + 1
//      después del segundo — NO es el CUIL completo)
//
// Es una fuente determinística (no hay "IA adivinando"), por eso estos
// campos tienen prioridad sobre lo que devuelva la extracción por visión
// cuando ambas estén disponibles. Limitación conocida: el PDF417 solo admite
// ASCII imprimible, así que "ñ"/"ü" y las vocales acentuadas pueden venir
// deformadas (por ejemplo "Núñez" como "NUXXES") — por eso el apellido y el
// nombre igual conviene confirmarlos a simple vista contra la foto.
// ---------------------------------------------------------------------------

export type DniBarcodeFields = {
  numeroTramite: string | null;
  apellido: string | null;
  nombre: string | null;
  sexo: "M" | "F" | null;
  dni: string | null;
  ejemplar: string | null;
  fechaNacimiento: string | null;
  fechaEmision: string | null;
  cuilParcial: string | null;
  posibleNombreDeformado: boolean;
};

function fechaBarraAIso(valor: string | undefined): string | null {
  if (!valor) return null;
  const match = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * Parsea el valor crudo decodificado del PDF417 del frente del DNI.
 * Devuelve null si el string no tiene la forma esperada (al menos 8 campos
 * separados por "@") — en ese caso no es un DNI argentino reconocible, o el
 * lector devolvió datos incompletos/corruptos.
 */
export function parseDniPdf417(rawValue: string): DniBarcodeFields | null {
  const partes = rawValue.split("@").map((p) => p.trim());
  if (partes.length < 8) return null;

  const [
    numeroTramite,
    apellido,
    nombre,
    sexoRaw,
    dniRaw,
    ejemplar,
    fechaNacRaw,
    fechaEmiRaw,
    cuilParcial,
  ] = partes;

  const sexo = sexoRaw === "M" || sexoRaw === "F" ? sexoRaw : null;
  const dni = dniRaw ? dniRaw.replace(/\D/g, "") : null;
  const nombreCompleto = `${apellido ?? ""}${nombre ?? ""}`;

  return {
    numeroTramite: numeroTramite || null,
    apellido: apellido || null,
    nombre: nombre || null,
    sexo,
    dni: dni || null,
    ejemplar: ejemplar || null,
    fechaNacimiento: fechaBarraAIso(fechaNacRaw),
    fechaEmision: fechaBarraAIso(fechaEmiRaw),
    cuilParcial: cuilParcial || null,
    // Heurística simple para avisar (no corregir) posibles nombres con
    // ñ/tildes deformados por la limitación ASCII del PDF417.
    posibleNombreDeformado: /XX/.test(nombreCompleto),
  };
}
