# Nota clínica por voz — MVP (Oftalmología)

Prototipo: el médico graba un dictado breve al finalizar la consulta, se transcribe con la API
de OpenAI y se ensambla automáticamente en un borrador de nota clínica editable, lista para
copiar a la Historia Clínica.

## Cómo funciona

1. El médico toca "grabar" y dicta libremente durante segundos o minutos.
2. Al detener la grabación, el audio se envía a `/api/transcribe`.
3. Esa ruta transcribe el audio con `gpt-4o-transcribe` y luego usa `gpt-4o` para reordenar el
   texto en una nota clínica prolija (con secciones típicas de oftalmología cuando aplica:
   agudeza visual, PIO, biomicroscopía, fondo de ojo, etc.).
4. El resultado se muestra en un textarea editable.
5. Al tocar "Guardar en HC" se envía a `/api/save`, que por ahora es un **stub** (solo loguea y
   confirma) — se reemplaza en el siguiente paso por la integración real con el sistema médico.

## Herramienta 2: resumen de historia clínica completa

En `/resumen-hc` se puede pegar el volcado crudo de toda la historia clínica de un paciente
(ficha del paciente, antecedentes personales/familiares y consultas, tal como lo exporta el
sistema) y generar un resumen con `gpt-4o`: datos del paciente, alertas de seguridad (alergias y
comorbilidades relevantes, siempre destacadas), antecedentes, resumen breve, línea de tiempo
cronológica agrupando eventos similares (por ejemplo, series de inyecciones intravítreas), y
estado/tratamiento actual. Endpoint: `/api/resumen-hc`.

## Herramienta 3: tendencia de PIO/AV y alerta de control atrasado

En `/tendencia-hc` se pega el mismo tipo de volcado y se extraen, vía `structured outputs` de
OpenAI (JSON con schema estricto, no texto libre), tres series con fecha: PIO (OD/OI),
agudeza visual (fracción y decimal, OD/OI) y eventos de tratamiento/cirugía normalizados a un
puñado de categorías (inyección antiVEGF, inyección de triamcinolona, cirugía de catarata,
vitrectomía, otro). Con esos datos ya estructurados, el propio código (no el modelo) calcula:

- Gráficos de PIO y AV en el tiempo (con `recharts`).
- Alertas de seguimiento atrasado: agrupa los eventos de tratamiento por tipo + ojo, calcula el
  intervalo típico histórico entre eventos (mediana), y si pasó más de 1.5x ese intervalo desde
  el último evento, marca una alerta orientativa de posible atraso.

Endpoint: `/api/tendencia-hc`. La lógica de fechas/alertas es determinística en TypeScript, no
depende del modelo, para que sea confiable y auditable.

## Configuración

Variable de entorno requerida:

```
OPENAI_API_KEY=sk-...
```

En Vercel: Project Settings → Environment Variables → agregar `OPENAI_API_KEY` para Production
(y Preview si se va a probar ahí) y volver a desplegar.

En local: copiar `.env.example` a `.env.local` y completar la clave.

## Desarrollo local

```
npm install
npm run dev
```

Requiere HTTPS o `localhost` para que el navegador habilite el acceso al micrófono.

## Próximos pasos (fuera de este MVP)

- Reemplazar `/api/save` por la integración real con la Historia Clínica del sistema médico.
- Grabación de la consulta completa (médico + paciente) con diarización de hablantes.
- Salida estructurada (JSON) mapeada a los campos exactos de la HC, no solo texto libre.
- Empaquetar como widget embebible (iframe o web component) para insertar en el sistema host.
