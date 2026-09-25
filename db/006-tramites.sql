-- =========================================================
-- TRÁMITES (expedientes del afiliado)
--
-- Un trámite es un FHIR `Task`: alguien pide algo, alguien lo
-- resuelve, y en el medio hay estados, fechas y documentación.
-- Lo que el afiliado completó se guarda como `QuestionnaireResponse`
-- (jsonb), y cada archivo adjunto en su propia fila.
--
-- OSPAN numera los trámites con SU PROPIA serie: no se integra con
-- ThingSoft. El número (TR-AAAA-NNNNNN) sale de una secuencia, no de
-- un count(*), para que dos trámites simultáneos no puedan sacar el
-- mismo número.
--
-- `related_person_id` / `patient_id` son TEXT, como el resto del
-- schema desde la migración 005: el padrón manda el tipo de id.
--
-- IF NOT EXISTS en todo: seguro de re-ejecutar (npm run migrate).
-- =========================================================

CREATE SEQUENCE IF NOT EXISTS app_asociado.tramite_nro_seq;

CREATE TABLE IF NOT EXISTS app_asociado.tramite (
  id                BIGSERIAL PRIMARY KEY,
  -- Número de expediente que ve el afiliado. Es la clave pública:
  -- todos los endpoints trabajan con esto, nunca con el id interno.
  nro               TEXT        NOT NULL UNIQUE,
  tipo              TEXT        NOT NULL,
  titulo            TEXT        NOT NULL,
  -- Canonical del Questionnaire con el que se respondió: "<url>|<version>".
  -- Guardarlo permite re-renderizar un trámite viejo con el formulario
  -- que el afiliado efectivamente vio, aunque hoy el cuestionario tenga
  -- preguntas nuevas.
  questionnaire     TEXT        NOT NULL,
  respuesta         JSONB       NOT NULL,

  related_person_id TEXT        NOT NULL,
  -- Nulos cuando el trámite es del titular y no de una mascota.
  patient_id        TEXT,
  id_hub            TEXT,
  mascota_nombre    TEXT,

  estado            TEXT        NOT NULL DEFAULT 'abierto'
                    CHECK (estado IN ('abierto','en_proceso','falta_documentacion',
                                      'resuelto','rechazado','anulado')),
  -- Lo que OSPAN le contesta al afiliado al cerrarlo.
  resolucion        TEXT,
  resuelto_en       TIMESTAMPTZ,
  resuelto_por      TEXT,

  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tramite_tutor_idx
  ON app_asociado.tramite (related_person_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS tramite_estado_idx
  ON app_asociado.tramite (estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS tramite_tipo_idx
  ON app_asociado.tramite (tipo, estado);

-- ---------------------------------------------------------
-- Documentación adjunta.
-- `link_id` es el ítem del Questionnaire al que corresponde el
-- archivo ("doc-factura", "doc-dni-nuevo"): por eso el back office
-- puede decir QUÉ documento falta, en vez de "faltan adjuntos".
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.tramite_adjunto (
  id            BIGSERIAL PRIMARY KEY,
  tramite_id    BIGINT      NOT NULL REFERENCES app_asociado.tramite(id) ON DELETE CASCADE,
  link_id       TEXT        NOT NULL,
  etiqueta      TEXT,
  nombre        TEXT        NOT NULL,
  content_type  TEXT        NOT NULL,
  bytes         INT         NOT NULL,
  contenido     BYTEA       NOT NULL,
  -- Quién lo subió: 'afiliado' o 'ospan'.
  origen        TEXT        NOT NULL DEFAULT 'afiliado',
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tramite_adjunto_idx
  ON app_asociado.tramite_adjunto (tramite_id, link_id);

-- ---------------------------------------------------------
-- Historial. Cada movimiento queda registrado: es lo que la app
-- muestra como seguimiento y lo que sale como `Task.note`.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.tramite_evento (
  id          BIGSERIAL PRIMARY KEY,
  tramite_id  BIGINT      NOT NULL REFERENCES app_asociado.tramite(id) ON DELETE CASCADE,
  estado      TEXT        NOT NULL,
  detalle     TEXT,
  -- 'afiliado' | 'ospan' | 'sistema'
  autor       TEXT        NOT NULL DEFAULT 'sistema',
  -- true: se le muestra al afiliado. Las notas internas quedan en false.
  visible     BOOLEAN     NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tramite_evento_idx
  ON app_asociado.tramite_evento (tramite_id, creado_en);
