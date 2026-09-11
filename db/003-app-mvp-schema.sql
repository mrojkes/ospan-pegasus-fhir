-- =========================================================
-- App Asociado — funcionalidades del MVP PetConnect
-- Autorizaciones, turnos, reintegros, DDJJ, copagos, cartilla
-- de prestadores y comunidad.
--
-- Todo vive en el schema `app_asociado` (propio de la app).
-- `padron` sigue siendo SOLO LECTURA: por eso la DDJJ que
-- actualiza el tutor NO se escribe en padron.patient, se guarda
-- acá y el padrón queda como valor de base.
--
-- IF NOT EXISTS en todo: seguro de re-ejecutar (npm run migrate).
-- =========================================================

-- ---------------------------------------------------------
-- Estados compartidos por las tres solicitudes del afiliado.
-- Se usa texto con CHECK en vez de un enum: agregar un estado
-- nuevo no obliga a un ALTER TYPE con la base en uso.
-- ---------------------------------------------------------

-- ============ AUTORIZACIONES ============
CREATE TABLE IF NOT EXISTS app_asociado.solicitud_autorizacion (
  id                BIGSERIAL PRIMARY KEY,
  codigo            TEXT        NOT NULL UNIQUE,
  related_person_id UUID        NOT NULL,
  patient_id        UUID        NOT NULL,
  id_hub            TEXT        NOT NULL,
  mascota_nombre    TEXT,
  tipo_prestacion   TEXT        NOT NULL,
  prestador_id      BIGINT,
  prestador_nombre  TEXT,
  diagnostico       TEXT,
  -- Código CIE-10 tal como lo eligió el tutor. Texto libre por
  -- ahora: cuando el schema `terminology` esté disponible se valida
  -- contra él.
  diagnostico_codigo TEXT,
  observaciones     TEXT,
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobada','rechazada','anulada')),
  motivo_resolucion TEXT,
  resuelta_en       TIMESTAMPTZ,
  resuelta_por      TEXT,
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autorizacion_tutor_idx
  ON app_asociado.solicitud_autorizacion (related_person_id, creada_en DESC);
CREATE INDEX IF NOT EXISTS autorizacion_estado_idx
  ON app_asociado.solicitud_autorizacion (estado, creada_en DESC);

-- ============ TURNOS ============
-- No hay agenda en vivo de las veterinarias todavía, así que esto
-- modela una SOLICITUD de turno: el tutor pide día y franja, y
-- OSPAN (o la veterinaria) confirma. Cuando exista la agenda real
-- se reemplaza la confirmación manual por la reserva directa.
CREATE TABLE IF NOT EXISTS app_asociado.turno (
  id                BIGSERIAL PRIMARY KEY,
  codigo            TEXT        NOT NULL UNIQUE,
  related_person_id UUID        NOT NULL,
  patient_id        UUID        NOT NULL,
  id_hub            TEXT        NOT NULL,
  mascota_nombre    TEXT,
  prestador_id      BIGINT,
  prestador_nombre  TEXT,
  motivo            TEXT        NOT NULL,
  fecha             DATE        NOT NULL,
  hora              TIME        NOT NULL,
  estado            TEXT        NOT NULL DEFAULT 'solicitado'
                    CHECK (estado IN ('solicitado','confirmado','cancelado','realizado')),
  motivo_resolucion TEXT,
  resuelta_en       TIMESTAMPTZ,
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turno_tutor_idx
  ON app_asociado.turno (related_person_id, fecha DESC);
CREATE INDEX IF NOT EXISTS turno_estado_idx
  ON app_asociado.turno (estado, fecha);

-- ============ REINTEGROS ============
CREATE TABLE IF NOT EXISTS app_asociado.reintegro (
  id                BIGSERIAL PRIMARY KEY,
  codigo            TEXT        NOT NULL UNIQUE,
  related_person_id UUID        NOT NULL,
  patient_id        UUID        NOT NULL,
  id_hub            TEXT        NOT NULL,
  mascota_nombre    TEXT,
  tipo_prestacion   TEXT        NOT NULL,
  descripcion       TEXT,
  -- numeric, no float: son pesos.
  monto             NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  monto_aprobado    NUMERIC(14,2),
  fecha_prestacion  DATE        NOT NULL,
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobado','rechazado')),
  motivo_resolucion TEXT,
  resuelta_en       TIMESTAMPTZ,
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reintegro_tutor_idx
  ON app_asociado.reintegro (related_person_id, creada_en DESC);
CREATE INDEX IF NOT EXISTS reintegro_estado_idx
  ON app_asociado.reintegro (estado, creada_en DESC);

-- Comprobantes: se guardan en la base y no en disco porque el
-- filesystem de Replit no sobrevive a un redeploy, y perder el
-- comprobante de un reintegro ya presentado sería un problema real
-- para el afiliado.
CREATE TABLE IF NOT EXISTS app_asociado.reintegro_adjunto (
  id            BIGSERIAL PRIMARY KEY,
  reintegro_id  BIGINT      NOT NULL REFERENCES app_asociado.reintegro(id) ON DELETE CASCADE,
  nombre        TEXT        NOT NULL,
  content_type  TEXT        NOT NULL,
  bytes         INT         NOT NULL,
  contenido     BYTEA       NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reintegro_adjunto_idx
  ON app_asociado.reintegro_adjunto (reintegro_id);

-- ============ DECLARACIÓN JURADA ============
-- El padrón tiene has_preexisting_conditions / preexisting_details /
-- health_declaration, pero es de solo lectura para este backend: lo
-- que el tutor responde desde la app se guarda acá, versionado, y el
-- padrón queda como valor de base. Nunca se pisa el padrón.
CREATE TABLE IF NOT EXISTS app_asociado.ddjj (
  id                BIGSERIAL PRIMARY KEY,
  related_person_id UUID        NOT NULL,
  patient_id        UUID        NOT NULL,
  id_hub            TEXT        NOT NULL,
  -- {codigoPregunta: respuesta}, para no tener que migrar la tabla
  -- cada vez que cambia el cuestionario.
  respuestas        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ddjj_mascota_idx
  ON app_asociado.ddjj (id_hub, creada_en DESC);

-- Última versión por mascota, que es lo que muestra la app.
CREATE OR REPLACE VIEW app_asociado.ddjj_actual AS
  SELECT DISTINCT ON (id_hub) *
    FROM app_asociado.ddjj
   ORDER BY id_hub, creada_en DESC;

-- ============ COPAGOS ============
-- Tabla propia por ahora. El schema `financial` de la RDS tiene
-- carencias y precios: cuando se confirme su estructura, esta tabla
-- se reemplaza por una consulta allá (un solo lugar: copagosDeAfiliado
-- en mvpQueries.ts).
CREATE TABLE IF NOT EXISTS app_asociado.copago (
  id          BIGSERIAL PRIMARY KEY,
  plan        TEXT        NOT NULL,
  categoria   TEXT        NOT NULL,
  copago      NUMERIC(14,2) NOT NULL,
  cobertura   INT         NOT NULL CHECK (cobertura BETWEEN 0 AND 100),
  vigente_desde DATE      NOT NULL DEFAULT CURRENT_DATE,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  orden       INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS copago_plan_idx ON app_asociado.copago (plan, orden) WHERE activo;

-- ============ CARTILLA (prestadores) ============
-- La tabla `prestador` ya existe (migración 002). Acá se le agregan
-- las columnas que pide la cartilla del MVP.
ALTER TABLE app_asociado.prestador ADD COLUMN IF NOT EXISTS especialidades TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE app_asociado.prestador ADD COLUMN IF NOT EXISTS copago NUMERIC(14,2);
ALTER TABLE app_asociado.prestador ADD COLUMN IF NOT EXISTS puntaje NUMERIC(2,1);
ALTER TABLE app_asociado.prestador ADD COLUMN IF NOT EXISTS opiniones INT NOT NULL DEFAULT 0;
ALTER TABLE app_asociado.prestador ADD COLUMN IF NOT EXISTS acepta_turnos BOOLEAN NOT NULL DEFAULT TRUE;

-- ============ COMUNIDAD ============
CREATE TABLE IF NOT EXISTS app_asociado.comunidad_prestador (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT    NOT NULL,   -- Paseador | Peluquería | Guardería | Pet Shop | Nutricionista
  nombre      TEXT    NOT NULL,
  zona        TEXT,
  precio      TEXT,               -- texto libre: "$3.500/paseo", "Desde $8.000"
  telefono    TEXT,
  whatsapp    TEXT,
  puntaje     NUMERIC(2,1),
  opiniones   INT     NOT NULL DEFAULT 0,
  verificado  BOOLEAN NOT NULL DEFAULT FALSE,
  emoji       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS comunidad_tipo_idx ON app_asociado.comunidad_prestador (tipo) WHERE activo;

-- ============ RECORDATORIOS ============
-- Vacunas y controles próximos. Los carga OSPAN (o un futuro adapter
-- de ThingSoft); la app solo los lee.
CREATE TABLE IF NOT EXISTS app_asociado.recordatorio (
  id          BIGSERIAL PRIMARY KEY,
  id_hub      TEXT        NOT NULL,
  titulo      TEXT        NOT NULL,
  detalle     TEXT,
  fecha       DATE        NOT NULL,
  tipo        TEXT        NOT NULL DEFAULT 'vacuna',
  cumplido    BOOLEAN     NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recordatorio_hub_idx
  ON app_asociado.recordatorio (id_hub, fecha) WHERE NOT cumplido;

-- =========================================================
-- DATOS DE ARRANQUE
-- Solo tablas de catálogo (copagos, cartilla, comunidad): son
-- configuración que OSPAN va a editar, no datos de afiliados.
-- Nada de esto inventa información clínica ni de padrón.
-- Se insertan una sola vez; re-ejecutar la migración no duplica.
-- =========================================================

INSERT INTO app_asociado.copago (plan, categoria, copago, cobertura, orden)
SELECT * FROM (VALUES
  ('*', 'Consulta general',            2500.00, 80, 1),
  ('*', 'Consulta especialista',       3200.00, 70, 2),
  ('*', 'Vacunación',                  1800.00, 90, 3),
  ('*', 'Cirugía menor',               5000.00, 75, 4),
  ('*', 'Cirugía mayor',               8500.00, 70, 5),
  ('*', 'Diagnóstico por imagen',      4000.00, 75, 6),
  ('*', 'Laboratorio',                 2000.00, 85, 7),
  ('*', 'Internación (por día)',       6000.00, 70, 8),
  ('*', 'Emergencia',                  3500.00, 80, 9)
) AS v(plan, categoria, copago, cobertura, orden)
WHERE NOT EXISTS (SELECT 1 FROM app_asociado.copago);

INSERT INTO app_asociado.prestador
  (nombre, categoria, zona, direccion, telefono, horario_texto, abierto, especialidades, copago, puntaje, opiniones)
SELECT * FROM (VALUES
  ('Panda Veterinaria Central', 'veterinaria', 'Almagro', 'Av. Corrientes 3200, CABA', '011-4555-1234',
   'Lun a Sáb 8 a 20 hs', true, ARRAY['Clínica General','Cirugía','Diagnóstico por imágenes'], 2500.00, 4.8, 342),
  ('Panda Veterinaria Norte', 'veterinaria', 'Belgrano', 'Av. Cabildo 1540, CABA', '011-4777-5678',
   'Lun a Vie 9 a 19 hs', true, ARRAY['Clínica General','Dermatología','Cardiología'], 2500.00, 4.6, 218),
  ('Centro Veterinario San Martín', 'veterinaria', 'Vicente López', 'San Martín 890, Vicente López', '011-4796-9012',
   'Lun a Sáb 8 a 21 hs', true, ARRAY['Traumatología','Oncología','Neurología'], 3200.00, 4.9, 156),
  ('VetCare Belgrano', 'veterinaria', 'Belgrano', 'Juramento 2100, CABA', '011-4788-3456',
   'Todos los días 9 a 20 hs', true, ARRAY['Clínica General','Odontología','Laboratorio'], 2800.00, 4.5, 189)
) AS v(nombre, categoria, zona, direccion, telefono, horario_texto, abierto, especialidades, copago, puntaje, opiniones)
WHERE NOT EXISTS (SELECT 1 FROM app_asociado.prestador);

INSERT INTO app_asociado.comunidad_prestador
  (tipo, nombre, zona, precio, telefono, whatsapp, puntaje, opiniones, verificado, emoji)
SELECT * FROM (VALUES
  ('Paseador',      'Carlos Méndez', 'Palermo / Belgrano', '$3.500 por paseo',   '011-5555-1111', '5491155551111', 4.9,  87, true, '🚶'),
  ('Peluquería',    'Pet Glamour',   'Recoleta',           'Desde $8.000',       '011-5555-2222', '5491155552222', 4.7, 134, true, '✂️'),
  ('Guardería',     'Happy Tails',   'Núñez',              '$5.000 por día',     '011-5555-3333', '5491155553333', 4.8,  96, true, '🏠'),
  ('Pet Shop',      'MundoPet',      'Envíos a CABA',      'Envío sin cargo +$15.000', '011-5555-4444', '5491155554444', 4.6, 210, true, '🛍️'),
  ('Nutricionista', 'Dra. Ana Vidal','Online / CABA',      '$12.000 la consulta','011-5555-5555', '5491155555555', 5.0,  45, true, '🥗'),
  ('Paseador',      'Laura Torres',  'Caballito / Flores', '$3.000 por paseo',   '011-5555-6666', '5491155556666', 4.8,  62, true, '🚶')
) AS v(tipo, nombre, zona, precio, telefono, whatsapp, puntaje, opiniones, verificado, emoji)
WHERE NOT EXISTS (SELECT 1 FROM app_asociado.comunidad_prestador);
