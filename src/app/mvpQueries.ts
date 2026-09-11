/* =========================================================
   CONSULTAS DE LAS FUNCIONALIDADES DEL MVP
   Todo sobre el schema `app_asociado`. `padron` solo se lee, y
   nunca desde acá (eso vive en deps.ts).

   PUNTOS DE REEMPLAZO cuando OSPAN confirme la estructura de los
   otros schemas de la RDS:
   - `copagosDePlan`  -> schema `financial` (carencias/precios).
   - `listarCartilla` -> schema `vet` (gestión de prestadores).
   Son dos funciones: cambiando el SQL adentro, ninguna pantalla
   ni ruta se entera.
   ========================================================= */

import crypto from "crypto";
import { getPool } from "./deps";

/** Código legible para el afiliado: AUT-2026-0007, REI-2026-0003, TUR-… */
export async function proximoCodigo(prefijo: string, tabla: string): Promise<string> {
  const anio = new Date().getFullYear();
  const { rows } = await getPool().query(
    `select count(*)::int + 1 as n from app_asociado.${tabla}
      where extract(year from creada_en) = $1`,
    [anio]
  );
  return `${prefijo}-${anio}-${String(rows[0].n).padStart(4, "0")}`;
}

/* ---------------- autorizaciones ---------------- */

export interface NuevaAutorizacion {
  relatedPersonId: string;
  patientId: string;
  idHub: string;
  mascotaNombre: string | null;
  tipoPrestacion: string;
  prestadorId: number | null;
  prestadorNombre: string | null;
  diagnostico: string | null;
  diagnosticoCodigo: string | null;
  observaciones: string | null;
}

export async function crearAutorizacion(d: NuevaAutorizacion) {
  const codigo = await proximoCodigo("AUT", "solicitud_autorizacion");
  const { rows } = await getPool().query(
    `insert into app_asociado.solicitud_autorizacion
       (codigo, related_person_id, patient_id, id_hub, mascota_nombre, tipo_prestacion,
        prestador_id, prestador_nombre, diagnostico, diagnostico_codigo, observaciones)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [codigo, d.relatedPersonId, d.patientId, d.idHub, d.mascotaNombre, d.tipoPrestacion,
     d.prestadorId, d.prestadorNombre, d.diagnostico, d.diagnosticoCodigo, d.observaciones]
  );
  return rows[0];
}

export async function listarAutorizaciones(relatedPersonId: string) {
  const { rows } = await getPool().query(
    `select * from app_asociado.solicitud_autorizacion
      where related_person_id = $1 order by creada_en desc limit 100`,
    [relatedPersonId]
  );
  return rows;
}

/* ---------------- turnos ---------------- */

export interface NuevoTurno {
  relatedPersonId: string;
  patientId: string;
  idHub: string;
  mascotaNombre: string | null;
  prestadorId: number | null;
  prestadorNombre: string | null;
  motivo: string;
  fecha: string;
  hora: string;
}

export async function crearTurno(d: NuevoTurno) {
  const codigo = await proximoCodigo("TUR", "turno");
  const { rows } = await getPool().query(
    `insert into app_asociado.turno
       (codigo, related_person_id, patient_id, id_hub, mascota_nombre,
        prestador_id, prestador_nombre, motivo, fecha, hora)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [codigo, d.relatedPersonId, d.patientId, d.idHub, d.mascotaNombre,
     d.prestadorId, d.prestadorNombre, d.motivo, d.fecha, d.hora]
  );
  return rows[0];
}

export async function listarTurnos(relatedPersonId: string) {
  const { rows } = await getPool().query(
    `select * from app_asociado.turno
      where related_person_id = $1
      order by (estado in ('solicitado','confirmado')) desc, fecha desc, hora desc
      limit 100`,
    [relatedPersonId]
  );
  return rows;
}

/**
 * Franjas que la app ofrece para pedir turno. Fijas por ahora: no hay
 * agenda real de las veterinarias. Se excluyen las franjas que este
 * prestador ya tiene pedidas o confirmadas ese día, para no mostrar
 * como disponible algo que ya se pidió.
 */
export async function franjasDisponibles(prestadorId: number, fecha: string): Promise<string[]> {
  const TODAS = ["09:00", "10:30", "11:00", "14:00", "15:30", "17:00"];
  const { rows } = await getPool().query(
    `select to_char(hora, 'HH24:MI') as hora from app_asociado.turno
      where prestador_id = $1 and fecha = $2 and estado in ('solicitado','confirmado')`,
    [prestadorId, fecha]
  );
  const ocupadas = new Set(rows.map((r: any) => r.hora));
  return TODAS.filter((h) => !ocupadas.has(h));
}

/* ---------------- reintegros ---------------- */

export interface NuevoReintegro {
  relatedPersonId: string;
  patientId: string;
  idHub: string;
  mascotaNombre: string | null;
  tipoPrestacion: string;
  descripcion: string | null;
  monto: number;
  fechaPrestacion: string;
  adjuntos: Array<{ nombre: string; contentType: string; contenido: Buffer }>;
}

