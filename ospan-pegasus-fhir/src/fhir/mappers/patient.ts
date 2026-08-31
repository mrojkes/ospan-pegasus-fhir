import type { PegasusOrdenMedica } from "../../adapters/pegasus/pegasusTypes";
import type { Patient } from "../types/r4";
import { fhirId, pegasusSystem } from "./ids";

/**
 * Mapea la mascota (paciente) de una orden a un Patient FHIR.
 *
 * FHIR R4 no tiene un recurso "Animal": el patron estandar para veterinaria
 * es usar Patient con la extension oficial "patient-animal"
 * (http://hl7.org/fhir/StructureDefinition/patient-animal) para especie y
 * raza. Se preserva ademas el id_hub como identifier "oficial", que es la
 * UNICA clave real de la mascota segun la doc de Pegasus (NroAfiliado es
 * el documento del tutor y no identifica a la mascota).
 */
export function mapPatient(orden: PegasusOrdenMedica): Patient {
  const id = fhirId("paciente", orden.IdHub);

  return {
    resourceType: "Patient",
    id,
    identifier: [
      {
        use: "official",
        system: pegasusSystem("id-hub"),
        value: orden.IdHub,
      },
      ...(orden.IdPaciente
        ? [
            {
              use: "secondary" as const,
              system: pegasusSystem("id-paciente"),
              value: String(orden.IdPaciente),
            },
          ]
        : []),
    ],
    active: true,
    name: orden.PacienteNombre ? [{ text: orden.PacienteNombre }] : undefined,
    birthDate: normalizeDate(orden.PacienteFechaNac),
    extension: [
      {
        url: "http://hl7.org/fhir/StructureDefinition/patient-animal",
        extension: [
          ...(orden.EspecieNombre
            ? [
                {
                  url: "species",
                  valueCodeableConcept: { text: orden.EspecieNombre },
                },
              ]
            : []),
          ...(orden.RazaNombre
            ? [
                {
                  url: "breed",
                  valueCodeableConcept: { text: orden.RazaNombre },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function normalizeDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  // Pegasus manda fechas tipo "2026-06-06T11:13:00"; FHIR birthDate quiere
  // solo la parte de fecha.
  return value.slice(0, 10);
}
