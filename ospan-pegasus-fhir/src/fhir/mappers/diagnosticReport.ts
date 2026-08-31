import type {
  PegasusEstadoCodigo,
  PegasusOrdenMedica,
} from "../../adapters/pegasus/pegasusTypes";
import type { DiagnosticReport, DiagnosticReportStatus } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";

/**
 * DiagnosticReport agrupa los resultados de la orden (sus Observations) y
 * lleva el informe narrativo. Distingue lo que ServiceRequest.status no
 * distingue: "Realizada" (3, informe listo) vs "Realizada, informe
 * pendiente" (5, resultados parciales).
 */
const ESTADO_A_DR_STATUS: Record<PegasusEstadoCodigo, DiagnosticReportStatus> = {
  1: "registered",
  2: "cancelled",
  3: "final",
  4: "cancelled",
  5: "partial",
  6: "registered",
  7: "entered-in-error",
};

export function mapDiagnosticReport(
  orden: PegasusOrdenMedica,
  observationIds: string[]
): DiagnosticReport | null {
  // Si no hay items ni informe/resultados, no tiene sentido emitir un
  // DiagnosticReport vacio.
  if (
    observationIds.length === 0 &&
    !orden.Informe &&
    !orden.EvoOrdenMedicaResultados
  ) {
    return null;
  }

  const id = fhirId("informe", orden.IdOrdenMedica);
  const patientId = fhirId("paciente", orden.IdHub);
  const ordenId = fhirId("orden", orden.IdOrdenMedica);

  const conclusionParts = [orden.Informe, orden.EvoOrdenMedicaResultados].filter(
    (v): v is string => Boolean(v)
  );

  return {
    resourceType: "DiagnosticReport",
    id,
    identifier: [
      {
        system: pegasusSystem("id-orden-medica"),
        value: String(orden.IdOrdenMedica),
      },
    ],
    basedOn: [ref("ServiceRequest", ordenId, `Orden #${orden.IdOrdenMedica}`)],
    status: ESTADO_A_DR_STATUS[orden.IdEstado] ?? "unknown",
    category: orden.ServicioNombre ? [{ text: orden.ServicioNombre }] : undefined,
    code: { text: orden.ServicioNombre ?? `Orden medica #${orden.IdOrdenMedica}` },
    subject: ref("Patient", patientId, orden.PacienteNombre),
    effectiveDateTime: orden.Fecha,
    issued: orden.FechaResultados ?? undefined,
    result: observationIds.map((obsId) => ref("Observation", obsId)),
    // Contenido HTML tal cual viene de Pegasus. Nota: son campos HTML, no
    // markdown -- si se necesita texto plano hay que sanitizar/parsear
    // aparte; por ahora se preserva el contenido original.
    conclusion: conclusionParts.length ? conclusionParts.join("\n\n---\n\n") : undefined,
  };
}
