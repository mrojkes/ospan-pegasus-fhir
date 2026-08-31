# Prompt para Replit Agent

Pegar tal cual en Replit Agent después de importar el repo (Import from
GitHub o subiendo el .zip) en un nuevo Repl "Node.js + TypeScript".

---

Este repo (`ospan-pegasus-fhir`) es un backend Express + TypeScript, ya
con un prototipo de back office funcionando, que:

1. Hace de proxy autenticado hacia la API de Pegasus (Panda HIS) —
   incluidos los endpoints por fecha, por documento del tutor y por
   paciente (`src/adapters/pegasus/`).
2. Transforma esas órdenes a Bundles FHIR R4 (`src/fhir/mappers/`).
3. Persiste esos Bundles **versionados por estado** en Postgres, schema
   propio `fhir_repo` (`src/persistence/`, `db/001-fhir-repo-schema.sql`).
4. Busca pacientes cruzando el padrón OSPAN/OMINT (schema `padron`, solo
   lectura) con Pegasus en vivo (`src/adapters/padron/`,
   `src/services/patientSearch.ts`).
5. Expone un back office server-side (`src/routes/backOffice.ts`) para
   sincronizar por fecha, buscar pacientes, ver estudios con sus adjuntos,
   y reportes por profesional/estado.

Quiero que hagas lo siguiente, en este orden:

## 1. Poner el proyecto a correr en Replit

- `npm install`, después `npm run dev` (tsx watch).
- Secrets a crear en Replit: `PEGASUS_BASE_URL`, `PEGASUS_TOKEN`,
  `HEALTHCARE_DB_HOST`, `HEALTHCARE_DB_PORT`, `HEALTHCARE_DB_NAME`,
  `HEALTHCARE_DB_USER`, `HEALTHCARE_DB_PASSWORD`, `HEALTHCARE_DB_SSL`
  (ver `.env.example`). **Nunca** los pongas en un archivo del repo.
- Antes de conectar contra la base real, correr
  `db/001-fhir-repo-schema.sql` contra ella UNA vez (es idempotente, se
  puede re-correr sin problema) para crear el schema `fhir_repo`. No toca
  `padron` ni ningún otro schema existente.
- Confirmar que `GET /health` responde y que
  `npx tsx scripts/testWithMock.ts` corre sin red y sin errores.
- Si por ahora no hay conectividad a la base real desde Replit tampoco
  (puede ser un tema de security group de la RDS), avisame en vez de
  asumir que es un bug del código -- primero descartar que sea red.

## 2. Confirmar un supuesto contra datos reales (documentado en el README)

- La forma de la respuesta de `GET /api/ordenesmedicas/pacientes/{id}/ordenes`
  se modeló por consistencia con `/porfecha`, sin verla completa en la
  doc (`PegasusOrdenesPorPacienteResponse` en `pegasusTypes.ts`). Probar
  contra la API real y ajustar el tipo si hace falta.

(El `id_hub` del padrón ya está resuelto: no es `patient.identificador_ospan`,
se calcula con `'pet_' || LEFT(REPLACE(id::text, '-', ''), 15)` sobre
`patient.id` — ver README, sección "`id_hub` del padrón (confirmado)".)

## 3. Pasar el sync manual a scheduled job

Hoy `/back-office/sync` es un botón que dispara `syncPorFecha` a mano.
Quiero que además corra solo, una vez al día (al cierre, como dice la
doc de Pegasus para `/porfecha`) sin intervención manual. Usá lo que
tenga Replit para scheduled tasks/cron; si no hay nada nativo cómodo, un
`setInterval` con chequeo de hora dentro del propio proceso alcanza para
esta etapa (no hace falta infraestructura extra).

## 4. Autenticación propia del backend

Todavía no tiene ninguna -- ni el back office ni la API JSON. Antes de
dejarlo accesible fuera de una red controlada, sumá algo simple: una
sesión con usuario/contraseña para el back office (son usuarios internos
de OSPAN viéndolo) alcanza para esta etapa; para la API JSON un API key
por header (`X-OSPAN-Api-Key`) validado contra un secret.

## 5. Dejar la puerta abierta a otros HIS

No implementes nada de esto todavía, pero al tocar `src/adapters/` y
`src/fhir/mappers/` respetá el patrón que ya está: un adapter por sistema
de origen, mapeando a los mismos recursos FHIR. El `source_system` que ya
lleva cada fila de `fhir_repo.orden_medica_snapshot` está pensado
justamente para que convivan varios orígenes sin pisarse.

## Qué NO quiero que cambies sin avisar

- `db/001-fhir-repo-schema.sql`: no crea nada fuera del schema
  `fhir_repo`. No lo cambies para que toque `padron` ni ningún otro
  schema existente.
- `src/adapters/padron/`: es SOLO LECTURA a propósito. No agregues
  ningún INSERT/UPDATE/DELETE contra `padron.*`.
- El versionado append-only de `orden_medica_snapshot`
  (`upsertVersionSiCambio` en `ordenMedicaRepo.ts`): nunca hace UPDATE de
  una fila ya guardada, solo INSERT de una versión nueva. Es el
  comportamiento pedido (2.4: historial completo por estado).
- No loguear el body de requests/responses que incluyan `Adjuntos`: esas
  URLs no llevan token y exponerlas en logs es justo lo que la doc de
  Pegasus pide evitar.

Contame qué vas resolviendo en cada paso antes de pasar al siguiente,
para poder ir revisando.
