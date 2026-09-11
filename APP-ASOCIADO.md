# App Asociado / Paciente OSPAN — PWA de autogestión

Aplicación móvil (PWA) para que el tutor gestione la cobertura de sus
mascotas: credencial digital, token de atención, red de prestadores y
**Mis Resultados**, que muestra las órdenes médicas y sus informes
tomándolos de Pegasus a través del conector de este mismo repo.

**Ya está integrada en este repo**, no hay nada que acoplar a mano: el
código nuevo vive en `src/app/` y la PWA en `public/app/`, y
`src/index.ts` ya la monta.

---

## Qué se agregó

```
src/app/                        API de la app
  deps.ts                       único punto de contacto con el conector
  auth.ts                       login DNI + elección de canal + código
  notificaciones.ts             canales disponibles y envío (email por SMTP)
  mapping.ts                    Pegasus -> shape que consume el celular
  routes.ts                     rutas base /api/app/*
  routesMvp.ts                  rutas de las 8 funcionalidades del MVP
  ddjjQuestionnaire.ts          el FHIR Questionnaire de la DDJJ
  mvpQueries.ts                 consultas de esas funcionalidades
  backOfficeSolicitudes.ts      pantalla de OSPAN para resolverlas
  index.ts                      montarAppAsociado(app)
public/app/                     la PWA (HTML/CSS/JS, sin build)
db/002-app-asociado-schema.sql  schema app_asociado (login, credencial)
db/003-app-mvp-schema.sql       tablas de las 8 funcionalidades
db/004-ddjj-questionnaire.sql   DDJJ como QuestionnaireResponse
src/fhir/types/questionnaire.ts tipos FHIR de Questionnaire (archivo nuevo)
```

Cambios en archivos que ya existían, mínimos y aditivos: `src/index.ts`
monta la app en dos líneas, y `package.json` suma `jsonwebtoken` y
`nodemailer`. **Nada
del conector ni del back office se modificó** — `/back-office`,
`/api/ordenesmedicas` y `/health` siguen exactamente igual.

## Puesta en marcha

```
npm install          # trae jsonwebtoken y nodemailer
npm run migrate      # aplica 002-app-asociado-schema.sql (además del 001)
npm run dev
```

La app queda en `http://localhost:3000/app/` y la API en `/api/app/*`.

### Secrets nuevos en Replit

| Variable | Para qué | Obligatoria |
|---|---|---|
| `APP_JWT_SECRET` | Firma de los tokens de sesión. Cadena larga y aleatoria. | Sí |
| `APP_JWT_TTL` | Duración de la sesión (default `12h`). | No |
| `APP_OTP_TTL_MIN` | Minutos de validez del código (default 10). | No |
| `APP_OTP_DEV` | `0` deja de devolver el código en la respuesta. | No |
| `APP_TOKEN_TTL_MIN` | Validez del token de atención (default 15). | No |
| `APP_CANAL_TELEFONO` | `sms` para que el canal de teléfono sea SMS en vez de WhatsApp. | No |
| `APP_CODIGO_MAESTRO` | Código de acceso interno para la etapa de pruebas. Ver abajo. **Borrarlo antes de abrir la app a afiliados reales.** | No |
| `APP_VISTA_PRELIMINAR` | `1` muestra el cartel "Vista preliminar" en las pantallas que todavía no están en producción. Se saca borrando el Secret. | No |

Y para que el envío por mail funcione de verdad (si no están, el código
sale por la consola de Replit):

| Variable | Para qué |
|---|---|
| `SMTP_HOST` | Servidor de correo saliente. |
| `SMTP_PORT` | Puerto (default 587). |
| `SMTP_SECURE` | `true` si el puerto es 465. |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciales del buzón. |
| `SMTP_FROM` | Remitente visible, ej. `OSPAN <no-reply@ospan.org.ar>`. |

Los `HEALTHCARE_DB_*` y `PEGASUS_*` ya cargados se reusan tal cual.

---

## Cómo entra el asociado

Login en tres pasos: **DNI → elegir por dónde recibir el código → código
→ sesión**.

Con solo DNI (como estaba en el prototipo) cualquiera que conozca el
documento de un afiliado entra a ver los diagnósticos e informes de
laboratorio de sus mascotas. El código prueba además que controla el
teléfono o el mail que figura en el padrón.

