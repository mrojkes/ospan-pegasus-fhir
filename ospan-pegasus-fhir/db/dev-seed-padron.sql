-- SOLO PARA DESARROLLO LOCAL / pruebas de este prototipo.
-- Reproduce la forma real del schema "padron" (segun las columnas que
-- compartio Marcelo) con datos ficticios, para poder probar el adapter
-- de padron sin tocar la base real de AWS.

CREATE SCHEMA IF NOT EXISTS padron;

CREATE TABLE IF NOT EXISTS padron.related_person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_titular varchar(50),
  nombre_completo_legacy varchar(255),
  nombre varchar(100),
  apellido varchar(100),
  cuit_cuil varchar(50),
  documento varchar(100),
  dni varchar(50),
  origen varchar(100),
  origen_credencial varchar(100),
  canal_pago varchar(100),
  email varchar(255),
  telefono varchar(100),
  direccion_calle_y_numero varchar(255),
  direccion_localidad varchar(100),
  direccion_codigo_postal varchar(50),
  direccion_provincia varchar(100),
  direccion_legacy text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS padron.patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identificador_ospan varchar(100),
  nro_carnet varchar(100),
  nombre varchar(100),
  legacy_nombre varchar(255),
  especie_id integer,
  raza_ospan_code varchar(50),
  legacy_raza varchar(100),
  sexo varchar(50),
  edad numeric(5, 2),
  fecha_nacimiento timestamp,
  fecha_alta timestamp,
  estado varchar(50),
  motivo_baja varchar(255),
  color_pelaje varchar(100),
  origen varchar(100),
  origen_credencial varchar(100),
  photo_key varchar(255),
  has_preexisting_conditions boolean,
  preexisting_details text,
  health_declaration varchar(255),
  related_person_id uuid REFERENCES padron.related_person(id),
  sucursal_id uuid,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_related_person_dni ON padron.related_person (dni);
CREATE INDEX IF NOT EXISTS idx_related_person_documento ON padron.related_person (documento);
CREATE INDEX IF NOT EXISTS idx_patient_identificador_ospan ON padron.patient (identificador_ospan);
CREATE INDEX IF NOT EXISTS idx_patient_related_person_id ON padron.patient (related_person_id);

-- Datos ficticios, calzados con los ejemplos de la doc de Pegasus
-- (mismo TutorDocumento / PacienteNombre / IdHub que "Bamba guzman").
INSERT INTO padron.related_person (id, nombre, apellido, documento, dni, email, telefono)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Mariana', 'Galan', '29317482', '29317482', 'mariana.galan@example.com', '+54 11 5555-0001')
ON CONFLICT DO NOTHING;

INSERT INTO padron.patient (id, identificador_ospan, nombre, estado, related_person_id)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'pet_a1b2c3', 'Bamba guzman', 'activo', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;
