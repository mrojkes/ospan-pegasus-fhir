import type { PegasusOrdenMedica } from "../../adapters/pegasus/pegasusTypes";
import type { DocumentReference } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";

function guessContentType(url: string): string | undefined {
  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return undefined;
}

/**
 * OJO: estas URLs de Adjuntos se sirven SIN autenticacion (cualquiera con el
 * link accede al estudio, para siempre). La doc pide explicitamente no
 * publicarlas, no mandarlas por mail y no guardarlas en logs. Este mapper
 * las deja en DocumentReference.content.attachment.url porque es donde van
 * en FHIR, pero cualquier capa de logging/tracing de este backend NO debe
 * loguear el body de estas respuestas.
 */
export function mapDocumentReferences(
  orden: PegasusOrdenMedica
): DocumentReference[] {
  const patientId = fhirId("paciente", orden.IdHub);
  const ordenId = fhirId("orden", orden.IdOrdenMedica);

  return (orden.Adjuntos ?? []).map((url, idx) => ({
    resourceType: "DocumentReference" as const,
    id: fhirId("adjunto", `${orden.IdOrdenMedica}-${idx}`),
    identifier: [
      {
        system: pegasusSystem("adjunto-url"),
        value: url,
      },
    ],
    status: "current" as const,
    type: { text: "Adjunto de orden medica" },
    subject: ref("Patient", patientId, orden.PacienteNombre),
    date: orden.Fecha,
    content: [
      {
        attachment: {
          url,
          contentType: guessContentType(url),
        },
      },
    ],
    context: {
      related: [ref("ServiceRequest", ordenId, `Orden #${orden.IdOrdenMedica}`)],
    },
  }));
}
