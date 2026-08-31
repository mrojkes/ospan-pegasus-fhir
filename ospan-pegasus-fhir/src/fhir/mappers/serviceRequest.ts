import type {
  PegasusEstadoCodigo,
  PegasusOrdenMedica,
} from "../../adapters/pegasus/pegasusTypes";
import type { ServiceRequest, ServiceRequestStatus } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";
import { mapPractitioner } from "./practitioner";

/**
 * IdEstado de Pegasus -> ServiceRequest.status de FHIR.
 *
 * El value set de FHIR (draft|active|on-hold|revoked|completed|
 * entered-in-error|unknown) no tiene un slot 1:1 para "Autorizado por el
 * tutor" (6) ni distingue "Realizada" de "Realizada, informe pendiente"
 * (3 vs 5, que en FHIR es mas bien un tema de DiagnosticReport.status).
 * Por eso el estado ORIGINAL de Pegasus se preserva siempre, sin perdida,
 * en una extension (ver estadoOrigenExtension) ademas del status FHIR.
 */
const ESTADO_A_STATUS: Record<PegasusEstadoCodigo, ServiceRequestStatus> = {
  1: "active", // Pendiente de realizacion
  2: "revoked", // Cancelada por tutor
  3: "completed", // Realizada
  4: "revoked", // Cancelada por medico
  5: "completed", // Realizada, informe pendiente (el detalle fino va en DiagnosticReport)
  6: "active", // Autorizado por el tutor
  7: "entered-in-error", // Duplicado
};

function estadoOrigenExtension(orden: PegasusOrdenMedica) {
  return {
    url: "http://ospan.org.ar/fhir/StructureDefinition/estado-origen-pegasus",
    valueCodeableConcept: {
      coding: [
        {
          system: pegasusSystem("estado-orden"),
          code: String(orden.IdEstado),
          display: orden.EstadoNombre,
        },
      ],
      text: orden.EstadoNombre,
    },
  };
}

export function mapServiceRequest(orden: PegasusOrdenMedica): ServiceRequest {
  const id = fhirId("orden", orden.IdOrdenMedica);
  const patientId = fhirId("paciente", orden.IdHub);
  const solicitante = mapPractitioner({
    idNativo: orden.IdMedico,
    nombre: orden.MedicoNombre,
    matricula: orden.MedicoMatricula,
  });
  const sucursalId =
    orden.IdSucursal || orden.SucursalNombre
      ? fhirId(
          "sucursal",
          orden.IdSucursal ?? `nombre-${orden.SucursalNombre}`
        )
      : undefined;
  const coberturaId =
    orden.IdCobertura || orden.CoberturaNombre
      ? fhirId(
          "cobertura",
          orden.IdCobertura ?? `nombre-${orden.CoberturaNombre}`
        )
      : undefined;

  return {
    resourceType: "ServiceRequest",
    id,
    identifier: [
      {
        system: pegasusSystem("id-orden-medica"),
        value: String(orden.IdOrdenMedica),
      },
    ],
    status: ESTADO_A_STATUS[orden.IdEstado] ?? "unknown",
    intent: "order",
    category: orden.ServicioNombre
      ? [{ text: orden.ServicioNombre }]
      : undefined,
    code: { text: `Orden medica #${orden.IdOrdenMedica}` },
    subject: ref("Patient", patientId, orden.PacienteNombre),
    authoredOn: orden.Fecha,
    occurrenceDateTime: orden.Fecha,
    requester: solicitante
      ? ref("Practitioner", solicitante.id!, orden.MedicoNombre ?? undefined)
      : undefined,
    performerType: orden.ServicioNombre
      ? { text: orden.ServicioNombre }
      : undefined,
    locationReference: sucursalId
      ? [ref("Organization", sucursalId, orden.SucursalNombre)]
      : undefined,
    reasonCode: orden.Diagnostico ? [{ text: orden.Diagnostico }] : undefined,
    insurance: coberturaId
      ? [ref("Organization", coberturaId, orden.CoberturaNombre)]
      : undefined,
    note: orden.Notas ? [{ text: orden.Notas }] : undefined,
    extension: [estadoOrigenExtension(orden)],
  };
}
