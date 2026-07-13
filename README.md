# Nota clínica por voz — MVP (Oftalmología)

Prototipo: el médico graba un dictado breve al finalizar la consulta, se transcribe con la API
de OpenAI y se ensambla automáticamente en un borrador de nota clínica editable, lista para
copiar a la Historia Clínica.

## Cómo funciona

1. El médico toca "grabar" y dicta libremente durante segundos o minutos.
2. Al detener la grabación, el audio se envía a `/api/transcribe`.
3. Esa ruta transcribe el audio con `gpt-4o-transcribe` y luego usa `gpt-4o` con **structured
   outputs** (`lib/hc-analysis.ts` → `generarNotaDictado`) para generar, en una sola llamada, dos
   cosas siempre consistentes entre sí: el texto de nota clínica prolija de siempre (con secciones
   típicas de oftalmología cuando aplica: agudeza visual, PIO, biomicroscopía, fondo de ojo, etc.)
   y un JSON (`datosEstructurados`) con esos mismos datos separados en los campos que ya usa el
   sistema de gestión de la clínica (agudeza visual con/sin corrección por ojo, subjetiva, PIO con
   tonómetro, biomicroscopía, oftalmoscopía, diagnóstico, medicación indicada, plan, derivaciones,
   próximo control).
4. El resultado se muestra en un textarea editable, con un link "Ver JSON para el sistema" que
   despliega ese JSON (con botón para copiarlo) — pensado como preview de lo que se podría mandar
   directo al sistema médico en vez de reescribir la nota a mano.
5. Al tocar "Guardar en HC" se envía a `/api/save` (nota + JSON), que por ahora es un **stub**
   (solo loguea y confirma) — se reemplaza en el siguiente paso por la integración real con el
   sistema médico, que previsiblemente va a consumir `datosEstructurados` en vez del texto libre.

## Corrección de terminología médica (glosario oftalmológico)

En "Dictado de nota" y "Consulta completa" (los dos flujos que transcriben audio en vivo) se
usa un glosario oftalmológico compartido (`lib/hc-analysis.ts` → `GLOSARIO_OFTALMOLOGICO`) de dos
maneras:

1. Como parámetro `prompt` en la llamada de transcripción (`GLOSARIO_PROMPT_TRANSCRIPCION`,
   versión condensada), para sesgar al modelo de voz hacia vocabulario oftalmológico esperado
   (medicamentos, patologías, procedimientos, anatomía) antes de que intente reconocer el audio.
2. Como referencia de corrección contextual en el prompt que arma la nota final
   (`CORRECCION_TERMINOLOGIA_INSTRUCCIONES`), para que GPT-4o corrija errores de reconocimiento
   evidentes (ej. "Artan" → "losartán", "Pet Guillón" → "pterigion") usando el contexto clínico
   completo, no solo similitud fonética — sin que esto se convierta en una excusa para inventar
   datos que no se dijeron.

No se aplicó a "Resumen de HC completa" ni "Tendencia y alertas" porque esas herramientas
procesan texto ya escrito (exportado del sistema), no transcripción de audio en vivo.

**Excepción:** `gpt-4o-transcribe-diarize` (usado en "Consulta completa") no acepta el parámetro
`prompt` de sesgo — solo `gpt-4o-transcribe` (usado en "Dictado de nota") lo admite. Por eso en
"Consulta completa" la corrección de terminología ocurre únicamente en el paso siguiente (armado
del resumen con `gpt-4o`, vía `CORRECCION_TERMINOLOGIA_INSTRUCCIONES`), no como sesgo de la
transcripción en sí.

