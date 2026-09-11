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
  routes.ts                     rutas /api/app/*
  index.ts                      montarAppAsociado(app)
public/app/                     la PWA (HTML/CSS/JS, sin build)
db/002-app-asociado-schema.sql  schema app_asociado
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
