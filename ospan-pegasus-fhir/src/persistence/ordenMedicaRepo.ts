import { getPool } from "./db";
import type { PegasusOrdenMedica } from "../adapters/pegasus/pegasusTypes";
import type { Bundle } from "../fhir/types/r4";
import { mapOrdenToBundle } from "../fhir/mappers/bundle";

const SOURCE_SYSTEM = "pegasus-panda";

export interface UpsertResult {
  inserted: boolean;
  version: number;
  cambioDeEstado: boolean;
}

/**
 * Inserta una version NUEVA del snapshot de la orden SOLO si cambio algo
 * relevante desde la ultima version que tenemos guardada (hoy: el
 * IdEstado -- es lo que pide el punto 2.4, "versionado por estado"). Si no
 * hay cambio, no inserta nada (evita historial ruidoso con una fila por
 * cada sync aunque no haya pasado nada).
 *
 * Es append-only: nunca hace UPDATE de una version ya guardada.
 */
export async function upsertVersionSiCambio(
  orden: PegasusOrdenMedica,
  bundle: Bundle
): Promise<UpsertResult> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: last } = await client.query(
      `select version, id_estado
       from fhir_repo.orden_medica_snapshot
       where source_system = $1 and id_orden_medica = $2
       order by version desc
       limit 1
       for update`,
      [SOURCE_SYSTEM, orden.IdOrdenMedica]
    );

    const ultimaVersion = last[0]?.version ?? 0;
    const ultimoEstado = last[0]?.id_estado ?? null;
    const cambioDeEstado = ultimoEstado !== orden.IdEstado;

    if (last.length > 0 && !cambioDeEstado) {
      await client.query("COMMIT");
      return { inserted: false, version: ultimaVersion, cambioDeEstado: false };
    }

    const nuevaVersion = ultimaVersion + 1;

    await client.query(
      `insert into fhir_repo.orden_medica_snapshot (
         source_system, id_orden_medica, version, id_hub, id_paciente,
         paciente_nombre, id_tutor, tutor_documento, id_estado, estado_nombre,
         id_medico, medico_nombre, id_servicio, servicio_nombre,
         id_cobertura, cobertura_nombre, fecha_orden, fecha_resultados,
         fhir_bundle, raw_pegasus
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20
       )`,
      [
        SOURCE_SYSTEM,
        orden.IdOrdenMedica,
        nuevaVersion,
        orden.IdHub,
        orden.IdPaciente,
        orden.PacienteNombre ?? null,
        orden.IdTutor ?? null,
        orden.TutorDocumento != null ? String(orden.TutorDocumento) : null,
        orden.IdEstado,
        orden.EstadoNombre,
        orden.IdMedico ?? null,
        orden.MedicoNombre ?? null,
        orden.IdServicio ?? null,
        orden.ServicioNombre ?? null,
        orden.IdCobertura ?? null,
        orden.CoberturaNombre ?? null,
        orden.Fecha ?? null,
        orden.FechaResultados ?? null,
        JSON.stringify(bundle),
        JSON.stringify(orden),
      ]
    );

    await client.query("COMMIT");
    return { inserted: true, version: nuevaVersion, cambioDeEstado };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface FilaParaReprocesar {
  source_system: string;
  id_orden_medica: number;
  version: number;
  raw_pegasus: PegasusOrdenMedica;
  fhir_bundle: Bundle;
}

/**
 * JSON.stringify "canonico": ordena las claves de cada objeto de forma
 * recursiva. Postgres (columna `jsonb`) NO conserva el orden original de
 * las claves de un objeto al guardarlo -- así que comparar por texto un
 * Bundle recien calculado en JS contra uno que volvio de la base con un
 * JSON.stringify comun casi siempre da "distinto" aunque el contenido sea
 * identico. Los arrays si conservan su orden (son semanticamente
 * distintos si cambia el orden), por eso solo se ordenan los objetos.
 */
function stringifyCanonico(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v !== null && typeof v === "object") {
      const claves = Object.keys(v as Record<string, unknown>).sort();
      const objetoOrdenado: Record<string, unknown> = {};
      for (const clave of claves) {
        objetoOrdenado[clave] = ordenar((v as Record<string, unknown>)[clave]);
      }
      return objetoOrdenado;
    }
    return v;
  };
  return JSON.stringify(ordenar(valor));
}

/**
 * Recalcula el `fhir_bundle` guardado de la version ACTUAL de cada orden,
 * a partir del `raw_pegasus` que ya tenemos persistido (ese no se toca).
 *
 * Es la UNICA excepcion al principio de este archivo de "nunca UPDATE,
 * siempre INSERT una version nueva": el `fhir_bundle` es un dato
 * DERIVADO -- se recalcula 100% a partir de `raw_pegasus` con el mapper
 * FHIR actual (src/fhir/mappers/*), no representa un cambio de estado
 * clinico de la orden. Corregir un bug en como se lo calculaba (por
 * ejemplo, el fix de "&nbsp;" en observation.ts) no es una version nueva
 * de la orden -- por eso esto hace UPDATE en vez de INSERT, y no toca ni
 * `version` ni `id_estado` ni el historial (listHistorialPorOrden sigue
 * mostrando las mismas versiones que antes).
 *
 * Hace falta correr esto (via `npm run reprocesar-bundles`) despues de
 * cada cambio en un mapper de FHIR: las ordenes que ya estaban
 * sincronizadas y NO cambiaron de IdEstado desde entonces nunca vuelven a
 * pasar por el mapper en un sync normal (ver upsertVersionSiCambio de
 * arriba) y se quedan con el bundle calculado con el mapper viejo.
 */