**Fuentes del glosario:** los principios activos están verificados contra el Formulario
Terapéutico Provincial de Santa Fe (Edición 2022, clasificación ATC oficial, sección S01
Oftalmológicos), la clasificación ATC/OMS para los subgrupos no cubiertos en ese extracto, y la
cobertura de antiangiogénicos de PAMI/INSSJP para esa categoría. La terminología (patologías,
procedimientos, anatomía, abreviaturas) está cruzada con el "Dictionary of Eye Terminology" de la
American Academy of Ophthalmology y EyeWiki (eyewiki.org). Además, se agregó una capa de nombres
comerciales (marcas) realmente vendidos en Argentina, consultados uno por uno en **Alfabeta**
(alfabeta.net, el vademécum que usa la clínica) — esto importa porque en la práctica lo que más
falla en la transcripción suele ser el nombre de fantasía de la gota, no el principio activo (ej.
"Ganfort", "Xalatan", "Combigan"). El detalle de cada fuente está citado como comentario en
`lib/hc-analysis.ts`, junto al glosario. La cobertura de marcas es una primera pasada sobre los
principios activos más frecuentes (antiglaucomatosos, antiinflamatorios/antibióticos oftálmicos,
midriáticos, antiangiogénicos); si en el uso real aparece una marca de otro principio activo que
la transcripción no reconoce, se agrega de la misma manera (consultada en Alfabeta, no adivinada).

## Medidor de nivel de micrófono + prueba de micrófono

Tanto "Dictado de nota" como "Consulta completa" muestran, mientras se está grabando, un medidor
animado de barras (`components/MicLevelMeter.tsx`) que refleja en tiempo real el volumen que está
captando el micrófono, calculado con la Web Audio API (`AnalyserNode` sobre el mismo `MediaStream`
de la grabación) en el hook `lib/useMicLevel.ts`. Sirve para que quien habla vea de inmediato que
el micrófono está funcionando, sin esperar a la transcripción.

Además, en `/prueba-microfono` se puede grabar unos segundos de prueba y reproducirlos al toque
(con el mismo medidor de nivel visible mientras se graba) para confirmar que el audio se escucha
bien antes de usar las otras herramientas — esta prueba no se transcribe ni se envía a ningún
lado, se reproduce localmente en el navegador.

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

## Herramienta 4: grabación de consulta completa (médico + paciente)

En `/consulta-completa` se graba la consulta entera (no solo el dictado del médico). El flujo:

1. El médico tilda el checkbox de consentimiento informado (obligatorio para habilitar el botón
   de grabar) y graba con el mismo mecanismo de `MediaRecorder` que el dictado corto, pero sin
   límite práctico de duración.
2. Al detener, el audio se sube **directo desde el navegador a Vercel Blob** (`@vercel/blob/client`,
   vía `/api/consulta-upload`), sin pasar por ninguna función serverless — esto es necesario
   porque las funciones de Vercel tienen un límite fijo de 4.5 MB por request, que una consulta
   larga supera fácilmente. El audio nunca llega a nuestro backend como archivo grande; solo la
   URL del blob.
3. `/api/procesar-consulta` toma esa URL, descarga el audio del lado del servidor y lo manda a
   `gpt-4o-transcribe-diarize` (modelo de OpenAI con diarización nativa incorporada, mismo costo
   que el modelo de transcripción normal: no hace falta un proveedor de diarización aparte).
4. La transcripción diarizada (hablantes separados, todavía sin saber cuál es médico y cuál
   paciente) se le pasa a `gpt-4o` con **structured outputs** (`generarNotaConsultaCompleta`), que
   deduce por el contenido de la conversación quién es quién y genera, en una sola llamada, la
   nota clínica de siempre (motivo de consulta, síntomas referidos por el paciente, hallazgos del
   examen, diagnóstico, plan) y el mismo JSON `datosEstructurados` que usa "Dictado de nota" (con
   un campo extra, `anamnesisPaciente`, para lo que el paciente relató con sus propias palabras).
   Es a propósito el mismo schema en ambas herramientas: el sistema médico solo necesita mapear un
   formato de JSON, sin importar si el origen fue un dictado corto o la consulta completa. Igual
   que en "Dictado de nota", la UI muestra un link "Ver JSON para el sistema" con botón para
   copiarlo.

