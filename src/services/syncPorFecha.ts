import { fetchOrdenesPorFecha } from "../adapters/pegasus/pegasusClient";
import { mapOrdenToBundle } from "../fhir/mappers/bundle";
import {
  finalizarSyncRun,
  iniciarSyncRun,
  upsertVersionSiCambio,
} from "../persistence/ordenMedicaRepo";

export interface SyncPorFechaResultado {
  syncRunId: number;
  desde: string;
  hasta: string;
  cantidadOrdenesPegasus: number;
  cantidadVersionesNuevas: number;
  cantidadSinCambios: number;
  truncado: boolean;
}

/**
 * Sincroniza todas las ordenes de un rango de fechas (punto 2.1: "sync de
 * las ordenes de una fecha determinada"). Usa /api/ordenesmedicas/porfecha,
 * que NO filtra por cobertura -- persiste TODO lo que trae Pegasus (OSPAN y
 * otras coberturas), porque el back office despues necesita poder mostrar
 * mascotas que no son de OSPAN via padron/otros criterios.
 *
 * Por cada orden: transforma a FHIR y persiste una version nueva SOLO si
 * cambio el estado desde la ultima vez (ver ordenMedicaRepo.upsertVersionSiCambio).
 */
export async function sincronizarPorFecha(
  desde: string,
  hasta?: string,
  cobertura?: number
): Promise<SyncPorFechaResultado> {
  const syncRunId = await iniciarSyncRun("por_fecha", {
    desde,
    hasta: hasta ?? desde,
    cobertura: cobertura ?? null,
  });

  try {
    const respuesta = await fetchOrdenesPorFecha({ desde, hasta, cobertura });

    let nuevas = 0;
    let sinCambios = 0;

    for (const orden of respuesta.ordenes) {
      const bundle = mapOrdenToBundle(orden);
      const resultado = await upsertVersionSiCambio(orden, bundle);
      if (resultado.inserted) nuevas++;
      else sinCambios++;
    }

    await finalizarSyncRun(syncRunId, {
      cantidadOrdenesPegasus: respuesta.cantidad,
      cantidadVersionesNuevas: nuevas,
      estado: "ok",
    });

    return {
      syncRunId,
      desde: respuesta.desde,
      hasta: respuesta.hasta,
      cantidadOrdenesPegasus: respuesta.cantidad,
      cantidadVersionesNuevas: nuevas,
      cantidadSinCambios: sinCambios,
      truncado: respuesta.truncado,
    };
  } catch (err) {
    await finalizarSyncRun(syncRunId, {
      cantidadOrdenesPegasus: 0,
      cantidadVersionesNuevas: 0,
      estado: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
