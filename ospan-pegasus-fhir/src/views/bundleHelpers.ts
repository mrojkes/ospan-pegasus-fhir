import type {
  Bundle,
  DiagnosticReport,
  DocumentReference,
  Observation,
  ServiceRequest,
} from "../fhir/types/r4";

export interface BundlePartes {
  serviceRequest?: ServiceRequest;
  observations: Observation[];
  diagnosticReport?: DiagnosticReport;
  documentRefs: DocumentReference[];
}

/** El fhir_bundle guardado es el de UNA orden (mapOrdenToBundle), así que
 * alcanza con separar por resourceType -- no hace falta resolver refs. */
export function extraerPartes(bundle: Bundle): BundlePartes {
  const partes: BundlePartes = { observations: [], documentRefs: [] };
  for (const entry of bundle.entry) {
    const r = entry.resource;
    if (r.resourceType === "ServiceRequest") partes.serviceRequest = r;
    else if (r.resourceType === "Observation") partes.observations.push(r);
    else if (r.resourceType === "DiagnosticReport") partes.diagnosticReport = r;
    else if (r.resourceType === "DocumentReference") partes.documentRefs.push(r);
  }
  return partes;
}
