/* =========================================================
   PEGASUS -> SHAPE QUE CONSUME LA APP DEL ASOCIADO
   -----------------------------------------------------------
   La app NO consume FHIR: consume un objeto plano pensado para una
   pantalla de celular. La fuente es `raw_pegasus` (el JSON crudo que
   el conector ya persiste con cada versión), no `fhir_bundle` —
   mismo criterio que usa el back office para Diagnostico /
   EvoOrdenMedica / EvoOrdenMedicaResultados.

   Efecto lateral útil: al no depender del bundle, un cambio en un
   mapper de FHIR no deja esta pantalla desactualizada, así que no le
   afecta el tema de `reprocesarBundles()`.

   Qué NO se le manda al celular, a propósito:
   - Importes: hoy vienen en 0 (sin convenio cargado en Panda) y son
     información de convenio, no del asociado.
   - Las URLs de adjuntos de Pegasus: son públicas, permanentes y sin
     token. Se sirven por el proxy autenticado del backend.
   ========================================================= */

import type { OrdenMedicaActualRow } from "../persistence/ordenMedicaRepo";
import type { PegasusOrdenMedica } from "../adapters/pegasus/pegasusTypes";

export interface OrdenApp {
  id: number;
  idHub: string | null;
  idPaciente: number | null;
  fecha: string | null;
  servicio: string;
  estadoCodigo: number | null;
  estadoNombre: string;
  profesional: string | null;
  sucursal: string | null;
  mascotaNombre: string | null;
  diagnostico: string | null;
  solicitudHtml: string;
  resultadoHtml: string;
  items: Array<{ nombre: string; valor: string; unidad: string; referencia: string; realizada: boolean }>;
  adjuntos: Array<{ n: number; nombre: string; tipo: string; url: null }>;
  tieneInforme: boolean;
  origen?: "local" | "vivo";
  actualizadoEn?: string | null;
}

/**
 * `Items[].Valor` llega con el placeholder literal "&nbsp;" cuando el item
 * no tiene valor cargado (confirmado con datos reales el 31/08). Se
 * normaliza a vacío y la app muestra "sin valor cargado".
 */
function limpiarValor(v: unknown): string {
  return String(v ?? "").replace(/&nbsp;/gi, "").replace(/ /g, "").trim();
}

function texto(...valores: Array<unknown>): string {
  for (const v of valores) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * `Adjuntos` es un `string[]` de URLs sueltas: Pegasus no manda nombre ni
 * content-type. El nombre visible se deduce del último segmento de la URL
 * y el tipo, de su extensión.
 */
function nombreDesdeUrl(url: string, i: number): { nombre: string; tipo: string } {
  let base = "";
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
    base = (url.split("?")[0].split("/").pop() || "").trim();
  }
  const nombre = base || `Adjunto ${i + 1}`;
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  const tipo =
    ext === "pdf" ? "application/pdf"
    : ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? "image/" + (ext === "jpg" ? "jpeg" : ext)
    : "";
  return { nombre, tipo };
}

/** Acepta una fila de `orden_medica_actual` o una orden cruda de Pegasus. */
export function mapearOrden(input: OrdenMedicaActualRow | PegasusOrdenMedica): OrdenApp {
  const fila = input as Partial<OrdenMedicaActualRow>;
  const o: PegasusOrdenMedica = (fila.raw_pegasus ?? input) as PegasusOrdenMedica;

  const resultadoHtml = texto(o?.EvoOrdenMedicaResultados, o?.Informe);
  const adjuntosRaw: string[] = Array.isArray(o?.Adjuntos) ? o.Adjuntos : [];

  return {
    id: Number(o?.IdOrdenMedica ?? fila.id_orden_medica ?? 0),
    idHub: o?.IdHub ?? fila.id_hub ?? null,
    idPaciente: o?.IdPaciente ?? fila.id_paciente ?? null,
    fecha: o?.Fecha ?? fila.fecha_orden ?? null,
    servicio: texto(o?.ServicioNombre, fila.servicio_nombre) || "Orden médica",
    estadoCodigo: o?.IdEstado ?? fila.id_estado ?? null,
    estadoNombre: texto(o?.EstadoNombre, fila.estado_nombre) || "—",
    profesional: texto(o?.MedicoNombre, fila.medico_nombre) || null,
    sucursal: texto(o?.SucursalNombre) || null,
    mascotaNombre: texto(o?.PacienteNombre, fila.paciente_nombre) || null,
    diagnostico: texto(o?.Diagnostico) || null,
    solicitudHtml: texto(o?.EvoOrdenMedica),
    resultadoHtml,
    items: (o?.Items ?? []).map((it) => ({
      nombre: texto(it?.Descripcion) || "—",
      valor: limpiarValor(it?.Valor ?? it?.TextValor ?? it?.NumValor),
      unidad: limpiarValor(it?.Unidad),
      referencia: limpiarValor(it?.ValoresReferencia),
      realizada: !!it?.Realizada,
    })),
    // El índice es la posición en el array: el proxy vuelve a resolver la
    // orden y saca la URL por índice, así la URL pública de Pegasus nunca
    // llega al celular.
    adjuntos: adjuntosRaw.map((url, i) => {
      const { nombre, tipo } = nombreDesdeUrl(url, i);
      return { n: i, nombre, tipo, url: null };
    }),
    tieneInforme: !!resultadoHtml,
    actualizadoEn: fila.synced_at ?? null,
  };
}

/** URL real del adjunto en Pegasus — se usa SOLO server-side, en el proxy. */
export function urlAdjuntoOriginal(
  input: OrdenMedicaActualRow | PegasusOrdenMedica,
  n: number
): string | null {
  const fila = input as Partial<OrdenMedicaActualRow>;
  const o: PegasusOrdenMedica = (fila.raw_pegasus ?? input) as PegasusOrdenMedica;
  const adjuntos: string[] = Array.isArray(o?.Adjuntos) ? o.Adjuntos : [];
  const url = adjuntos[n];
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}