export async function reprocesarBundles(): Promise<{
  revisadas: number;
  actualizadas: number;
}> {
  const pool = getPool();
  const { rows } = await pool.query<FilaParaReprocesar>(
    `select source_system, id_orden_medica, version, raw_pegasus, fhir_bundle
     from fhir_repo.orden_medica_actual`
  );

  let actualizadas = 0;
  for (const fila of rows) {
    const bundleNuevo = mapOrdenToBundle(fila.raw_pegasus);

    // El Bundle lleva un `timestamp` (momento en que se calculo) que
    // cambia siempre, aunque el contenido clinico sea identico -- hay que
    // ignorarlo al comparar, si no esto nunca seria idempotente y
    // marcaria "actualizada" cada orden en cada corrida.
    const sinTimestamp = ({ timestamp: _timestamp, ...resto }: Bundle) => resto;
    if (
      stringifyCanonico(sinTimestamp(bundleNuevo)) ===
      stringifyCanonico(sinTimestamp(fila.fhir_bundle))
    ) {
      continue;
    }

    await pool.query(
      `update fhir_repo.orden_medica_snapshot
       set fhir_bundle = $1
       where source_system = $2 and id_orden_medica = $3 and version = $4`,
      [JSON.stringify(bundleNuevo), fila.source_system, fila.id_orden_medica, fila.version]
    );
    actualizadas++;
  }

  return { revisadas: rows.length, actualizadas };
}

export interface OrdenMedicaActualRow {
  id_orden_medica: number;
  version: number;
  id_hub: string | null;
  id_paciente: number | null;
  paciente_nombre: string | null;
  id_tutor: number | null;
  tutor_documento: string | null;
  id_estado: number;
  estado_nombre: string;
  medico_nombre: string | null;
  servicio_nombre: string | null;
  cobertura_nombre: string | null;
  fecha_orden: string | null;
  fecha_resultados: string | null;
  fhir_bundle: Bundle;
  /** JSON crudo de Pegasus tal cual vino, guardado en cada version. Fuente
   * para campos que no se mapearon a FHIR (Diagnostico, EvoOrdenMedica,
   * EvoOrdenMedicaResultados) y para los datos de mascota/tutor del
   * encabezado de la ficha de estudios (PacienteFechaNac, EspecieNombre,
   * RazaNombre, TutorNombre, TutorDocumento). */
  raw_pegasus: PegasusOrdenMedica;
  synced_at: string;
}

async function listActual(
  where: string,
  params: unknown[]
): Promise<OrdenMedicaActualRow[]> {
  const { rows } = await getPool().query(
    `select id_orden_medica, version, id_hub, id_paciente, paciente_nombre,
            id_tutor, tutor_documento, id_estado, estado_nombre,
            medico_nombre, servicio_nombre, cobertura_nombre, fecha_orden,
            fecha_resultados, fhir_bundle, raw_pegasus, synced_at
     from fhir_repo.orden_medica_actual
     where ${where}
     order by fecha_orden desc nulls last`,
    params
  );
  return rows;
}

export const listActualPorIdHub = (idHub: string) =>
  listActual("id_hub = $1", [idHub]);

export const listActualPorIdPaciente = (idPaciente: number | string) =>
  listActual("id_paciente = $1", [idPaciente]);

export const listActualPorTutorDocumento = (documento: string) =>
  listActual("tutor_documento = $1", [documento]);

/** Historial completo (todas las versiones) de una orden puntual. */
export async function listHistorialPorOrden(idOrdenMedica: number | string) {
  const { rows } = await getPool().query(
    `select version, id_estado, estado_nombre, fecha_orden, fecha_resultados,
            synced_at, fhir_bundle
     from fhir_repo.orden_medica_snapshot
     where source_system = $1 and id_orden_medica = $2
     order by version asc`,
    [SOURCE_SYSTEM, idOrdenMedica]
  );
  return rows;
}

/** ¿Hay algo sincronizado para este id_hub? Sirve para decidir si mostrar
 * solo lo local (2.3, "si el sync está al día") o ir a buscar en vivo. */
export async function tieneDatosLocalesIdHub(idHub: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `select 1 from fhir_repo.orden_medica_actual where id_hub = $1 limit 1`,
    [idHub]
  );
  return rows.length > 0;
}

/** Igual que tieneDatosLocalesIdHub pero para mascotas que no son de OSPAN
 * (no tienen id_hub) y solo se identifican por IdPaciente de Pegasus. */
