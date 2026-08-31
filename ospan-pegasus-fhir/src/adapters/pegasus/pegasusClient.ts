import { env } from "../../config/env";
import type {
  PegasusOrdenMedica,
  PegasusOrdenesMedicasListResponse,
  PegasusOrdenesMedicasQuery,
  PegasusOrdenesPorFechaQuery,
  PegasusOrdenesPorFechaResponse,
  PegasusOrdenesPorPacienteQuery,
  PegasusOrdenesPorPacienteResponse,
  PegasusPacientesPorDocumentoQuery,
  PegasusPacientesPorDocumentoResponse,
} from "./pegasusTypes";

/**
 * Error especifico para respuestas no-OK de Pegasus, para poder distinguirlo
 * de errores de red/parseo en las rutas Express.
 */
export class PegasusApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "PegasusApiError";
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.pegasusToken) {
    headers["Authorization"] = `Bearer ${env.pegasusToken}`;
  }
  return headers;
}

function buildQueryString(
  params: Record<string, string | number | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function pegasusFetch<T>(path: string): Promise<T> {
  const url = `${env.pegasusBaseUrl}${path}`;
  const res = await fetch(url, { headers: buildHeaders() });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new PegasusApiError(
      `Pegasus respondio ${res.status} para ${path}`,
      res.status,
      body
    );
  }

  return (await res.json()) as T;
}

/**
 * GET /api/ordenesmedicas
 * id_hub es obligatorio del lado de Pegasus (unico criterio de busqueda de
 * la mascota); lo validamos antes de llamar para dar un 400 claro en vez de
 * dejar que Pegasus devuelva lo que sea que devuelva sin id_hub.
 */
export async function fetchOrdenesMedicas(
  query: PegasusOrdenesMedicasQuery
): Promise<PegasusOrdenesMedicasListResponse> {
  if (!query.id_hub) {
    throw new PegasusApiError("id_hub es obligatorio", 400);
  }
  const qs = buildQueryString({
    id_hub: query.id_hub,
    desde: query.desde,
    hasta: query.hasta,
    estado: query.estado,
    top: query.top,
  });
  return pegasusFetch<PegasusOrdenesMedicasListResponse>(
    `/api/ordenesmedicas${qs}`
  );
}

/**
 * GET /api/ordenesmedicas/{id}
 * id_hub es opcional aca, pero si se manda exige ademas que la orden sea de
 * esa mascota (Pegasus devuelve 404 si no matchea, igual que si no existiera).
 */
export async function fetchOrdenMedicaById(
  idOrdenMedica: number | string,
  idHub?: string
): Promise<PegasusOrdenMedica> {
  const qs = buildQueryString({ id_hub: idHub });
  return pegasusFetch<PegasusOrdenMedica>(
    `/api/ordenesmedicas/${idOrdenMedica}${qs}`
  );
}

/**
 * GET /api/ordenesmedicas/porfecha
 * NO filtra por cobertura (trae OSPAN y todo el resto). Es el endpoint
 * pensado para el "sync del dia" -- ventana maxima 31 dias.
 */
export async function fetchOrdenesPorFecha(
  query: PegasusOrdenesPorFechaQuery
): Promise<PegasusOrdenesPorFechaResponse> {
  if (!query.desde) {
    throw new PegasusApiError("desde es obligatorio", 400);
  }
  const qs = buildQueryString({
    desde: query.desde,
    hasta: query.hasta,
    cobertura: query.cobertura,
    top: query.top,
  });
  return pegasusFetch<PegasusOrdenesPorFechaResponse>(
    `/api/ordenesmedicas/porfecha${qs}`
  );
}

/**
 * GET /api/ordenesmedicas/pacientes
 * Busca mascotas por documento del tutor. El documento puede matchear a
 * mas de un tutor -- devolver la respuesta completa, sin quedarse con el
 * primer resultado.
 */
export async function fetchPacientesPorDocumentoTutor(
  query: PegasusPacientesPorDocumentoQuery
): Promise<PegasusPacientesPorDocumentoResponse> {
  if (!query.documento_tutor) {
    throw new PegasusApiError("documento_tutor es obligatorio", 400);
  }
  const qs = buildQueryString({
    documento_tutor: query.documento_tutor,
    top: query.top,
  });
  return pegasusFetch<PegasusPacientesPorDocumentoResponse>(
    `/api/ordenesmedicas/pacientes${qs}`
  );
}

/**
 * GET /api/ordenesmedicas/pacientes/{idPaciente}/ordenes
 * Unica via para el historial de mascotas que no son de OSPAN.
 */
export async function fetchOrdenesPorPaciente(
  query: PegasusOrdenesPorPacienteQuery
): Promise<PegasusOrdenesPorPacienteResponse> {
  if (!query.idPaciente) {
    throw new PegasusApiError("idPaciente es obligatorio", 400);
  }
  const qs = buildQueryString({
    desde: query.desde,
    hasta: query.hasta,
    top: query.top,
  });
  return pegasusFetch<PegasusOrdenesPorPacienteResponse>(
    `/api/ordenesmedicas/pacientes/${query.idPaciente}/ordenes${qs}`
  );
}
