/**
 * Tipos del schema "padron" en la base Postgres/AWS de OSPAN (padrón
 * OSPAN/OMINT). Reflejan las columnas reales compartidas por Carlos Orue
 * (capturas de pantalla, 2026-08-31): padron.patient y
 * padron.related_person, unidas por patient.related_person_id.
 *
 * Este backend SOLO LEE de este schema. Nunca escribe ni migra nada acá.
 *
 * SUPUESTO A CONFIRMAR: se asume que `patient.identificador_ospan`
 * coincide con el `id_hub` que usa Pegasus para identificar la mascota
 * (es el único campo del padrón que tiene pinta de ser esa clave). Si no
 * es así, hay que ajustar `padronQueries.ts` con el campo correcto.
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
  tutor: PadronRelatedPersonRow | null;
}
