-- =========================================================
-- Schema propio de la App Asociado (OTP, sesiones, tokens de
-- atención, contratos y directorio de prestadores).
--
-- Todo IF NOT EXISTS: seguro de re-ejecutar. No toca `padron`
-- (solo lectura para este backend) ni `fhir_repo`.
-- Se corre con `npm run migrate` (lee db/NNN-*.sql en orden).
-- =========================================================

CREATE SCHEMA IF NOT EXISTS app_asociado;

-- ---------------------------------------------------------
-- Códigos de un solo uso para el login por DNI.
-- Guardamos hash del código, nunca el código en claro.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.otp_challenge (
  id              BIGSERIAL PRIMARY KEY,
  dni             TEXT        NOT NULL,
  related_person_id UUID      NOT NULL,
  codigo_hash     TEXT        NOT NULL,
  canal           TEXT        NOT NULL,       -- whatsapp | sms | email
  destino         TEXT        NOT NULL,       -- teléfono/email al que se mandó
  intentos        INT         NOT NULL DEFAULT 0,
  consumido       BOOLEAN     NOT NULL DEFAULT FALSE,
  expira_en       TIMESTAMPTZ NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              TEXT
);

CREATE INDEX IF NOT EXISTS otp_challenge_dni_idx
  ON app_asociado.otp_challenge (dni, creado_en DESC);

-- ---------------------------------------------------------
-- Tokens de atención que el asociado le muestra al prestador.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.token_atencion (
  id              BIGSERIAL PRIMARY KEY,
  codigo          TEXT        NOT NULL,
  id_hub          TEXT        NOT NULL,
  patient_id      UUID        NOT NULL,
  related_person_id UUID      NOT NULL,
  expira_en       TIMESTAMPTZ NOT NULL,
  usado_en        TIMESTAMPTZ,
  usado_por       TEXT,                        -- prestador que lo consumió
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS token_atencion_codigo_vigente_idx
  ON app_asociado.token_atencion (codigo)
  WHERE usado_en IS NULL;

CREATE INDEX IF NOT EXISTS token_atencion_hub_idx
  ON app_asociado.token_atencion (id_hub, creado_en DESC);

-- ---------------------------------------------------------
-- Contrato de afiliación firmado desde la app.
-- Placeholder hasta que exista el circuito real de alta.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.contrato (
  id                BIGSERIAL PRIMARY KEY,
  related_person_id UUID        NOT NULL,
  codigo            TEXT        NOT NULL,
  fecha_firma       DATE        NOT NULL,
  vigencia_desde    DATE        NOT NULL,
  vigencia_hasta    DATE,
  planes            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  archivo_url       TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contrato_related_person_idx
  ON app_asociado.contrato (related_person_id);

-- ---------------------------------------------------------
-- Directorio de prestadores de la red.
-- Temporal: cuando entre el adapter de ThingSoft esto sale de
-- ahí (o del schema `vet` de la RDS) y esta tabla se retira.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_asociado.prestador (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT    NOT NULL,
  categoria     TEXT    NOT NULL,   -- veterinaria | peluqueria | guarderia | adiestrador
  zona          TEXT    NOT NULL,
  direccion     TEXT,
  telefono      TEXT,
  lat           NUMERIC(9,6),
  lng           NUMERIC(9,6),
  horario_texto TEXT,
  abierto       BOOLEAN NOT NULL DEFAULT TRUE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS prestador_zona_idx ON app_asociado.prestador (zona) WHERE activo;