**Nota sobre esta herramienta:** `gpt-4o-transcribe-diarize` es un modelo muy nuevo y la forma
exacta de su respuesta (`diarized_json`) puede no estar 100% documentada todavía. El parser en
`app/api/procesar-consulta/route.ts` (`buildDiarizedText`) es defensivo y cae a texto plano si no
encuentra el campo de segmentos esperado, y loguea el payload crudo de OpenAI en los logs de
Vercel — conviene revisar ese log la primera vez que se pruebe con audio real para confirmar que
el parser está leyendo bien los campos, y ajustarlo si hace falta.

**Requiere habilitar Vercel Blob:** en el dashboard del proyecto, pestaña "Storage" → "Create
Database" → "Blob", y conectarlo a este proyecto. Al conectarlo, Vercel agrega automáticamente
`BLOB_STORE_ID` y `BLOB_WEBHOOK_PUBLIC_KEY` (parte del esquema de autenticación OIDC, que es el
default desde 2026 para otros flujos de Blob). **Importante:** la subida desde el navegador que
usamos acá (`handleUpload`/`@vercel/blob/client`, necesaria para no pasar por el límite de 4.5 MB
de las funciones) siempre requiere el token clásico `BLOB_READ_WRITE_TOKEN` — no acepta OIDC. Si
no se agregó solo al conectar el store, hay que entrar al store en la pestaña Storage, generar un
"Read-Write Token" ahí, y cargarlo a mano como variable de entorno `BLOB_READ_WRITE_TOKEN` en el
proyecto. Como con cualquier variable nueva, hace falta un redeploy para que la función la vea.

**Identificación médico/paciente:** por ahora se decide por el contenido de la conversación
(sin muestra de voz previa). Si la precisión no alcanza, el siguiente paso es que cada médico
grabe una muestra de voz corta una vez, y pasarla como `known_speaker_references` a la API para
que etiquete sus segmentos directamente.

## Herramienta 5: escaneo de DNI argentino para admisión (MVP)

En `/escaneo-dni` se captura el frente del DNI (obligatorio) y opcionalmente el dorso, por cámara
o subiendo un archivo, y se extraen datos estructurados para precargar el formulario de admisión
del paciente: apellido, nombre, DNI, sexo, fecha de nacimiento, nacionalidad, CUIL, ejemplar,
número de trámite, fecha de emisión y domicilio (estos dos últimos, y el CUIL completo,
normalmente solo están en el dorso).

**Captura por cámara con auto-detección (sin botón) para el frente:** al abrir la cámara del
frente se corre un loop de detección (`lib/dni-barcode.ts`) sobre el video en vivo; en cuanto
encuentra un código PDF417 legible, captura el frame automáticamente y parsea sus campos
(`parseDniPdf417`) sin esperar ninguna acción del usuario. Esto no es solo una mejora de UX: los
datos que vienen del código de barras (apellido, nombre, DNI, sexo, ejemplar, fechas) son una
fuente determinística — se decodifican, no se "leen" con un modelo — así que tienen prioridad
sobre lo que devuelva después la extracción por IA (por ejemplo, al agregar la foto del dorso para
sumar domicilio y CUIL completo).

