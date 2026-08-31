# OSPAN · Pegasus (Panda) → FHIR

Backend que consulta la API de **Pegasus (Panda HIS)** para órdenes
médicas veterinarias, las transforma a recursos **FHIR R4**, las persiste
**versionadas por estado** en Postgres, y las cruza contra el **padrón
OSPAN/OMINT** (Postgres, AWS) para poder buscar pacientes. Incluye un back
office server-side mínimo para poder mostrarlo de punta a punta.

Dos capas, dos momentos:

- **v1 — conector** (`/api/pegasus/*`, `/api/fhir/*`): proxy + transformador
  FHIR en memoria, sin persistir. Sigue andando igual que antes.
- **v2 — prototipo** (`/back-office/*`): sincroniza por fecha, persiste
  versionado, busca pacientes cruzando padrón + Pegasus, muestra estudios
  con sus adjuntos, y arma reportes. Es lo nuevo de esta vuelta.

## Qué resuelve hoy

- Proxy autenticado hacia Pegasus, incluyendo los endpoints nuevos: por
  fecha (`/porfecha`, todas las coberturas), por documento del tutor
  (`/pacientes`) y por paciente (`/pacientes/{idPaciente}/ordenes`, única
  vía para mascotas que no son de OSPAN).
- Transformación de cada orden médica a un **Bundle FHIR R4**.
- Persistencia **versionada por estado** en Postgres (schema `fhir_repo`,
  propio de este backend): cada vez que una orden cambia de estado
  (`IdEstado`) se guarda una fila nueva, nunca se pisa la anterior.
- Búsqueda de paciente cruzando el **padrón OSPAN/OMINT** (schema
  `padron`, de solo lectura) con Pegasus en vivo.
- Ficha de estudios: local-first (si ya está sincronizado, no vuelve a
  pegarle a Pegasus) con fallback a traer en vivo por `id_hub` o
  `IdPaciente`, visor de adjuntos (PDF/imagen) y **historial de
  versiones** por orden.
- Reportes por profesional solicitante y por estado.
- Colección Postman con los tres niveles: Pegasus directo, proxy del
  backend, y las páginas del back office.

## Qué NO resuelve todavía (a propósito)

- No tiene autenticación propia (cualquiera que llegue al backend puede
  usarlo). Antes de exponerlo fuera de una red controlada hay que sumar
  algo (API key propia como mínimo).
- El back office es intencionalmente simple (server-side, sin JS de
  cliente más allá de los `<form>`) — prioriza tener la demo andando
  rápido sobre la prolijidad visual.