export async function crearReintegro(d: NuevoReintegro) {
  const pool = getPool();
  const cliente = await pool.connect();
  try {
    // El reintegro y sus comprobantes entran juntos o no entra ninguno:
    // un reintegro sin comprobante no sirve para liquidar.
    await cliente.query("begin");
    const codigo = await proximoCodigo("REI", "reintegro");
    const { rows } = await cliente.query(
      `insert into app_asociado.reintegro
         (codigo, related_person_id, patient_id, id_hub, mascota_nombre,
          tipo_prestacion, descripcion, monto, fecha_prestacion)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [codigo, d.relatedPersonId, d.patientId, d.idHub, d.mascotaNombre,
       d.tipoPrestacion, d.descripcion, d.monto, d.fechaPrestacion]
    );
    const reintegro = rows[0];
    for (const a of d.adjuntos) {
      await cliente.query(
        `insert into app_asociado.reintegro_adjunto
           (reintegro_id, nombre, content_type, bytes, contenido)
         values ($1,$2,$3,$4,$5)`,
        [reintegro.id, a.nombre, a.contentType, a.contenido.length, a.contenido]
      );
    }
    await cliente.query("commit");
    return reintegro;
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

export async function listarReintegros(relatedPersonId: string) {
  const { rows } = await getPool().query(
    `select r.*,
            coalesce(
              (select json_agg(json_build_object('id', a.id, 'nombre', a.nombre,
                                                 'contentType', a.content_type, 'bytes', a.bytes)
                               order by a.id)
                 from app_asociado.reintegro_adjunto a where a.reintegro_id = r.id),
              '[]'::json) as adjuntos
       from app_asociado.reintegro r
      where r.related_person_id = $1
      order by r.creada_en desc limit 100`,
    [relatedPersonId]
  );
  return rows;
}

/** Comprobante, validando que el reintegro sea del tutor de la sesión. */
export async function adjuntoDeReintegro(adjuntoId: number, relatedPersonId: string) {
  const { rows } = await getPool().query(
    `select a.nombre, a.content_type, a.contenido
       from app_asociado.reintegro_adjunto a
       join app_asociado.reintegro r on r.id = a.reintegro_id
      where a.id = $1 and r.related_person_id = $2`,
    [adjuntoId, relatedPersonId]
  );
  return rows[0] || null;
}

/* ---------------- DDJJ ---------------- */

export async function ddjjActual(idHub: string) {
  const { rows } = await getPool().query(
    `select * from app_asociado.ddjj_actual where id_hub = $1`,
    [idHub]
  );
  return rows[0] || null;
}

export async function guardarDdjj(d: {
  relatedPersonId: string;
  patientId: string;
  idHub: string;
  questionnaireResponse: unknown;
  questionnaireUrl: string;
  questionnaireVersion: string;
}) {
  // Versión nueva, nunca UPDATE: una declaración jurada es un hecho
  // fechado, y saber qué se declaró y cuándo puede importar después.
  const { rows } = await getPool().query(
    `insert into app_asociado.ddjj
       (related_person_id, patient_id, id_hub,
        questionnaire_response, questionnaire_url, questionnaire_version)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      d.relatedPersonId, d.patientId, d.idHub,
      JSON.stringify(d.questionnaireResponse), d.questionnaireUrl, d.questionnaireVersion,
    ]
  );
  return rows[0];
}

/* ---------------- copagos ---------------- */

/** PUNTO DE REEMPLAZO: schema `financial` cuando esté confirmado. */
export async function copagosDePlan(plan: string | null) {
  const { rows } = await getPool().query(
    `select categoria, copago, cobertura
       from app_asociado.copago
      where activo and (plan = $1 or plan = '*')
      order by orden, categoria`,
    [plan || ""]
  );
  return rows;
}

/* ---------------- cartilla ---------------- */

/** PUNTO DE REEMPLAZO: schema `vet` cuando esté confirmado. */
export async function listarCartilla(zona?: string | null) {
  const { rows } = await getPool().query(
    `select id, nombre, categoria, zona, direccion, telefono, horario_texto,
            abierto, especialidades, copago, puntaje, opiniones, acepta_turnos
       from app_asociado.prestador
      where activo and ($1::text is null or zona ilike '%' || $1 || '%')
      order by puntaje desc nulls last, nombre`,
    [zona || null]
  );
  return rows;
}

export async function prestadorPorId(id: number) {
  const { rows } = await getPool().query(
    `select * from app_asociado.prestador where id = $1 and activo`,
    [id]
  );
  return rows[0] || null;
}

/* ---------------- comunidad ---------------- */

export async function listarComunidad(tipo?: string | null) {
  const { rows } = await getPool().query(
    `select id, tipo, nombre, zona, precio, telefono, whatsapp, puntaje, opiniones, verificado, emoji
       from app_asociado.comunidad_prestador
      where activo and ($1::text is null or tipo = $1)
      order by verificado desc, puntaje desc nulls last, nombre`,
    [tipo || null]
  );
  return rows;
}

/* ---------------- recordatorios ---------------- */

export async function recordatoriosDeMascotas(idHubs: string[]) {
  if (!idHubs.length) return [];
  const { rows } = await getPool().query(
    `select id_hub, titulo, detalle, fecha, tipo
       from app_asociado.recordatorio
      where id_hub = any($1) and not cumplido
      order by fecha limit 20`,
    [idHubs]
  );
  return rows;
}

/** Id corto y no adivinable, por si en algún momento se comparte una solicitud. */
export function idOpaco(): string {
  return crypto.randomBytes(9).toString("base64url");
}
