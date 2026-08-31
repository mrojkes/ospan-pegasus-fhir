import type { Practitioner } from "../types/r4";
import { fhirId, pegasusSystem } from "./ids";

/**
 * Un profesional puede aparecer como quien SOLICITA la orden (MedicoNombre /
 * IdMedico, en la cabecera) o como quien REALIZA una practica puntual
 * (ProfesionalRealiza / IdProfesionalRealiza, por item). Se modelan ambos
 * como Practitioner; el rol especifico (solicitante vs. realizador) se
 * expresa en el recurso que referencia al Practitioner (ServiceRequest.requester
 * vs. Observation.performer), no en el Practitioner en si.
 *
 * La matricula (MedicoMatricula / MatriculaRealiza) viaja en pocos casos: se
 * incluye como qualification cuando esta presente, pero no se puede asumir
 * que exista.
 */
export function mapPractitioner(params: {
  idNativo?: number | null;
  nombre?: string | null;
  matricula?: string | null;
}): Practitioner | null {
  const { idNativo, nombre, matricula } = params;
  if (!idNativo && !nombre) return null;

  const id = idNativo
    ? fhirId("profesional", idNativo)
    : fhirId("profesional", `nombre-${nombre}`);

  return {
    resourceType: "Practitioner",
    id,
    identifier: idNativo
      ? [
          {
            system: pegasusSystem("id-profesional"),
            value: String(idNativo),
          },
        ]
      : undefined,
    name: nombre ? [{ text: nombre }] : undefined,
    qualification: matricula
      ? [
          {
            identifier: [{ value: matricula }],
            code: { text: "Matricula profesional" },
          },
        ]
      : undefined,
  };
}