**Sobre la librería usada para decodificar el código de barras:** la primera versión usaba el
`BarcodeDetector` nativo del navegador, pero solo funciona en Chrome/Edge sobre macOS y Android —
en Windows, Chrome no lo soporta en absoluto (no hay una API de detección de códigos a nivel de
sistema operativo en Windows, de la que depende la implementación nativa), y Safari/Firefox
tampoco lo implementan. Como la recepción de una clínica muy probablemente use una PC con Windows,
se reemplazó por el paquete [`barcode-detector`](https://www.npmjs.com/package/barcode-detector)
(ZXing compilado a WebAssembly), que expone la misma interfaz pero funciona igual en cualquier
navegador y sistema operativo porque no depende de una API del SO. La primera vez que se usa en
cada sesión del navegador puede tardar uno o dos segundos en cargar el módulo (se descarga desde
un CDN por defecto) — mientras carga, la cámara ya está disponible con el botón "Capturar ahora"
para no bloquear al usuario. Si el código no llega a leerse (mala luz, código dañado, cámara de
baja resolución), ese mismo botón sirve como respaldo, y también queda la opción de subir un
archivo en vez de usar la cámara.

**Cómo funciona esta primera etapa:** la imagen (o las dos) se manda directo a `gpt-4o` con
`response_format: json_schema` (`lib/dni-extraction.ts` → `DNI_RESPONSE_SCHEMA`), en modo
`strict`, para que la respuesta venga siempre con la misma forma. El modelo tiene instrucciones
explícitas de no "adivinar" dígitos que no lea con claridad — si un campo es dudoso, lo deja en
`null` y lo agrega a `camposDudosos` (la UI resalta esos campos en amarillo con un ⚠ para que se
revisen a mano antes de guardar) — y de autoevaluar su propia confianza (alta/media/baja) según la
nitidez de la imagen.

**Por qué es una primera etapa y no la versión final:** el DNI argentino (formato tarjeta) trae en
el frente un código de barras PDF417 con los datos principales codificados como texto plano
(número de trámite, apellidos, nombres, sexo, DNI, ejemplar, fecha de nacimiento, fecha de
emisión, e inicio/fin del CUIL, separados por `@`), y en el dorso una zona de lectura mecánica
(MRZ) tipo pasaporte. Ambos son fuentes determinísticas — se decodifican con una librería, no se
"leen" con un modelo de lenguaje — y son mucho más confiables que la visión por IA para los campos
numéricos críticos (DNI, CUIL), donde un error de un dígito es grave para la admisión de un
paciente real. La decisión (tomada junto con el usuario) fue arrancar con la versión simple de
visión para validar rápido el flujo completo (UI, JSON, futura integración con el alta de
paciente), y en una segunda etapa sumar la decodificación de PDF417/MRZ como fuente primaria,
dejando la visión como respaldo para cuando el código no sea legible y para los datos que el
código no trae.

**Aplica también a otros documentos:** el mismo patrón (imagen → LLM con JSON schema específico
del tipo de documento) sirve para otros documentos de la admisión (carnet de obra social/prepaga,
pasaporte), pero cada tipo necesita su propio schema y, si tiene, su propio código/zona
legible por máquina — no conviene un único prompt genérico "extraé todo de esta imagen" para
todos los tipos de documento, da resultados menos confiables.

**Privacidad:** DNI, CUIL y foto son datos personales sensibles (Ley 25.326) — este prototipo
todavía no persiste las imágenes ni los datos extraídos en ningún lado; el siguiente paso es
conectar el resultado al alta de paciente real del sistema médico (no guardarlo en este widget) y
sumar el consentimiento explícito en el flujo de admisión.

## Integración con el sistema médico: /api/panel-preconsulta

Endpoint pensado para ser llamado **servidor-a-servidor desde el backend del sistema médico**,
no desde el navegador del médico. Corre resumen + tendencia en paralelo sobre el mismo texto de
HC y devuelve todo junto, para que el panel de preconsulta se muestre instantáneo cuando el
médico lo abre.

**Auth:** header `x-api-key` con el valor de `WIDGET_API_KEY` (variable de entorno). Si no se
configura `WIDGET_API_KEY`, el chequeo se salta — solo válido para pruebas, no para producción.

**Request:**
```
POST /api/panel-preconsulta
Content-Type: application/json
x-api-key: <WIDGET_API_KEY>

{ "patientId": "105233", "hcText": "<volcado completo de la HC>" }
```

**Response (200):**
```json
{
  "patientId": "105233",
  "generatedAt": "2026-07-10T18:32:00.000Z",
  "resumen": "DATOS DEL PACIENTE\n...\nALERTAS DE SEGURIDAD\n...",
  "pio": [{ "date": "2020-10-14", "od": 16, "oi": 15 }],
  "av": [{ "date": "2020-10-14", "od_fraction": "20/200", "od_decimal": 0.1, "oi_fraction": "20/60", "oi_decimal": 0.33 }],
  "treatments": [{ "date": "2020-10-14", "type": "Inyección antiVEGF", "eye": "OD" }],
  "alerts": [{ "type": "Inyección antiVEGF", "eye": "OD", "lastDate": "...", "daysSinceLast": 62, "typicalIntervalDays": 35, "eventCount": 12, "message": "..." }]
}
```

**Patrón recomendado de uso (pre-cálculo, no bajo demanda):**

1. El sistema médico ya sabe armar el texto de la HC completa (es el mismo volcado que hoy se
   copia a mano) — la única tarea nueva de ese lado es exponerlo como texto y llamar a este
   endpoint en el momento en que el médico aprieta "llamar paciente" en la cola de espera, no
   cuando abre el panel. Así el resultado ya está listo (5-15 seg de proceso) para cuando el
   paciente entra al consultorio.
2. El sistema médico guarda el JSON de respuesta (por `patientId` o en una tabla propia) durante
   la duración de esa consulta.
3. El iframe/widget que el médico abre no vuelve a llamar a la IA: solo pide al propio backend
   del sistema médico el resultado ya calculado para ese paciente, así se siente instantáneo.
4. Ese resultado no debería persistir más allá de la consulta — es información sensible generada
   a partir de la HC completa (ver la sección de privacidad del documento de asesoramiento).

Si el sistema médico es un sistema de terceros cerrado (sin acceso a agregarle este tipo de
llamada saliente), este patrón no aplica y hay que evaluar alternativas a nivel navegador
(extensión/bookmarklet que lea la pantalla), que no requieren este endpoint.

## Configuración

Variables de entorno:

```
OPENAI_API_KEY=sk-...
WIDGET_API_KEY=
```

En Vercel: Project Settings → Environment Variables → agregar ambas para Production (y Preview
si se va a probar ahí) y volver a desplegar.

En local: copiar `.env.example` a `.env.local` y completar los valores.

## Desarrollo local

```
npm install
npm run dev
```

Requiere HTTPS o `localhost` para que el navegador habilite el acceso al micrófono.

## Próximos pasos (fuera de este MVP)

- Reemplazar `/api/save` por la integración real con la Historia Clínica del sistema médico.
- Conectar el sistema médico a `/api/panel-preconsulta` en el evento "llamar paciente".
- Agregar un store de corto plazo (Vercel KV / Upstash Redis) para cachear el resultado del panel
  durante la consulta en vez de recalcularlo, y para no depender de que el sistema host lo guarde.
- Sumar identificación de médico/paciente por muestra de voz (`known_speaker_references`) si la
  deducción por contenido no alcanza en la práctica.
- `/api/recall-batch`: correr la detección de atraso (`computeOverdueAlerts`) sobre toda la base
  de pacientes, no uno a la vez, para armar una lista diaria de a quién llamar.
- Empaquetar la UI del panel como widget embebible (iframe o web component) que lea el resultado
  ya calculado, para insertar en el sistema host.
- Decodificación del PDF417 del frente: **hecho**, vía el paquete `barcode-detector` (ZXing +
  WebAssembly), funcional en cualquier navegador/sistema operativo.
- Sumar el parseo de la MRZ del dorso como fuente adicional determinística (hoy el dorso solo se
  procesa por visión IA).
- Conectar `/escaneo-dni` al alta de paciente real (hoy solo muestra el formulario editable, no
  persiste nada), y sumar el consentimiento explícito del paciente para el escaneo del documento.
- Generalizar el escaneo de documentos a otros tipos (pasaporte, carnet de obra social/prepaga),
  cada uno con su propio JSON schema de extracción.
