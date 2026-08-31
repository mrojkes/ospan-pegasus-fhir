import { env } from "../../config/env";

/**
 * Convenciones de identificacion para los recursos FHIR generados a partir
 * de Pegasus (Panda). Pensadas para poder sumar otros HIS mas adelante sin
 * pisar ids: cada recurso originado en Pegasus lleva:
 *   - un id local con prefijo "peg-" (unico dentro de este conector)
 *   - un Identifier con system = FHIR_SOURCE_SYSTEM_BASE + "/<tipo>" y
 *     value = el id nativo de Pegasus, para poder reconciliar si otro HIS
 *     trae el mismo paciente/profesional con otro id nativo.
 */

export function pegasusSystem(tipo: string): string {
  return `${env.fhirSourceSystemBase}/${tipo}`;
}

export function fhirId(prefix: string, nativeId: string | number): string {
  // Los ids de FHIR solo admiten [A-Za-z0-9\-\.], hasta 64 caracteres.
  const clean = String(nativeId).replace(/[^A-Za-z0-9.-]/g, "-");
  return `peg-${prefix}-${clean}`.slice(0, 64);
}

export function ref(resourceType: string, id: string, display?: string) {
  return {
    reference: `${resourceType}/${id}`,
    ...(display ? { display } : {}),
  };
}
