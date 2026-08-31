import { getPool } from "../../persistence/db";
import type { PadronPacienteConTutor } from "./padronTypes";

const SELECT_PACIENTE_CON_TUTOR = `
  select
    p.id, p.identificador_ospan, p.nro_carnet, p.nombre, p.legacy_nombre,
    p.especie_id, p.raza_ospan_code, p.legacy_raza, p.sexo, p.edad,
    p.fecha_nacimiento, p.fecha_alta, p.estado, p.motivo_baja,
    p.color_pelaje, p.origen, p.origen_credencial, p.photo_key,
    p.has_preexisting_conditions, p.preexisting_details, p.health_declaration,
    p.related_person_id, p.sucursal_id, p.updated_at,
    rp.id as rp_id, rp.cod_titular, rp.nombre_completo_legacy,
    rp.nombre as rp_nombre, rp.apellido as rp_apellido, rp.cuit_cuil,
    rp.documento, rp.dni, rp.origen as rp_origen,
    rp.origen_credencial as rp_origen_credencial, rp.canal_pago, rp.email,
    rp.telefono, rp.direccion_calle_y_numero, rp.direccion_localidad,
    rp.direccion_codigo_postal, rp.direccion_provincia, rp.direccion_legacy,
    rp.updated_at as rp_updated_at
  from padron.patient p
  left join padron.related_person rp on rp.id = p.related_person_id
`;

function mapRow(row: Record<string, unknown>): PadronPacienteConTutor {
  const {
    rp_id,
    cod_titular,
    nombre_completo_legacy,
    rp_nombre,
    rp_apellido,
    cuit_cuil,
    documento,
    dni,
    rp_origen,
    rp_origen_credencial,
    canal_pago,
    email,
    telefono,
    direccion_calle_y_numero,
    direccion_localidad,
    direccion_codigo_postal,
    direccion_provincia,
    direccion_legacy,
    rp_updated_at,
    ...patient
  } = row as Record<string, any>;

  return {
    ...(patient as any),
    tutor: rp_id
      ? {
          id: rp_id,
          cod_titular,
          nombre_completo_legacy,
          nombre: rp_nombre,
          apellido: rp_apellido,
          cuit_cuil,
          documento,
          dni,
          origen: rp_origen,
          origen_credencial: rp_origen_credencial,
          canal_pago,
          email,
          telefono,
          direccion_calle_y_numero,
          direccion_localidad,
          direccion_codigo_postal,
          direccion_provincia,
          direccion_legacy,
          updated_at: rp_updated_at,
        }
      : null,
  };
}

/**
 * Busca mascotas del padrón OSPAN por documento del tutor (columna
 * `documento` o `dni` de related_person -- Pegasus tampoco distingue, y en
 * el padrón puede estar cargado en cualquiera de las dos). Igual que en
 * Pegasus, un documento puede traer más de un tutor/mascota: se devuelven
 * todos los matches, sin asumir que el primero es el correcto.
 */
export async function buscarPacientesPorDocumentoTutor(
  documento: string
): Promise<PadronPacienteConTutor[]> {
  const { rows } = await getPool().query(
    `${SELECT_PACIENTE_CON_TUTOR}
     where rp.documento = $1 or rp.dni = $1
     order by p.updated_at desc`,
    [documento]
  );
  return rows.map(mapRow);
}

/**
 * Busca una mascota del padrón por su identificador OSPAN.
 * SUPUESTO A CONFIRMAR: identificador_ospan == id_hub de Pegasus (ver nota
 * en padronTypes.ts).
 */
export async function buscarPacientePorIdentificadorOspan(
  identificadorOspan: string
): Promise<PadronPacienteConTutor | null> {
  const { rows } = await getPool().query(
    `${SELECT_PACIENTE_CON_TUTOR} where p.identificador_ospan = $1 limit 1`,
    [identificadorOspan]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Búsqueda libre por nombre de la mascota (ILIKE), para el buscador del back office. */
export async function buscarPacientesPorNombre(
  nombre: string
): Promise<PadronPacienteConTutor[]> {
  const { rows } = await getPool().query(
    `${SELECT_PACIENTE_CON_TUTOR}
     where p.nombre ilike $1 or p.legacy_nombre ilike $1
     order by p.updated_at desc
     limit 50`,
    [`%${nombre}%`]
  );
  return rows.map(mapRow);
}
