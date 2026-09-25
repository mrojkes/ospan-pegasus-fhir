/* =========================================================
   PERSISTENCIA DE TRÁMITES
   -----------------------------------------------------------
   Todo en el schema `app_asociado` (ver db/006-tramites.sql).
   El padrón no se toca: es de solo lectura para este backend, así
   que un "cambio de datos de la mascota" queda como trámite y lo
   aplica OSPAN en su sistema, no la app.
   ========================================================= */

import { getPool } from "../deps";
import type { QuestionnaireResponse } from "../../fhir/types/questionnaire";
import type { AdjuntoEntrante } from "./respuesta";

export type EstadoTramite =
  | "abierto"
  | "en_proceso"
  | "falta_documentacion"
  | "resuelto"
  | "rechazado"
  | "anulado";

export const ESTADOS_ABIERTOS: EstadoTramite[] = ["abierto", "en_proceso", "falta_documentacion"];

export interface TramiteRow {
  id: number;
  nro: string;
  tipo: string;
  titulo: string;
  questionnaire: string;
  respuesta: QuestionnaireResponse;
  related_person_id: string;
  patient_id: string | null;
  id_hub: string | null;
  mascota_nombre: string | null;
  estado: EstadoTramite;
  resolucion: string | null;
  resuelto_en: Date | null;
  resuelto_por: string | null;
  creado_en: Date;
  actualizado_en: Date;
}

export interface AdjuntoRow {
  id: number;
  link_id: string;
  etiqueta: string | null;
  nombre: string;
  content_type: string;
  bytes: number;
  origen: string;
  creado_en: Date;
}

export interface EventoRow {
  estado: string;
  detalle: string | null;
  autor: string;
  creado_en: Date;
}

/**
 * Número de expediente: TR-<año>-<6 dígitos> desde una secuencia.
 *
 * No se usa `count(*) + 1` (como los códigos del MVP) porque dos
 * trámites creados en el mismo instante sacarían el mismo número y
 * uno fallaría contra el índice único.
 */
async function proximoNumero(cliente: { query: Function }): Promise<string> {
  const { rows } = await cliente.query("select nextval('app_asociado.tramite_nro_seq') as n");
  const n = String(rows[0].n).padStart(6, "0");
  return `TR-${new Date().getFullYear()}-${n}`;
}

export interface NuevoTramite {
  tipo: string;
  titulo: string;
  questionnaire: string;
  respuesta: QuestionnaireResponse;
  relatedPersonId: string;
  patientId: string | null;
  idHub: string | null;
  mascotaNombre: string | null;
  adjuntos: AdjuntoEntrante[];
}

/**
 * El trámite, sus adjuntos y el primer evento entran juntos o no
 * entra nada: un expediente sin la documentación que lo respalda no
 * se puede resolver.
 */