export async function tieneDatosLocalesIdPaciente(
  idPaciente: number | string
): Promise<boolean> {
  const { rows } = await getPool().query(
    `select 1 from fhir_repo.orden_medica_actual where id_paciente = $1 limit 1`,
    [idPaciente]
  );
  return rows.length > 0;
}

// ---- Reportes (2.6) ----

export async function reportePorEstado(desde?: string, hasta?: string) {
  const { rows } = await getPool().query(
    `select estado_nombre, id_estado, count(*)::int as cantidad
     from fhir_repo.orden_medica_actual
     where ($1::date is null or fecha_orden >= $1::date)
       and ($2::date is null or fecha_orden < ($2::date + interval '1 day'))
     group by estado_nombre, id_estado
     order by cantidad desc`,
    [desde ?? null, hasta ?? null]
  );
  return rows;
}

export async function reportePorProfesional(desde?: string, hasta?: string) {
  const { rows } = await getPool().query(
    `select medico_nombre,
            count(*)::int as cantidad_ordenes,
            count(*) filter (where id_estado in (3, 5))::int as cantidad_realizadas
     from fhir_repo.orden_medica_actual
     where ($1::date is null or fecha_orden >= $1::date)
       and ($2::date is null or fecha_orden < ($2::date + interval '1 day'))
     group by medico_nombre
     order by cantidad_ordenes desc`,
    [desde ?? null, hasta ?? null]
  );
  return rows;
}

export interface OrdenResumenPorProfesional {
  id_orden_medica: number;
  fecha_orden: string | null;
  paciente_nombre: string | null;
  tutor_nombre: string | null;
  tutor_documento: string | null;
  servicio_nombre: string | null;
  id_estado: number;
  estado_nombre: string;
}

/**
 * Detalle (2.6, "ver") de las órdenes de un profesional solicitante en
 * particular -- lo que dispara el link "Ver" del reporte "Por profesional
 * solicitante". `medicoNombre = null` trae las órdenes SIN solicitante
 * (fila "(sin solicitante)" del reporte); `IS NOT DISTINCT FROM` en vez de
 * `=` es lo que hace que ese caso funcione (NULL = NULL nunca es true en
 * SQL comun). `tutor_nombre` no es una columna propia -- Pegasus no la
 * persiste aparte, se lee del `raw_pegasus` guardado con cada orden.
 */
export async function listOrdenesPorProfesional(
  medicoNombre: string | null,
  desde?: string,
  hasta?: string
): Promise<OrdenResumenPorProfesional[]> {
  const { rows } = await getPool().query(
    `select id_orden_medica, fecha_orden, paciente_nombre, tutor_documento,
            raw_pegasus->>'TutorNombre' as tutor_nombre,
            servicio_nombre, id_estado, estado_nombre
     from fhir_repo.orden_medica_actual
     where medico_nombre is not distinct from $1
       and ($2::date is null or fecha_orden >= $2::date)
       and ($3::date is null or fecha_orden < ($3::date + interval '1 day'))
     order by fecha_orden desc nulls last`,
    [medicoNombre, desde ?? null, hasta ?? null]
  );
  return rows;
}

// ---- Log de sincronizaciones ----

export async function iniciarSyncRun(
  tipo: string,
  parametros: Record<string, unknown>
): Promise<number> {
  const { rows } = await getPool().query(
    `insert into fhir_repo.sync_run (tipo, parametros) values ($1, $2) returning id`,
    [tipo, JSON.stringify(parametros)]
  );
  return rows[0].id;
}

export async function finalizarSyncRun(
  id: number,
  data: {
    cantidadOrdenesPegasus: number;
    cantidadVersionesNuevas: number;
    estado: "ok" | "error";
    error?: string;
  }
): Promise<void> {
  await getPool().query(
    `update fhir_repo.sync_run
     set finalizado_at = now(), cantidad_ordenes_pegasus = $2,
         cantidad_versiones_nuevas = $3, estado = $4, error = $5
     where id = $1`,
    [
      id,
      data.cantidadOrdenesPegasus,
      data.cantidadVersionesNuevas,
      data.estado,
      data.error ?? null,
    ]
  );
}

export async function ultimoSyncPorFechaOk(fecha: string) {
  const { rows } = await getPool().query(
    `select id, iniciado_at, finalizado_at, cantidad_ordenes_pegasus, cantidad_versiones_nuevas
     from fhir_repo.sync_run
     where tipo = 'por_fecha' and estado = 'ok'
       and parametros->>'desde' = $1
     order by iniciado_at desc
     limit 1`,
    [fecha]
  );
  return rows[0] ?? null;
}

export async function historialSyncRuns(limit = 20) {
  const { rows } = await getPool().query(
    `select id, tipo, parametros, iniciado_at, finalizado_at,
            cantidad_ordenes_pegasus, cantidad_versiones_nuevas, estado, error
     from fhir_repo.sync_run
     order by iniciado_at desc
     limit $1`,
    [limit]
  );
  return rows;
}
