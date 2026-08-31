-- Repositorio de datos clinicos (FHIR) para OSPAN.
-- Pensado para correr en la MISMA base "healthcare" donde ya vive el
-- schema "padron", pero en un schema propio y separado: no toca padron,
-- core, financial, public, temp, terminology ni vet. Solo crea lo que
-- necesita, todo con IF NOT EXISTS -- es seguro re-ejecutarlo.
--
-- Revisar antes de correr contra la base real. Pensado para ejecutarse
-- con un usuario que tenga permiso de CREATE SCHEMA en esa base.

CREATE SCHEMA IF NOT EXISTS fhir_repo;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid()

-- Una fila por CADA cambio de estado que vemos de una orden medica.
-- No se pisa nunca (append-only): es el historial ("versionado por
-- estado") que pide el punto 2.4 del prototipo. "version" es correlativo
-- por id_orden_medica + source_system, arranca en 1.
CREATE TABLE IF NOT EXISTS fhir_repo.orden_medica_snapshot (
  id bigserial PRIMARY KEY,
  source_system varchar(50) NOT NULL DEFAULT 'pegasus-panda',
  id_orden_medica bigint NOT NULL,
  version int NOT NULL,
  id_hub varchar(100),
  id_paciente bigint,
  paciente_nombre varchar(255),
  id_tutor bigint,
  tutor_documento varchar(50),
  id_estado smallint NOT NULL,
  estado_nombre varchar(100) NOT NULL,
  id_medico bigint,
  medico_nombre varchar(255),
  id_servicio bigint,
  servicio_nombre varchar(255),
  id_cobertura smallint,
  cobertura_nombre varchar(100),
  fecha_orden timestamptz,
  fecha_resultados timestamptz,
  fhir_bundle jsonb NOT NULL,
  raw_pegasus jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, id_orden_medica, version)
);

CREATE INDEX IF NOT EXISTS idx_oms_id_orden ON fhir_repo.orden_medica_snapshot (source_system, id_orden_medica);
CREATE INDEX IF NOT EXISTS idx_oms_id_hub ON fhir_repo.orden_medica_snapshot (id_hub);
CREATE INDEX IF NOT EXISTS idx_oms_id_paciente ON fhir_repo.orden_medica_snapshot (id_paciente);
CREATE INDEX IF NOT EXISTS idx_oms_tutor_documento ON fhir_repo.orden_medica_snapshot (tutor_documento);
CREATE INDEX IF NOT EXISTS idx_oms_estado ON fhir_repo.orden_medica_snapshot (id_estado);
CREATE INDEX IF NOT EXISTS idx_oms_medico ON fhir_repo.orden_medica_snapshot (medico_nombre);
CREATE INDEX IF NOT EXISTS idx_oms_fecha_orden ON fhir_repo.orden_medica_snapshot (fecha_orden);

-- Vista de "estado actual" = la ultima version de cada orden. Es sobre
-- esta vista que se arman la ficha de estudios (2.3) y los reportes (2.6);
-- la tabla de abajo guarda el historial completo.
CREATE OR REPLACE VIEW fhir_repo.orden_medica_actual AS
SELECT DISTINCT ON (source_system, id_orden_medica) *
FROM fhir_repo.orden_medica_snapshot
ORDER BY source_system, id_orden_medica, version DESC;

-- Log de cada corrida de sincronizacion (por fecha, o disparada a mano
-- desde el back office). Sirve para saber "hasta cuando esta al dia" la
-- base local (punto 2.3: si el sync esta al dia, no hace falta ir a
-- buscar en vivo).
CREATE TABLE IF NOT EXISTS fhir_repo.sync_run (
  id bigserial PRIMARY KEY,
  tipo varchar(30) NOT NULL, -- 'por_fecha' | 'por_id_hub' | 'por_paciente' | 'por_documento_tutor'
  parametros jsonb NOT NULL,
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  cantidad_ordenes_pegasus int,
  cantidad_versiones_nuevas int,
  estado varchar(20) NOT NULL DEFAULT 'corriendo', -- corriendo | ok | error
  error text
);

CREATE INDEX IF NOT EXISTS idx_sync_run_tipo_fecha ON fhir_repo.sync_run (tipo, iniciado_at DESC);