export async function crearTramite(d: NuevoTramite): Promise<TramiteRow> {
  const cliente = await getPool().connect();
  try {
    await cliente.query("begin");
    const nro = await proximoNumero(cliente);

    const { rows } = await cliente.query(
      `insert into app_asociado.tramite
         (nro, tipo, titulo, questionnaire, respuesta, related_person_id,
          patient_id, id_hub, mascota_nombre)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [nro, d.tipo, d.titulo, d.questionnaire, JSON.stringify(d.respuesta), d.relatedPersonId,
       d.patientId, d.idHub, d.mascotaNombre]
    );
    const tramite = rows[0] as TramiteRow;

    for (const a of d.adjuntos) {
      await cliente.query(
        `insert into app_asociado.tramite_adjunto
           (tramite_id, link_id, etiqueta, nombre, content_type, bytes, contenido, origen)
         values ($1,$2,$3,$4,$5,$6,$7,'afiliado')`,
        [tramite.id, a.linkId, a.etiqueta, a.nombre, a.contentType, a.contenido.length, a.contenido]
      );
    }

    await cliente.query(
      `insert into app_asociado.tramite_evento (tramite_id, estado, detalle, autor)
       values ($1, 'abierto', 'Trámite iniciado desde la app', 'afiliado')`,
      [tramite.id]
    );

    await cliente.query("commit");
    return tramite;
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

export async function listarTramites(
  relatedPersonId: string,
  filtros: { estado?: "abiertos" | "cerrados"; idHub?: string } = {}
): Promise<TramiteRow[]> {
  const cond: string[] = ["related_person_id = $1"];
  const args: unknown[] = [relatedPersonId];

  if (filtros.estado === "abiertos") cond.push(`estado = any($${args.push(ESTADOS_ABIERTOS)})`);
  if (filtros.estado === "cerrados") cond.push(`not (estado = any($${args.push(ESTADOS_ABIERTOS)}))`);
  if (filtros.idHub) cond.push(`id_hub = $${args.push(filtros.idHub)}`);

  const { rows } = await getPool().query(
    `select * from app_asociado.tramite
      where ${cond.join(" and ")}
      order by creado_en desc
      limit 200`,
    args
  );
  return rows;
}

export async function obtenerTramite(nro: string, relatedPersonId?: string): Promise<TramiteRow | null> {
  const args: unknown[] = [nro];
  const filtroTutor = relatedPersonId ? ` and related_person_id = $${args.push(relatedPersonId)}` : "";
  const { rows } = await getPool().query(
    `select * from app_asociado.tramite where nro = $1${filtroTutor} limit 1`,
    args
  );
  return rows[0] ?? null;
}

export async function adjuntosDe(tramiteId: number): Promise<AdjuntoRow[]> {
  const { rows } = await getPool().query(
    `select id, link_id, etiqueta, nombre, content_type, bytes, origen, creado_en
       from app_asociado.tramite_adjunto
      where tramite_id = $1
      order by id`,
    [tramiteId]
  );
  return rows;
}

/** El binario, solo para el dueño del trámite (o el back office). */
export async function contenidoAdjunto(
  adjuntoId: number,
  relatedPersonId?: string
): Promise<{ nombre: string; content_type: string; contenido: Buffer } | null> {
  const args: unknown[] = [adjuntoId];
  const filtro = relatedPersonId ? ` and t.related_person_id = $${args.push(relatedPersonId)}` : "";
  const { rows } = await getPool().query(
    `select a.nombre, a.content_type, a.contenido
       from app_asociado.tramite_adjunto a
       join app_asociado.tramite t on t.id = a.tramite_id
      where a.id = $1${filtro}
      limit 1`,
    args
  );
  return rows[0] ?? null;
}

export async function eventosDe(tramiteId: number, soloVisibles = true): Promise<EventoRow[]> {
  const { rows } = await getPool().query(
    `select estado, detalle, autor, creado_en
       from app_asociado.tramite_evento
      where tramite_id = $1 ${soloVisibles ? "and visible = true" : ""}
      order by creado_en, id`,
    [tramiteId]
  );
  return rows;
}

/** Cuántos trámites sin cerrar tiene el tutor de un tipo dado. */
export async function abiertosDelTipo(
  relatedPersonId: string,
  tipo: string,
  idHub: string | null
): Promise<number> {
  const args: unknown[] = [relatedPersonId, tipo, ESTADOS_ABIERTOS];
  const porMascota = idHub ? ` and id_hub = $${args.push(idHub)}` : "";
  const { rows } = await getPool().query(
    `select count(*)::int as n from app_asociado.tramite
      where related_person_id = $1 and tipo = $2 and estado = any($3)${porMascota}`,
    args
  );
  return rows[0].n;
}

/* ---------------------------------------------------------
   Movimientos
   --------------------------------------------------------- */

export interface CambioEstado {
  nro: string;
  estado: EstadoTramite;
  detalle?: string | null;
  autor?: string;
  visible?: boolean;
  /** Texto de cierre que ve el afiliado. */
  resolucion?: string | null;
  resueltoPor?: string | null;
}

const CIERRAN: EstadoTramite[] = ["resuelto", "rechazado", "anulado"];

export async function cambiarEstado(c: CambioEstado): Promise<TramiteRow | null> {
  const cliente = await getPool().connect();
  try {
    await cliente.query("begin");
    const cierra = CIERRAN.includes(c.estado);
    const { rows } = await cliente.query(
      `update app_asociado.tramite
          set estado = $2,
              resolucion = coalesce($3, resolucion),
              resuelto_en = case when $4 then now() else null end,
              resuelto_por = case when $4 then $5 else null end,
              actualizado_en = now()
        where nro = $1
        returning *`,
      [c.nro, c.estado, c.resolucion ?? null, cierra, c.resueltoPor ?? null]
    );
    if (!rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    await cliente.query(
      `insert into app_asociado.tramite_evento (tramite_id, estado, detalle, autor, visible)
       values ($1,$2,$3,$4,$5)`,
      [rows[0].id, c.estado, c.detalle ?? c.resolucion ?? null, c.autor ?? "ospan", c.visible !== false]
    );
    await cliente.query("commit");
    return rows[0];
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

/** Documentación que el afiliado agrega a un trámite ya abierto. */
export async function agregarAdjuntos(
  tramiteId: number,
  adjuntos: AdjuntoEntrante[],
  detalle: string | null
): Promise<void> {
  const cliente = await getPool().connect();
  try {
    await cliente.query("begin");
    for (const a of adjuntos) {
      await cliente.query(
        `insert into app_asociado.tramite_adjunto
           (tramite_id, link_id, etiqueta, nombre, content_type, bytes, contenido, origen)
         values ($1,$2,$3,$4,$5,$6,$7,'afiliado')`,
        [tramiteId, a.linkId, a.etiqueta, a.nombre, a.contentType, a.contenido.length, a.contenido]
      );
    }
    // Si estaba esperando documentación, con esto vuelve a la cola.
    await cliente.query(
      `update app_asociado.tramite
          set estado = case when estado = 'falta_documentacion' then 'en_proceso' else estado end,
              actualizado_en = now()
        where id = $1`,
      [tramiteId]
    );
    await cliente.query(
      `insert into app_asociado.tramite_evento (tramite_id, estado, detalle, autor)
       values ($1, 'documentacion', $2, 'afiliado')`,
      [tramiteId, detalle ?? `Se adjuntó documentación (${adjuntos.length})`]
    );
    await cliente.query("commit");
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

/* ---------------------------------------------------------
   Back office
   --------------------------------------------------------- */

export async function listarParaBackOffice(filtros: {
  estado?: string;
  tipo?: string;
  limite?: number;
}): Promise<TramiteRow[]> {
  const cond: string[] = ["1=1"];
  const args: unknown[] = [];
  if (filtros.estado === "abiertos") cond.push(`estado = any($${args.push(ESTADOS_ABIERTOS)})`);
  else if (filtros.estado) cond.push(`estado = $${args.push(filtros.estado)}`);
  if (filtros.tipo) cond.push(`tipo = $${args.push(filtros.tipo)}`);

  const { rows } = await getPool().query(
    `select * from app_asociado.tramite
      where ${cond.join(" and ")}
      order by creado_en desc
      limit $${args.push(Math.min(Number(filtros.limite) || 100, 500))}`,
    args
  );
  return rows;
}
