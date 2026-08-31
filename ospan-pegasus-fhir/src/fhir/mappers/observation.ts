import type {
  PegasusOrdenMedica,
  PegasusOrdenMedicaItem,
} from "../../adapters/pegasus/pegasusTypes";
import type { Observation, ObservationStatus, Range } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";
import { mapPractitioner } from "./practitioner";

/**
 * Cada item de la orden (una practica: laboratorio, imagen, etc.) se mapea a
 * un Observation. OJO con lo que dice la doc de Pegasus: los items NO tienen
 * estado de autorizacion propio (ese circuito no esta en uso); lo real es
 * `Realizada`. Y en Panda, NumValor/TextValor/Unidad/ValoresReferencia
 * "casi nunca se cargan" -- por eso el mapper contempla explicitamente el
 * caso sin valor (dataAbsentReason) en vez de asumir que siempre hay dato.
 */
function resolveStatus(item: PegasusOrdenMedicaItem): ObservationStatus {
  if (!item.Realizada) return "registered";
  return "final";
}

function resolveReferenceRange(
  item: PegasusOrdenMedicaItem
): Range[] | undefined {
  if (!item.ValoresReferencia) return undefined;
  return [{ text: item.ValoresReferencia }];
}

export function mapObservationFromItem(
  orden: PegasusOrdenMedica,
  item: PegasusOrdenMedicaItem
): Observation {
  const id = fhirId("item", item.IdOrdenMedicaItem);
  const patientId = fhirId("paciente", orden.IdHub);
  const ordenId = fhirId("orden", orden.IdOrdenMedica);
  const realizador = mapPractitioner({
    idNativo: item.IdProfesionalRealiza,
    nombre: item.ProfesionalRealiza,
    matricula: item.MatriculaRealiza,
  });

  const hasNumValor = item.NumValor !== null && item.NumValor !== undefined;
  const hasTextValor =
    item.TextValor !== null && item.TextValor !== undefined && item.TextValor !== "";

  const obs: Observation = {
    resourceType: "Observation",
    id,
    identifier: [
      {
        system: pegasusSystem("id-orden-medica-item"),
        value: String(item.IdOrdenMedicaItem),
      },
    ],
    basedOn: [ref("ServiceRequest", ordenId, `Orden #${orden.IdOrdenMedica}`)],
    status: resolveStatus(item),
    category: [{ text: orden.ServicioNombre ?? "Practica" }],
    code: {
      coding: [
        {
          system: pegasusSystem("id-sku"),
          code: String(item.IdSku),
          display: item.Descripcion,
        },
      ],
      text: item.Descripcion,
    },
    subject: ref("Patient", patientId, orden.PacienteNombre),
    performer: realizador
      ? [ref("Practitioner", realizador.id!, item.ProfesionalRealiza ?? undefined)]
      : undefined,
    effectiveDateTime: orden.Fecha,
    referenceRange: resolveReferenceRange(item),
    note: [
      ...(item.Indicaciones ? [{ text: `Indicaciones: ${item.Indicaciones}` }] : []),
      ...(item.Notas ? [{ text: item.Notas }] : []),
    ],
  };

  if (hasNumValor) {
    obs.valueQuantity = {
      value: item.NumValor as number,
      unit: item.Unidad ?? undefined,
    };
  } else if (hasTextValor) {
    obs.valueString = item.TextValor as string;
  } else if (item.Valor) {
    obs.valueString = item.Valor;
  } else {
    // Consistente con la doc: en Panda estos campos "casi nunca se cargan".
    obs.dataAbsentReason = { text: "No cargado en origen (Panda)" };
  }

  if (obs.note && obs.note.length === 0) delete obs.note;

  return obs;
}