- Dos supuestos sin confirmar todavía (ver sección "Supuestos a
  confirmar" más abajo): que `patient.identificador_ospan` del padrón
  equivale al `id_hub` de Pegasus, y la forma exacta de la respuesta de
  `/pacientes/{idPaciente}/ordenes` (la doc no la muestra completa).

## Estructura del repo

```
src/
  config/env.ts                    Variables de entorno (Pegasus + Postgres)
  adapters/
    pegasus/
      pegasusTypes.ts               Tipos del JSON crudo de Pegasus (todos los endpoints)
      pegasusClient.ts              Cliente HTTP (fetch + Bearer token)
    padron/
      padronTypes.ts                Tipos de padron.patient / padron.related_person
      padronQueries.ts               Queries de búsqueda (solo lectura)
  fhir/
    types/r4.ts                     Subset de tipos FHIR R4
    mappers/                        Pegasus -> FHIR (ver README original de cada mapper)
  persistence/
    db.ts                           Pool de Postgres (un solo host, schemas padron + fhir_repo)
    ordenMedicaRepo.ts               Upsert versionado, consultas, reportes, log de syncs
  services/
    syncPorFecha.ts                  Job de sync por fecha (2.1)
    patientSearch.ts                 Búsqueda de paciente combinada padrón + Pegasus (2.2)
    estudios.ts                      Local-first / vivo + persistir (2.3, 2.4)
  routes/
    ordenesMedicas.ts                API JSON (proxy crudo + FHIR)
    backOffice.ts                    Back office server-side (HTML)
  views/
    layout.ts                        Layout HTML + helpers (nav, badges, escape)
    bundleHelpers.ts                  Extrae Observations/DocumentReference de un Bundle
  index.ts                           Bootstrap del server
db/
  001-fhir-repo-schema.sql           Migración del schema fhir_repo (IF NOT EXISTS, seguro re-ejecutar)
  dev-seed-padron.sql                Mock del schema padron, SOLO para desarrollo local
scripts/
  testWithMock.ts                    Prueba los mappers FHIR sin red
  mockPegasusServer.ts               Mock local de la API de Pegasus, SOLO para desarrollo
postman/                             Colección + environment
```

## Subir esto a GitHub y de ahí a Replit

1. En github.com, crear un repositorio nuevo y vacío (sin README ni
   .gitignore — ya vienen en esta carpeta). Puede ser privado.
2. Descomprimir el `.zip` que te mandé en tu máquina.
3. En la página del repo recién creado, click en "uploading an existing
   file" (o el botón "Add file" → "Upload files"). Arrastrar ahí **el
   contenido** de la carpeta descomprimida (todo lo que está adentro, no
   la carpeta en sí) y confirmar el commit. GitHub respeta las subcarpetas
   al arrastrar.
4. En Replit: "Create App" → buscar la opción de importar desde GitHub
   (no el cuadro de prompt) y pegar la URL del repo.
5. Una vez importado, abrir el chat del Agent DENTRO de ese Repl (ya no la
   pantalla inicial de "creá una app") y pegar el contenido de
   `REPLIT_PROMPT.md` tal cual.

`.gitignore` ya excluye `node_modules`, `dist`, `.env` y `*.log` — no se
sube nada de eso, y las credenciales van como Secrets de Replit, nunca
como archivo en el repo.

## Cómo correr

### 1. Base de datos

Este backend usa la misma base Postgres "healthcare" (AWS RDS) donde ya
vive el schema `padron` — pero en un schema **propio y separado**,
`fhir_repo`, que no toca `padron`/`core`/`financial`/`public`/`temp`/
`terminology`/`vet`. Antes de correr el backend contra la base real:

```bash
# revisar el archivo primero -- es seguro re-ejecutarlo (todo con IF NOT EXISTS)
psql "postgresql://usuario:password@host:5432/nombre_base" -f db/001-fhir-repo-schema.sql
```

**Importante:** no se pudo probar la conexión a la base real desde este
entorno de desarrollo (timeout al conectar — probablemente el security
group de la RDS solo permite IPs conocidas). Probar la conexión desde
donde vaya a correr esto de verdad (tu máquina, Replit, etc.) y confirmar
el nombre de la base (no estaba entre los datos compartidos).

Para desarrollo local sin tocar la base real, `db/dev-seed-padron.sql`
crea un schema `padron` de juguete con la misma forma (columnas) que el
real, con un par de filas ficticias.

### 2. Backend

```bash
npm install
cp .env.example .env     # completar PEGASUS_TOKEN y HEALTHCARE_DB_*
npm run dev               # server con reload en http://localhost:3000
```

Sin tocar la red ni la base, para validar solo los mappers FHIR:

```bash
npx tsx scripts/testWithMock.ts
```

Para probar el flujo completo sin credenciales reales (mock de Pegasus +
Postgres local):

```bash
npx tsx scripts/mockPegasusServer.ts &     # mock de Pegasus en :4001
psql -f db/dev-seed-padron.sql             # contra tu Postgres local
psql -f db/001-fhir-repo-schema.sql        # contra tu Postgres local
# .env apuntando PEGASUS_BASE_URL a http://localhost:4001 y HEALTHCARE_DB_* a tu Postgres local
npm run dev
# abrir http://localhost:3000/back-office
```

## Endpoints

### API JSON (`/api/*`)

| Método | Path | Qué hace |
|---|---|---|
| GET | `/health` | Chequeo simple |
| GET | `/api/pegasus/ordenesmedicas?id_hub=...` | Proxy crudo del listado por id_hub (solo cobertura OSPAN) |
| GET | `/api/pegasus/ordenesmedicas/:id?id_hub=...` | Proxy crudo del detalle |
| GET | `/api/pegasus/ordenesmedicas/porfecha?desde=...` | Proxy crudo por fecha (**todas** las coberturas, máx. 31 días) |
| GET | `/api/pegasus/ordenesmedicas/pacientes?documento_tutor=...` | Proxy crudo, mascotas de un tutor (incluye no-OSPAN) |
| GET | `/api/pegasus/ordenesmedicas/pacientes/:idPaciente/ordenes` | Proxy crudo, historial completo de un paciente puntual |
| GET | `/api/fhir/ordenesmedicas?id_hub=...` | Igual que el listado por id_hub, como Bundle FHIR |
| GET | `/api/fhir/ordenesmedicas/:id?id_hub=...` | Igual que el detalle, como Bundle FHIR |

Los errores de Pegasus (401/403/404/etc.) se devuelven tal cual, con el
mismo código HTTP — incluido el 404 que, según la doc, puede significar
"la orden no existe" **o** "existe pero fuera de alcance". Pegasus no
distingue esos dos casos a propósito, así que este backend tampoco.

### Back office (`/back-office/*`, HTML)

| Path | Punto del pedido | Qué hace |
|---|---|---|
| `/back-office` | — | Inicio, navegación |
| `/back-office/sync` (GET form, POST acción) | **2.1** | Sincroniza por fecha (`/porfecha`) y persiste versionado |
| `/back-office/pacientes?documento=\|id_hub=\|nombre=` | **2.2** | Busca paciente cruzando padrón + Pegasus |
| `/back-office/estudios?id_hub=\|id_paciente=\|tutor_documento=[&fresh=1]` | **2.3, 2.4, 2.5** | Ficha de estudios: local-first, o en vivo + persistir; adjuntos con link/preview; historial de versiones |
| `/back-office/reportes?desde=&hasta=` | **2.6** | Órdenes por profesional y por estado |

## Persistencia versionada por estado (2.4)

Todo lo que se sincroniza (por fecha, o al ver la ficha de un paciente en
vivo) se guarda en `fhir_repo.orden_medica_snapshot`: **append-only**, una
fila nueva por cada `IdOrdenMedica` la primera vez que se ve, y otra fila
nueva cada vez que cambia `IdEstado` desde la última versión guardada. Si
sincronizás dos veces seguidas y nada cambió, no se inserta nada de
nuevo (evita historial ruidoso).

La vista `fhir_repo.orden_medica_actual` (`DISTINCT ON` por la versión más
alta) es la que usan la ficha de estudios y los reportes — siempre
"último estado conocido". El historial completo de una orden puntual se
ve con el `<details>` "Historial de estados" en la ficha.

`fhir_repo.sync_run` loguea cada corrida (manual desde el back office, o
la que dispare un cron/scheduled task más adelante): tipo, parámetros,
cuántas órdenes trajo Pegasus, cuántas versiones nuevas, si terminó ok o
con error.

## Búsqueda de paciente (2.2) y ficha de estudios (2.3)

La búsqueda por documento del tutor consulta **en paralelo** el padrón
OSPAN (`padron.related_person.documento` / `.dni`) y Pegasus
(`/ordenesmedicas/pacientes`), y cruza los resultados por `id_hub`. Si
Pegasus no responde (token vencido, red), la búsqueda sigue con lo que
haya en el padrón y lo avisa en pantalla — no rompe la búsqueda entera
por eso.

Una vez elegido el paciente, la ficha de estudios:

1. Si tiene `id_hub` (o `IdPaciente`) y ya hay algo sincronizado
   localmente, muestra **solo eso** (no vuelve a pegarle a Pegasus).
2. Si no hay nada local, va a buscar en vivo — por `id_hub` si es una
   mascota OSPAN, o por `IdPaciente` si no lo es (única vía documentada
   para su historial) — y **persiste todo antes de mostrarlo**.
3. El link "forzar traer en vivo de Pegasus" fuerza el paso 2 aunque ya
   haya datos locales, por si se quiere refrescar a mano.

## Adjuntos (2.5): cuidado con las URLs

Los links de `Adjuntos` **no llevan token** — cualquiera que tenga la URL
accede al estudio, para siempre, sin registro. La doc de Pegasus pide
explícitamente no publicarlas, no mandarlas por mail y no guardarlas en
logs. La ficha de estudios las muestra como link (PDF) o thumbnail
(imagen) apuntando **directo** a la URL de Pegasus — este backend no las
proxea ni las descarga, así que nunca pasan por sus logs.

## Mapeo Pegasus → FHIR R4

| Pegasus | Recurso FHIR | Notas |
|---|---|---|
| Mascota (`IdHub`, `IdPaciente`, `PacienteNombre`, `EspecieNombre`, `RazaNombre`, `PacienteFechaNac`) | **Patient** | `IdHub` es el `identifier` oficial. Especie/raza van en la extensión estándar `patient-animal`. |
| Tutor (`IdTutor`, `TutorNombre`, `TutorDocumento`) | **RelatedPerson** | Vinculado al Patient. |
| Médico solicitante | **Practitioner** | Referenciado desde `ServiceRequest.requester`. |
| Profesional que realiza (por ítem) | **Practitioner** | Referenciado desde `Observation.performer`. |
| Sucursal | **Organization** | Referenciada desde `ServiceRequest.locationReference`. |
| Cobertura | **Organization** (financiador) + **Coverage** | Ya no siempre es OSPAN: `/porfecha` trae todas las coberturas. |
| Orden médica, cabecera | **ServiceRequest** | `IdEstado` -> `status` FHIR + extensión `estado-origen-pegasus` sin pérdida (ver tabla de estados). |
| Ítem de la orden | **Observation** | `status` sale de `Realizada`. Sin valor cargado -> `dataAbsentReason`. |
| Informe / resultados | **DiagnosticReport** | Distingue "Realizada" (3) de "Realizada, informe pendiente" (5). |
| Adjuntos | **DocumentReference** | Ver advertencia de arriba. |
| `Importe` / `ImporteTotal` | *(no mapeado)* | Pegasus devuelve 0 en todos los casos por ahora. |

### Estados de la orden (`IdEstado`) → `ServiceRequest.status`

| Código | Pegasus | FHIR `status` |
|---|---|---|
| 1 | Pendiente de realización | `active` |
| 2 | Cancelada por tutor | `revoked` |
| 3 | Realizada | `completed` |
| 4 | Cancelada por médico | `revoked` |
| 5 | Realizada, informe pendiente | `completed` (matiz en `DiagnosticReport.status = partial`) |
| 6 | Autorizado por el tutor | `active` |
| 7 | Duplicado | `entered-in-error` |

## Padrón OSPAN/OMINT (schema `padron`)

Este backend **solo lee** de `padron.patient` y `padron.related_person`
(join por `patient.related_person_id`). Nunca escribe ni migra nada ahí.

### Supuestos a confirmar

- **`patient.identificador_ospan` == `id_hub` de Pegasus.** Es el único
  campo del padrón con pinta de ser esa clave, pero no está confirmado.
  Si no coincide, hay que ajustar `padronQueries.ts`.
- **Forma de la respuesta de `GET /pacientes/{idPaciente}/ordenes`.** La
  doc no muestra el JSON completo (solo dice "los mismos campos que en
  el listado"). Se modeló igual que `/porfecha` (`{ cantidad, ordenes[] }`)
  por consistencia — hay que confirmarlo contra una respuesta real y
  ajustar `PegasusOrdenesPorPacienteResponse` si hace falta.
- **Nombre de la base** (`HEALTHCARE_DB_NAME`): no se compartió — hace
  falta completarlo en `.env` / Secrets antes de poder conectar.

## Pensado para sumar otros HIS

`src/adapters/<sistema>/` sigue siendo el punto de extensión: cada HIS
(Pegasus hoy; ThingSoft, HUBSPOT, HUMAND después) tiene su propio cliente
+ tipos crudos, mapeando a los mismos recursos FHIR. El schema `fhir_repo`
ya tiene `source_system` en cada fila para poder convivir con más de un
origen sin pisarse.

## Próximos pasos sugeridos

1. Confirmar los dos supuestos de la sección de arriba contra datos
   reales, y el nombre de la base.
2. Probar la conexión a la RDS real desde donde vaya a correr esto de
   verdad (no se pudo desde este entorno de desarrollo).
3. Auth propia del backend (API key por header) antes de exponerlo fuera
   de una red controlada.
4. Convertir el sync manual (botón) en un scheduled job diario.
5. Sumar el segundo adapter (ThingSoft) reusando el mismo modelo.
