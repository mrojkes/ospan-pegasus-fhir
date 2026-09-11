import {
  fetchOrdenesMedicas,
  fetchOrdenesPorPaciente,
  fetchOrdenMedicaById,
  PegasusApiError,
} from "../adapters/pegasus/pegasusClient";
import { mapOrdenToBundle } from "../fhir/mappers/bundle";
import {
  actualPorId,
  listActualPorIdHub,
  listActualPorIdPaciente,
  listActualPorTutorDocumento,
  OrdenMedicaActualRow,
  tieneDatosLocalesIdHub,
  tieneDatosLocalesIdPaciente,
  upsertVersionSiCambio,
} from "../persistence/ordenMedicaRepo";

export interface EstudiosResultado {
  ordenes: OrdenMedicaActualRow[];
  fuente: "local" | "vivo";
  nuevasVersiones: number;
}

/**
 * Punto 2.3: ver los estudios de un paciente ya encontrado.
 *
 * - Si tiene id_hub y hay datos locales (y no se pide "fresh"), muestra
 *   SOLO lo que ya está en la base FHIR local (rápido, no pega a Pegasus).
 * - Si no hay datos locales, o se pide explícitamente traer en vivo, va a
 *   buscar a Pegasus por la vía que corresponda -- id_hub (mascota OSPAN)
 *   o idPaciente (mascota que puede no ser de OSPAN, única vía para su
 *   historial completo) -- y persiste TODO lo que trae antes de
 *   devolverlo (2.4: nunca se muestra sin persistir).
 */
export async function obtenerEstudiosPaciente(params: {
  idHub?: string | null;
  idPaciente?: number | string | null;
  tutorDocumento?: string | null;
  fresh?: boolean;
}): Promise<EstudiosResultado> {
  const { idHub, idPaciente, tutorDocumento, fresh } = params;

  if (idHub && !fresh) {
    const hayLocal = await tieneDatosLocalesIdHub(idHub);
    if (hayLocal) {
      return {
        ordenes: await listActualPorIdHub(idHub),
        fuente: "local",
        nuevasVersiones: 0,
      };
    }
  }

  if (idPaciente && !fresh) {
    const hayLocal = await tieneDatosLocalesIdPaciente(idPaciente);
    if (hayLocal) {
      return {
        ordenes: await listActualPorIdPaciente(idPaciente),
        fuente: "local",
        nuevasVersiones: 0,
      };
    }
  }

  // No hay datos locales (o se pidió refrescar): ir a buscar en vivo.
  let nuevasVersiones = 0;

  if (idHub) {
    const respuesta = await fetchOrdenesMedicas({ id_hub: idHub });
    for (const orden of respuesta.ordenes) {
      const bundle = mapOrdenToBundle(orden);
      const r = await upsertVersionSiCambio(orden, bundle);
      if (r.inserted) nuevasVersiones++;
    }
    return {
      ordenes: await listActualPorIdHub(idHub),
      fuente: "vivo",
      nuevasVersiones,
    };
  }

  if (idPaciente) {
    const respuesta = await fetchOrdenesPorPaciente({ idPaciente });
    for (const orden of respuesta.ordenes) {
      const bundle = mapOrdenToBundle(orden);
      const r = await upsertVersionSiCambio(orden, bundle);
      if (r.inserted) nuevasVersiones++;
    }
    return {
      ordenes: await listActualPorIdPaciente(idPaciente),
      fuente: "vivo",
      nuevasVersiones,
    };
  }

  if (tutorDocumento) {
    // Ya persistido de una sync anterior (por fecha, o por otra búsqueda);
    // no hay endpoint de Pegasus que traiga "ordenes por documento"
    // directo, así que acá solo se lee lo local.
    return {
      ordenes: await listActualPorTutorDocumento(tutorDocumento),
      fuente: "local",
      nuevasVersiones: 0,
    };
  }

  return { ordenes: [], fuente: "local", nuevasVersiones: 0 };
}

export interface OrdenResultado {
  orden: OrdenMedicaActualRow | null;
  fuente: "local" | "vivo";
}

/**
 * Trae UNA orden puntual por su `IdOrdenMedica` (2026-09-03) -- el link
 * "Ver orden" del drill-down de reportes, para no tener que abrir toda la
 * ficha de estudios de la mascota y buscarla ahí adentro.
 *
 * Local-first igual que `obtenerEstudiosPaciente`: si ya está sincronizada
 * y no se pide "fresh", se sirve de la base. Si no hay nada local (o se
 * pide refrescar), va a Pegasus con `GET /api/ordenesmedicas/{id}` y
 * persiste antes de devolver (2.4). Un 404 de Pegasus (orden inexistente,
 * o fuera de alcance de `idHub` si se pasó) se traduce en `orden: null` en
 * vez de propagar el error -- es una respuesta válida ("no está"), no una
 * falla.
 */
export async function obtenerOrdenPorId(
  idOrdenMedica: number | string,
  opts?: { fresh?: boolean; idHub?: string }
): Promise<OrdenResultado> {
  if (!opts?.fresh) {
    const local = await actualPorId(idOrdenMedica);
    if (local) return { orden: local, fuente: "local" };
  }

  try {
    const raw = await fetchOrdenMedicaById(idOrdenMedica, opts?.idHub);
    const bundle = mapOrdenToBundle(raw);
    await upsertVersionSiCambio(raw, bundle);
    return { orden: await actualPorId(idOrdenMedica), fuente: "vivo" };
  } catch (err) {
    if (err instanceof PegasusApiError && err.status === 404) {
      return { orden: null, fuente: "vivo" };
    }
    throw err;
  }
}