**El afiliado elige el medio.** Los medios salen de lo que tenga cargado
en `padron.related_person`: teléfono (WhatsApp o SMS) y/o email. Si tiene
los dos, el backend **no manda nada** en el primer pedido: devuelve las
opciones enmascaradas (`+541 •• ••••-0001`, `ma•••••••@example.com`) y la
app le pregunta. Si tiene uno solo, lo manda directo, porque no hay nada
que preguntar. Desde la pantalla del código puede volver atrás con
"Probar por otro medio".

Nunca se devuelve el teléfono ni el mail completos: esa pantalla es previa
a que la persona pruebe quién es.

**Estado de cada canal** (`notificaciones.ts`):

- **Email: funciona de verdad.** Envía por SMTP con nodemailer, y se
  activa solo con que estén los Secrets `SMTP_*`.
- **WhatsApp y SMS: falta el proveedor.** La función `enviarPorTelefono()`
  ya tiene la firma definitiva; solo hay que implementar la llamada al
  proveedor que elija OSPAN y devolver `true`.

Mientras un canal no tenga proveedor, el código sale por la consola de
Replit y la respuesta trae `entregado: false`, así la app le avisa al
afiliado en vez de prometerle un envío que no ocurrió. En desarrollo
además vuelve el código en la respuesta y se muestra en pantalla ("Modo
demo: el código es …"), para poder probar el circuito completo.

Protecciones ya puestas: el código se guarda hasheado (nunca en claro),
vence a los 10 minutos, se invalida al primer uso, tolera 5 intentos
fallidos y hay un tope de 3 códigos por DNI cada 10 minutos.

### Código de acceso interno (solo etapa de pruebas)

Mientras WhatsApp/SMS no tengan proveedor y el mail salga de una casilla
provisoria, hace falta poder entrar con datos **reales** del padrón sin
mandarle mensajes a beneficiarios de verdad. Para eso está
`APP_CODIGO_MAESTRO`.

Cómo funciona: con el Secret puesto, la pantalla de elección suma una
tercera opción, *"Ingresar con código interno — solo para pruebas, no
envía nada"*. Elegirla **no genera ni manda ningún código**; lleva
directo al campo, y ahí se escribe el valor del Secret. La sesión que
sale es una sesión normal, con los datos reales de ese afiliado.

Qué NO cambia: el modo demo del front (`ospan_mock`) sigue igual, con su
código `123456` y sus datos de ejemplo. Y en modo real, `123456` no entra.

**Es una llave maestra.** Con ese código y un DNI del padrón se entra a la
cuenta de cualquier afiliado y se ve la historia clínica de sus mascotas.
Por eso:

- Vive **solo en un Secret**, nunca en el repo (que es público). No hay
  valor por defecto: sin el Secret, la opción no aparece, pedir
  `canal: "interno"` da 400 y el código no sirve para nada.
- No dispara envíos: por eso se ofrece como opción explícita y, mientras
  está activo, la app nunca manda un código sin preguntar primero —
  aunque el afiliado tenga un solo medio de contacto.
- Cada uso queda registrado: una fila en `app_asociado.otp_challenge` con
  `canal = 'interno'` y un aviso en el log del servidor con DNI e IP.
- Al arrancar, el servidor escribe un aviso en el log recordando que está
  activo.

**Para desactivarlo: se borra el Secret `APP_CODIGO_MAESTRO`.** Nada más.
Conviene usar un valor largo y no obvio en vez de seis dígitos: el campo
acepta hasta 64 caracteres, y si la app queda accesible desde internet,
seis dígitos se adivinan.

## Funcionalidades del MVP

Las ocho del prototipo PetConnect, todas con backend propio y
persistencia real. La barra inferior pasó a las cinco pestañas del MVP
(Inicio, Cartilla, Salud, Comunidad, Perfil) y el home tiene la grilla de
accesos rápidos.

| Pantalla | Qué hace | De dónde salen los datos |
|---|---|---|
| **Autorizar** | El afiliado pide una autorización (mascota, prestación, veterinaria, diagnóstico, CIE-10) y sigue su estado. | `app_asociado.solicitud_autorizacion`. La resuelve OSPAN. |
| **Turnos** | Pide turno eligiendo veterinaria, día y franja; ve los pedidos. | `app_asociado.turno`. |
| **Copagos** | Cuánto paga por categoría y qué cubre el plan. | `app_asociado.copago`. |
| **Reintegros** | Carga una solicitud con comprobantes (foto o PDF) y sigue su estado. | `app_asociado.reintegro` + `reintegro_adjunto`. |
| **Cartilla** | Red de prestadores con búsqueda, especialidades, puntaje y copago; desde la ficha se pide el turno. | `app_asociado.prestador`. |
| **Clínica** | Historia clínica de la mascota. | **Órdenes médicas reales de Pegasus.** |
| **DDJJ** | Cuestionario de antecedentes, versionado. Ver abajo: es un **FHIR Questionnaire**. | `app_asociado.ddjj`, con el padrón como valor de base. |
| **Comunidad** | Paseadores, peluquerías, guarderías, pet shops y nutricionistas, con contacto por WhatsApp. | `app_asociado.comunidad_prestador`. |

Además: **recordatorios** en el home (`app_asociado.recordatorio`, los
carga OSPAN) y la **credencial digital** con token de atención, que ya
estaban.

### Quién resuelve las solicitudes

Autorizaciones, turnos y reintegros no se aprueban solos. OSPAN los
resuelve en **`/back-office/solicitudes`**, una pantalla nueva con
pestañas por tipo, filtro de pendientes, y botones de aprobar/rechazar
con motivo (en reintegros, además, el monto que se reconoce). Lo que se
resuelve ahí aparece en el celular del afiliado, con el motivo.

Ese router es propio y **no toca `routes/backOffice.ts`**.

### Qué se sembró y qué no

La migración carga datos de arranque **solo en las tablas de catálogo**:
copagos, cartilla y comunidad. Son configuración que OSPAN va a editar,
no información de afiliados. **No se inventó ningún dato clínico ni de
padrón**: la historia clínica sale de Pegasus y la DDJJ arranca de lo que
figura en la ficha de afiliación.

### La DDJJ es un FHIR Questionnaire

El formulario se define una sola vez como recurso **`Questionnaire`**
(`src/app/ddjjQuestionnaire.ts`) y lo que responde el tutor se guarda
como **`QuestionnaireResponse`**. La pantalla **no tiene ninguna pregunta
escrita**: `assets/js/fhir-questionnaire.js` la dibuja leyendo el
recurso, incluidos los tipos (`boolean`, `string`, `text`, `choice`,
`group`, `display`), los ítems anidados y las condiciones `enableWhen`.

Qué gana esto:

- **Agregar o cambiar una pregunta es editar el recurso en el servidor.**
  Nada de front, nada de migración. Está probado: se agregó una pregunta
  de tipo `choice` —un tipo que la DDJJ no usaba— solo en el backend, y
  apareció en el celular con sus tres opciones, se respondió y se guardó.
- **Lo guardado es FHIR válido**, así que sale del repositorio tal cual,
  sin una capa de traducción que mantener sincronizada.
- **Versionado real.** Cada respuesta guarda con qué versión del
  cuestionario se respondió (`questionnaire: "<url>|<version>"`). Si el
  cuestionario cambió desde la última vez, la app se lo dice al tutor
  ("agregamos preguntas nuevas: revisalas y volvé a guardar") sin que
  nadie lo programe por pregunta.

**Al cambiar las preguntas hay que subir `DDJJ_VERSION`.** Las
declaraciones viejas siguen apuntando a la versión con la que se
respondieron, así una de hace seis meses se interpreta con las preguntas
que el tutor efectivamente vio.

El recurso se sirve en `GET /api/app/ddjj/questionnaire`.

**El `QuestionnaireResponse` lo arma el servidor, no el cliente.** De lo
que manda la app se descartan los `linkId` que no están en el
cuestionario, las respuestas cuyo tipo no corresponde al del ítem, y los
detalles cuya condición `enableWhen` no se cumple (para que no quede
guardado "alergias: no" con un detalle colgado). Todo eso está probado.

**Pendiente de terminología:** los ítems todavía no llevan `code`. Preferí
no inventar códigos LOINC/SNOMED. Cuando OSPAN defina el binding (o se
conecte el schema `terminology` de la RDS) se agrega `code` a cada ítem y
las respuestas ya guardadas siguen siendo válidas, porque el código vive
en el Questionnaire y no en la respuesta.

La migración `004` convierte lo que se había guardado con el formato
anterior; la columna vieja `respuestas` queda al lado para poder
verificar la conversión antes de descartarla.

### Cartel de vista preliminar

Con `APP_VISTA_PRELIMINAR=1`, las pantallas cuyo circuito todavía está en
definición muestran arriba una franja que lo aclara ("las veterinarias
todavía no confirman en línea", "el circuito de liquidación está en
validación con OSPAN", etc.). Así, en una demo con el cliente, se
distingue lo que ya está vivo de lo que falta acordar, sin tener que
aclararlo cada vez. Se apaga borrando el Secret, pantalla por pantalla no:
es todo o nada.

### Lo que falta definir con OSPAN

Tres cosas quedaron con una implementación propia porque no está
confirmada la fuente real. Cada una es **una sola función** en
`mvpQueries.ts`, para cambiarla sin tocar pantallas ni rutas:

- **Copagos** (`copagosDePlan`) → el schema `financial` de la RDS tiene
  carencias y precios.
- **Cartilla** (`listarCartilla`) → el schema `vet` tiene la gestión de
  prestadores.
- **Agenda de turnos** (`franjasDisponibles`) → hoy son seis franjas
  fijas y el turno queda "solicitado" hasta que alguien lo confirma.
  Cuando exista la agenda de las veterinarias, se reserva directo.

## Regla de acceso a los datos

**Ninguna** ruta acepta un `id_hub` del cliente sin antes verificar contra
el padrón que esa mascota es del tutor de la sesión
(`mascotaPerteneceATutor`). Vale para órdenes, detalle, adjuntos y token
de atención. Está probado: pedir una orden o un `id_hub` de otro tutor
devuelve 404.

`deps.ts` reusa `buscarPacientesPorDocumentoTutor` y
`buscarPacientePorIdHub` de `padronQueries.ts` en vez de escribir SQL
nuevo, así que hereda el join con el tutor, el match por `documento` O
`dni` y el cálculo del `id_hub`. `padron` sigue siendo de solo lectura.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/app/auth/solicitar-codigo` | DNI (+ `canal` opcional) → devuelve los medios disponibles o manda el código |
| POST | `/api/app/auth/verificar` | DNI + código → token de sesión |
| GET | `/api/app/me` | Tutor + sus mascotas (padrón) |
| GET | `/api/app/mascotas/:idHub/ordenes` | **Mis Resultados** |
| GET | `/api/app/ordenes/:id` | Detalle de una orden |
| GET | `/api/app/ordenes/:id/adjuntos/:n` | Proxy del adjunto |
| POST | `/api/app/mascotas/:idHub/token-atencion` | Token para el prestador |
| GET | `/api/app/contrato` | Contrato de afiliación |
| GET | `/api/app/directorio` | Red de prestadores |
| GET | `/api/app/historial` | Historial de prestaciones |
| GET/POST | `/api/app/autorizaciones` | Autorizaciones del tutor / nueva solicitud |
| GET/POST | `/api/app/turnos` | Turnos del tutor / pedir turno |
| GET | `/api/app/copagos` | Copagos por categoría |
| GET/POST | `/api/app/reintegros` | Reintegros del tutor / nueva solicitud |
| GET | `/api/app/reintegros/adjuntos/:id` | Comprobante propio |
| GET | `/api/app/cartilla` | Red de prestadores |
| GET | `/api/app/cartilla/:id/disponibilidad` | Franjas libres de una veterinaria |
| GET | `/api/app/ddjj/questionnaire` | El `Questionnaire` de la DDJJ |
| GET/POST | `/api/app/mascotas/:idHub/ddjj` | `QuestionnaireResponse` de esa mascota |
| GET | `/api/app/comunidad` | Servicios de la comunidad |
| GET | `/api/app/recordatorios` | Vacunas y controles próximos |
| GET | `/api/app/config` | Banderas de presentación (sin sesión) |

### Mis Resultados

Delega en `obtenerEstudiosPaciente({ idHub })` — el mismo servicio que usa
el back office — así que hereda el local-first sobre `fhir_repo` con
fallback en vivo a Pegasus, y la persistencia de todo lo que trae.

La app **no consume FHIR**: consume un objeto plano armado para una
pantalla de celular. La fuente es `raw_pegasus`, no `fhir_bundle`, igual
criterio que el back office. Efecto lateral útil: al no depender del
bundle, un cambio en un mapper de FHIR no deja esta pantalla
desactualizada, así que **no le afecta el tema de
`reprocesarBundles()`**.

Detalles de Pegasus ya contemplados:

- El placeholder literal `&nbsp;` en `Items[].Valor` se muestra como
  *"sin valor cargado"*.
- `Adjuntos` es un `string[]` de URLs sueltas: Pegasus no manda nombre ni
  content-type, así que el nombre visible se deduce del último segmento de
  la URL y el tipo, de su extensión.
- `EvoOrdenMedica` y `EvoOrdenMedicaResultados` vienen como HTML de
  presentación. Se renderizan formateados, pero pasados por un sanitizador
  que descarta `<script>`, `<iframe>`, handlers y todo lo que no sea
  formato. El back office los inserta tal cual porque es una red
  controlada; acá el consumidor es un celular en internet abierta.
- Los **importes no se muestran**: hoy vienen en 0 (sin convenio cargado
  en Panda) y son información de convenio, no del asociado.

### Adjuntos

Las URLs que da Pegasus son **públicas, sin token y permanentes**. No se
le mandan al celular ni se loguean: el backend las resuelve server-side,
valida la pertenencia y devuelve el archivo por streaming. La app lo
descarga con el header de sesión y lo muestra desde memoria (blob), así
el token tampoco viaja nunca en una URL.

---

## La PWA

`public/app/` — HTML, CSS y JS planos, sin build, sobre el sistema de
componentes del prototipo (`variables.css` / `styles.css` /
`utilities.css` intactos; lo nuevo está en `resultados.css`).

Pantallas: onboarding, login, home, credencial + token, **Mis Resultados**,
**detalle del estudio**, directorio, perfil, contrato y términos.

`api-client.js` es la única puerta a los datos y tiene **modo demo**, que
corre toda la app contra `mock-data.js` sin backend.

Cuándo entra en demo (`APP_CONFIG.api.mock`, default `"auto"`):

- **Servida por el servidor** (Replit, `npm run dev`): datos reales del
  padrón. Siempre.
- **Abierta con doble clic** sobre el archivo (`file://`): demo, porque
  ahí no hay backend al que pegarle.

Para forzarlo desde la consola del navegador:
`localStorage.setItem("ospan_mock","1")` demo,
`...("ospan_mock","0")` real, `localStorage.removeItem("ospan_mock")`
vuelve a automático.

Cuando está en demo, el login muestra un cartel *"Modo demo — datos de
ejemplo, sin conexión al padrón"*, para que no se confunda con datos
reales.

Es instalable en el celular: `manifest.webmanifest` + `sw.js`. El service
worker cachea el shell y **nunca** cachea `/api/*` — los datos clínicos
salen siempre a la red.

**Al desplegar un cambio de pantallas hay que subir `CACHE_VERSION` en
`sw.js`.** Si no, el navegador de quien ya abrió la app sigue sirviendo la
versión vieja desde la caché y parece que el despliegue no tuvo efecto.
La app además se recarga sola cuando detecta una versión nueva.

---

## Qué se probó

Con las herramientas del propio repo: Postgres local con
`db/dev-seed-padron.sql`, `npm run migrate` (que tomó la migración nueva
solo) y `scripts/mockPegasusServer.ts`, contra el servidor real
(`src/index.ts`) y con un navegador manejando la PWA:

- Login completo: DNI del seed → elección de medio → código → sesión →
  home con la mascota real del padrón y el número de cuenta bien derivado.
- Elección de canal: con teléfono Y mail cargados, el primer pedido
  devuelve las dos opciones enmascaradas sin mandar nada; eligiendo cada
  una se manda por la que corresponde; un canal que el tutor no tiene da
  400.
- Envío por mail real contra un servidor SMTP de prueba: el mensaje llegó
  a la dirección del padrón, con el código en el asunto, y la respuesta
  marcó `entregado: true`. Con WhatsApp (sin proveedor) marcó
  `entregado: false` y la app mostró el aviso.
- Mis Resultados trayendo la orden de Pegasus por fallback en vivo, con el
  detalle, el informe, los valores y el adjunto.
- `&nbsp;` renderizado como "sin valor cargado".
- Un `<script>` inyectado en `EvoOrdenMedica` se descarta entero.
- Visor de adjuntos abriendo el PDF desde blob, y mostrando un mensaje
  claro (no un iframe roto) cuando el archivo no está disponible: con el
  host del adjunto caído la ruta devuelve 502, no un error 500.
- Sin sesión: 401. Token en la URL: 401. Orden o `id_hub` de otro tutor:
  404. Token de atención sobre mascota ajena: 404.
- El limitador de 3 códigos por DNI cada 10 minutos se activó solo durante
  las pruebas y la app mostró el mensaje correcto.
- Código de acceso interno: con el Secret puesto aparece la tercera
  opción, elegirla no crea ninguna fila de OTP ni manda ningún mail, y el
  código entra con los datos reales del padrón dejando el rastro de
  auditoría. Sin el Secret, la opción desaparece, `canal: "interno"` da
  400 y el mismo código deja de servir. El modo demo siguió funcionando
  igual, con su `123456` y sus datos de ejemplo.
- Las ocho pantallas del MVP, recorridas con un navegador contra la base
  real: se pidió un turno (y la franja quedó ocupada para el siguiente),
  se cargó una autorización, se subió un reintegro con comprobante PDF y
  se completó la DDJJ, que persistió tras recargar.
- DDJJ como Questionnaire: el detalle condicional aparece y se oculta
  según la respuesta; agregar una pregunta `choice` solo en el servidor
  la hizo aparecer en la app con sus opciones, sin tocar el front; la
  migración convirtió a `QuestionnaireResponse` lo guardado con el
  formato anterior; y el servidor descartó un `linkId` inventado, una
  respuesta con el tipo equivocado y un detalle sin su condición
  cumplida.
- Circuito completo con OSPAN: resolver desde `/back-office/solicitudes`
  cambia lo que ve el afiliado, incluido el monto reconocido de un
  reintegro y el motivo de la resolución.
- Validaciones: turno en fecha pasada, franja ya ocupada (409), reintegro
  sin comprobante, y un `.exe` disfrazado de comprobante — todas
  rechazadas. Mascota ajena en autorizaciones, DDJJ y comprobantes: 404.
- `npm run typecheck` limpio y sin errores de JS en el navegador.
- `/back-office`, `/api/ordenesmedicas` y `/health` siguen respondiendo
  igual que antes.

---

## Pendientes

**Tres cosas dependen de datos que no están en `padron.patient`** y hoy
degradan sin romper:

1. **Plan (100/200/300/400/410)**: no es una columna del padrón. La app
   oculta el tag de plan y la credencial usa una base genérica
   (`APP_CONFIG.credencial.planPorDefecto`). Falta saber de dónde sale —
   probablemente el schema `financial` o `core`.
2. **Especie**: `especie_id` es un entero y la tabla de especies está en
   otro schema (`terminology`). Hay un mapa mínimo en `routes.ts`
   (`1: Perro, 2: Gato`) **sin confirmar**; si un id no está, no se
   muestra la especie.
3. **Foto de la mascota**: existe `photo_key` en el padrón, pero falta
   definir cómo se sirve. Por ahora la app muestra las iniciales.

Y del resto:

4. Conectar el proveedor de WhatsApp o SMS en `enviarPorTelefono()`
   (`notificaciones.ts`). El mail ya anda con cargar los Secrets `SMTP_*`.
5. Cargar el directorio de prestadores en `app_asociado.prestador` — hoy
   está vacío. Cuando entre ThingSoft sale de ahí y la tabla se retira.
6. Distancia en el directorio: falta lat/lng y geolocalización real.
7. Consumo del token de atención del lado del prestador: la app lo genera
   y lo guarda, pero todavía nadie lo valida.
8. Cobertura y carencias por mascota: hoy van en "—", falta la fuente.
9. Importes, cuando haya convenio cargado en Panda.
