/**
 * Tipos del schema "padron" en la base Postgres/AWS de OSPAN (padrón
 * OSPAN/OMINT). Reflejan las columnas reales compartidas por Carlos Orue
 * (capturas de pantalla, 2026-08-31): padron.patient y
 * padron.related_person, unidas por patient.related_person_id.
 *
 * Este backend SOLO LEE de este schema. Nunca escribe ni migra nada acá.
 *
 * `identificador_ospan` NO es el id_hub de Pegasus -- es un identificador
 * propio de OSPAN (nro de carnet/membresía) sin relación con Pegasus.
 * Confirmado por Marcelo (2026-08-31): el id_hub real se CALCULA a partir
 * del uuid `patient.id` con la fórmula
 * `'pet_' || LEFT(REPLACE(id::text, '-', ''), 15)`, agregado como columna
 * calculada `id_hub` por `padronQueries.ts` (no es una columna real de la
 * tabla, por eso no aparece en `PadronPatientRow`).
 */

export interface PadronRelatedPersonRow {
  id: string; // uuid
  cod_titular: string | null;
  nombre_completo_legacy: string | null;
  nombre: string | null;
  apellido: string | null;
  cuit_cuil: string | null;
  documento: string | null;
  dni: string | null;
  origen: string | null;
  origen_credencial: string | null;
  canal_pago: string | null;
  email: string | null;
  telefono: string | null;
  direccion_calle_y_numero: string | null;
  direccion_localidad: string | null;
  direccion_codigo_postal: string | null;
  direccion_provincia: string | null;
  direccion_legacy: string | null;
  updated_at: string;
}

export interface PadronPatientRow {
  id: string; // uuid
  identificador_ospan: string | null;
  nro_carnet: string | null;
  nombre: string | null;
  legacy_nombre: string | null;
  especie_id: number | null;
  raza_ospan_code: string | null;
  legacy_raza: string | null;
  sexo: string | null;
  edad: string | null; // numeric llega como string desde pg por defecto
  fecha_nacimiento: string | null;
  fecha_alta: string | null;
  estado: string | null;
  motivo_baja: string | null;
  color_pelaje: string | null;
  origen: string | null;
  origen_credencial: string | null;
  photo_key: string | null;
  has_preexisting_conditions: boolean | null;
  preexisting_details: string | null;
  health_declaration: string | null;
  related_person_id: string | null;
  sucursal_id: string | null;
  updated_at: string;
}

/** patient + related_person (tutor) ya unidos, para mostrar en el back office. */
export interface PadronPacienteConTutor extends PadronPatientRow {
  /** Calculado en SQL, ver nota arriba -- NO es `identificador_ospan`. */
  id_hub: string;
  tutor: PadronRelatedPersonRow | null;
}
