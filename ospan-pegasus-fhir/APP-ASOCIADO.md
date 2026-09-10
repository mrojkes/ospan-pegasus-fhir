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
  auth.ts                       login DNI + código de un solo uso
  notificaciones.ts             envío del código (hoy: log)
  mapping.ts                    Pegasus -> shape que consume el celular
  routes.ts                     rutas /api/app/*
  index.ts                      montarAppAsociado(app)
public/app/                     la PWA (HTML/CSS/JS, sin build)
db/002-app-asociado-schema.sql  schema app_asociado
```

Cambios en archivos que ya existían, mínimos y aditivos: `src/index.ts`
monta la app en dos líneas, y `package.json` suma `jsonwebtoken`. **Nada
del conector ni del back office se modificó** — `/back-office`,
`/api/ordenesmedicas` y `/health` siguen exactamente igual.

## Puesta en marcha

```
npm install          # trae jsonwebtoken
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
| `APP_CANAL_TELEFONO` | `sms` para mandar por SMS en vez de WhatsApp. | No |

Los `HEALTHCARE_DB_*` y `PEGASUS_*` ya cargados se reusan tal cual.

---

## Cómo entra el asociado

Login en dos pasos: **DNI → código de un solo uso → sesión**.

Con solo DNI (como estaba en el prototipo) cualquiera que conozca el
documento de un afiliado entra a ver los diagnósticos e informes de
laboratorio de sus mascotas. El código prueba además que controla el
teléfono o el mail que figura en el padrón.

El envío está aislado en `notificaciones.ts` y hoy **solo hace
`console.log`**: el código se ve en la consola de Replit y, mientras
`NODE_ENV` no sea `production`, vuelve también en la respuesta y la app lo
muestra en pantalla ("Modo demo: el código es …"). Así se prueba el
circuito completo antes de contratar proveedor. Cuando OSPAN defina cuál
es, se implementa dentro de `enviarCodigo()` y nada más cambia.

Protecciones ya puestas: el código se guarda hasheado (nunca en claro),
vence a los 10 minutos, se invalida al primer uso, tolera 5 intentos
fallidos y hay un tope de 3 códigos por DNI cada 10 minutos.

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
| POST | `/api/app/auth/solicitar-codigo` | DNI → busca al tutor y manda el código |
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

`api-client.js` es la única puerta a los datos y tiene **modo mock**: con
`localStorage.setItem("ospan_mock","1")` la app corre entera contra
`mock-data.js`, sin backend — sirve para mostrarla sin conexión a la RDS.
El default (`APP_CONFIG.api.mock`) hoy está en `true` para que se pueda
abrir el `index.html` suelto; **al desplegar conviene ponerlo en `false`**.

Es instalable en el celular: `manifest.webmanifest` + `sw.js`. El service
worker cachea el shell y **nunca** cachea `/api/*` — los datos clínicos
salen siempre a la red. Al cambiar el shell hay que subir `CACHE_VERSION`
en `sw.js`.

---

## Qué se probó

Con las herramientas del propio repo: Postgres local con
`db/dev-seed-padron.sql`, `npm run migrate` (que tomó la migración nueva
solo) y `scripts/mockPegasusServer.ts`, contra el servidor real
(`src/index.ts`) y con un navegador manejando la PWA:

- Login completo: DNI del seed → código → sesión → home con la mascota
  real del padrón y el número de cuenta bien derivado.
- Mis Resultados trayendo la orden de Pegasus por fallback en vivo, con el
  detalle, el informe, los valores y el adjunto.
- `&nbsp;` renderizado como "sin valor cargado".
- Un `<script>` inyectado en `EvoOrdenMedica` se descarta entero.
- Visor de adjuntos abriendo el PDF desde blob, y mostrando un mensaje
  claro (no un iframe roto) cuando el archivo no está disponible.
- Sin sesión: 401. Token en la URL: 401. Orden o `id_hub` de otro tutor:
  404. Token de atención sobre mascota ajena: 404.
- El limitador de 3 códigos por DNI cada 10 minutos se activó solo durante
  las pruebas y la app mostró el mensaje correcto.
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

4. Conectar el proveedor real de envío del código (`notificaciones.ts`).
5. Cargar el directorio de prestadores en `app_asociado.prestador` — hoy
   está vacío. Cuando entre ThingSoft sale de ahí y la tabla se retira.
6. Distancia en el directorio: falta lat/lng y geolocalización real.
7. Consumo del token de atención del lado del prestador: la app lo genera
   y lo guarda, pero todavía nadie lo valida.
8. Cobertura y carencias por mascota: hoy van en "—", falta la fuente.
9. Importes, cuando haya convenio cargado en Panda.
