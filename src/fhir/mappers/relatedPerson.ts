import type { PegasusOrdenMedica } from "../../adapters/pegasus/pegasusTypes";
import type { RelatedPerson } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";

/**
 * El tutor no es el paciente (la mascota lo es): se modela como RelatedPerson
 * vinculado al Patient, con relationship = "owner"/tutor. TutorDocumento es
 * el DNI del tutor -- lo que Pegasus manda como NroAfiliado en la cabecera de
 * la orden, y que la doc aclara explicitamente que NO identifica a la mascota.
 */
export function mapTutor(orden: PegasusOrdenMedica): RelatedPerson | null {
  if (!orden.IdTutor && !orden.TutorNombre) return null;

  const patientId = fhirId("paciente", orden.IdHub);
  const id = orden.IdTutor
    ? fhirId("tutor", orden.IdTutor)
    : fhirId("tutor", `doc-${orden.TutorDocumento ?? orden.TutorNombre}`);

  return {
    resourceType: "RelatedPerson",
    id,
    identifier: orden.TutorDocumento
      ? [
          {
            system: pegasusSystem("documento-tutor"),
            value: String(orden.TutorDocumento),
          },
        ]
      : undefined,
    patient: ref("Patient", patientId, orden.PacienteNombre),
    relationship: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/v2-0131",
            code: "O",
            display: "Other",
          },
        ],
        text: "Tutor / responsable de la mascota",
      },
    ],
    name: orden.TutorNombre ? [{ text: orden.TutorNombre }] : undefined,
  };
}
