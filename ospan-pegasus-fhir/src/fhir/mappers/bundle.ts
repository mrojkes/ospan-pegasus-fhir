import type { PegasusOrdenMedica } from "../../adapters/pegasus/pegasusTypes";
import type { AnyResource, Bundle, BundleEntry } from "../types/r4";
import { mapPatient } from "./patient";
import { mapTutor } from "./relatedPerson";
import { mapPractitioner } from "./practitioner";
import { mapCoberturaOrganization, mapCoverage, mapSucursalOrganization } from "./organization";
import { mapServiceRequest } from "./serviceRequest";
import { mapObservationFromItem } from "./observation";
import { mapDiagnosticReport } from "./diagnosticReport";
import { mapDocumentReferences } from "./documentReference";

/**
 * Acumulador que deduplica recursos por resourceType+id. Necesario porque
 * varias ordenes de la misma mascota comparten Patient, y varias ordenes
 * pueden compartir el mismo profesional, sucursal o cobertura.
 */
class ResourceBag {
  private byKey = new Map<string, AnyResource>();

  add(resource: AnyResource | null | undefined) {
    if (!resource || !resource.id) return;
    const key = `${resource.resourceType}/${resource.id}`;
    if (!this.byKey.has(key)) {
      this.byKey.set(key, resource);
    }
  }

  addMany(resources: (AnyResource | null | undefined)[]) {
    resources.forEach((r) => this.add(r));
  }

  toEntries(): BundleEntry[] {
    return Array.from(this.byKey.values()).map((resource) => ({
      fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`,
      resource,
      search: { mode: "match" as const },
    }));
  }
}

/**
 * Mapea UNA orden medica de Pegasus a todos los recursos FHIR derivados de
 * ella y los agrega al bag compartido. Se usa tanto para el detalle (una
 * orden) como para el listado (N ordenes -> un solo Bundle deduplicado).
 */
function addOrdenToBag(bag: ResourceBag, orden: PegasusOrdenMedica) {
  bag.add(mapPatient(orden));
  bag.add(mapTutor(orden));
  bag.add(
    mapPractitioner({
      idNativo: orden.IdMedico,
      nombre: orden.MedicoNombre,
      matricula: orden.MedicoMatricula,
    })
  );
  bag.add(mapSucursalOrganization(orden));
  bag.add(mapCoberturaOrganization(orden));
  bag.add(mapCoverage(orden));
  bag.add(mapServiceRequest(orden));

  const observations = orden.Items.map((item) => {
    const obs = mapObservationFromItem(orden, item);
    bag.add(
      mapPractitioner({
        idNativo: item.IdProfesionalRealiza,
        nombre: item.ProfesionalRealiza,
        matricula: item.MatriculaRealiza,
      })
    );
    bag.add(obs);
    return obs;
  });

  bag.add(mapDiagnosticReport(orden, observations.map((o) => o.id!)));
  bag.addMany(mapDocumentReferences(orden));
}

export function mapOrdenToBundle(orden: PegasusOrdenMedica): Bundle {
  const bag = new ResourceBag();
  addOrdenToBag(bag, orden);
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    total: bag.toEntries().length,
    entry: bag.toEntries(),
  };
}

export function mapOrdenesToBundle(ordenes: PegasusOrdenMedica[]): Bundle {
  const bag = new ResourceBag();
  ordenes.forEach((orden) => addOrdenToBag(bag, orden));
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    total: bag.toEntries().length,
    entry: bag.toEntries(),
  };
}
