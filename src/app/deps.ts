/* =========================================================
   PUNTO ÚNICO DE ACOPLE CON EL CONECTOR
   -----------------------------------------------------------
   Todo lo que la App Asociado usa del backend del conector se
   importa ACÁ y en ningún otro archivo de src/app/. Si mañana
   cambia una firma del conector, se ajusta en este archivo solo.

   Se reusan tal cual las consultas de `padronQueries.ts` en vez
   de escribir SQL nuevo contra `padron`: ya resuelven el join
   con el tutor, el match por `documento` O `dni`, y el cálculo
   del `id_hub` ('pet_' || left(replace(id,'-',''),15)), que NO
   es `identificador_ospan`.
   ========================================================= */

import { getPool } from "../persistence/db";
import {
  buscarPacientesPorDocumentoTutor,
  buscarPacientePorIdHub,
} from "../adapters/padron/padronQueries";
import type { PadronPacienteConTutor } from "../adapters/padron/padronTypes";
import { obtenerEstudiosPaciente, obtenerOrdenPorId } from "../services/estudios";
import type { OrdenMedicaActualRow } from "../persistence/ordenMedicaRepo";

export { getPool, obtenerEstudiosPaciente, obtenerOrdenPorId };
export type { PadronPacienteConTutor, OrdenMedicaActualRow };

/** El tutor tal como lo necesita el login (subconjunto de related_person). */
export interface TutorRow {
  related_person_id: string;
  documento: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
}

/**
 * El id del padrón SIEMPRE se maneja como string.
 *
 * No controlamos el tipo de clave del padrón: uuid, entero o código.
 * Según el tipo, node-postgres devuelve string (uuid, bigint) o number
 * (integer), y una comparación `===` entre 1 y "1" da false sin avisar
 * — por ejemplo al filtrar las mascotas de un tutor, que devolvería la
 * lista vacía. Normalizar acá evita todo eso.
 */
function idPadron(v: unknown): string {
  return String(v ?? "");
}

/** Primer valor que parezca un número de documento. */
function primerDocumento(...valores: Array<unknown>): string {
  for (const v of valores) {
    const s = String(v ?? "").replace(/\D/g, "");
    if (s.length >= 6) return s;
  }
  return "";
}

/**
 * Tutores que matchean un documento. `buscarPacientesPorDocumentoTutor`
 * devuelve MASCOTAS (una fila por mascota, con su tutor embebido), así que
 * acá agrupamos por tutor: un documento puede matchear a más de un
 * related_person (130 casos conocidos en el padrón) y no queremos asumir
 * que el primero es el correcto.
 */
export async function buscarTutoresPorDocumento(documento: string): Promise<TutorRow[]> {
  const mascotas = await buscarPacientesPorDocumentoTutor(documento);
  const porTutor = new Map<string, TutorRow>();
  for (const m of mascotas) {
    if (!m.tutor) continue;
    const id = idPadron(m.tutor.id);
    if (!id || porTutor.has(id)) continue;
    porTutor.set(id, {
      related_person_id: id,
      // `documento` puede venir como etiqueta ("DNI") según cómo esté
      // armada la consulta del padrón: se toma el primer valor que
      // realmente parezca un documento, y si no, el que buscó el usuario.
      documento: primerDocumento(m.tutor.dni, m.tutor.documento) || documento,
      nombre: m.tutor.nombre,
      apellido: m.tutor.apellido,
      telefono: m.tutor.telefono,
      email: m.tutor.email,
    });
  }
  return [...porTutor.values()];
}

/** Mascotas a cargo de un tutor, filtradas del resultado por documento. */
export async function listarMascotasDeTutor(
  documento: string,
  relatedPersonId: string
): Promise<PadronPacienteConTutor[]> {
  const mascotas = await buscarPacientesPorDocumentoTutor(documento);
  return mascotas
    .filter((m) => idPadron(m.tutor?.id) === idPadron(relatedPersonId))
    .sort((a, b) =>
      (a.identificador_ospan || a.nombre || "").localeCompare(b.identificador_ospan || b.nombre || "")
    );
}

/**
 * Verifica que una mascota (por id_hub) sea de este tutor. Es el control de
 * acceso de TODOS los endpoints de la app: sin esto, una sesión válida
 * podría pedir las órdenes de cualquier id_hub del padrón.
 */
export async function mascotaPerteneceATutor(
  idHub: string,
  relatedPersonId: string
): Promise<PadronPacienteConTutor | null> {
  const mascota = await buscarPacientePorIdHub(idHub);
  if (!mascota) return null;
  // Misma normalización que arriba: el padrón puede devolver el id como
  // número y la sesión lo lleva como string.
  if (idPadron(mascota.related_person_id) !== idPadron(relatedPersonId)) return null;
  return mascota;
}
