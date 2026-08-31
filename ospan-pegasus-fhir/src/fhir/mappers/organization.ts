import type { PegasusOrdenMedica } from "../../adapters/pegasus/pegasusTypes";
import type { Coverage, Organization } from "../types/r4";
import { fhirId, pegasusSystem, ref } from "./ids";

/** Sucursal donde se genero la orden -> Organization (rol "prov", proveedor). */
export function mapSucursalOrganization(
  orden: PegasusOrdenMedica
): Organization | null {
  if (!orden.IdSucursal && !orden.SucursalNombre) return null;
  const id = orden.IdSucursal
    ? fhirId("sucursal", orden.IdSucursal)
    : fhirId("sucursal", `nombre-${orden.SucursalNombre}`);
  return {
    resourceType: "Organization",
    id,
    identifier: orden.IdSucursal
      ? [{ system: pegasusSystem("id-sucursal"), value: String(orden.IdSucursal) }]
      : undefined,
    active: true,
    type: [{ text: "Sucursal / prestador" }],
    name: orden.SucursalNombre,
  };
}

/**
 * La cobertura (siempre OSPAN en este endpoint, IdCobertura = 1) se modela
 * como Organization con rol "pay" (financiador) + un Coverage que vincula al
 * paciente con esa Organization. Se deja preparado para cuando aparezcan
 * otras coberturas via otros HIS.
 */
export function mapCoberturaOrganization(
  orden: PegasusOrdenMedica
): Organization | null {
  if (!orden.IdCobertura && !orden.CoberturaNombre) return null;
  const id = orden.IdCobertura
    ? fhirId("cobertura", orden.IdCobertura)
    : fhirId("cobertura", `nombre-${orden.CoberturaNombre}`);
  return {
    resourceType: "Organization",
    id,
    identifier: orden.IdCobertura
      ? [{ system: pegasusSystem("id-cobertura"), value: String(orden.IdCobertura) }]
      : undefined,
    active: true,
    type: [{ text: "Financiador / obra social" }],
    name: orden.CoberturaNombre ?? "OSPAN",
  };
}

export function mapCoverage(orden: PegasusOrdenMedica): Coverage | null {
  const coberturaOrg = mapCoberturaOrganization(orden);
  if (!coberturaOrg) return null;

  const patientId = fhirId("paciente", orden.IdHub);
  const id = fhirId(
    "coverage",
    `${orden.IdHub}-${orden.IdCobertura ?? orden.CoberturaNombre}`
  );

  return {
    resourceType: "Coverage",
    id,
    status: "active",
    beneficiary: ref("Patient", patientId, orden.PacienteNombre),
    payor: [ref("Organization", coberturaOrg.id!, coberturaOrg.name)],
    // NroAfiliado es informativo (documento del tutor); se preserva tal cual
    // para trazabilidad pero la doc es explicita en que no es clave de nada.
    subscriberId: orden.NroAfiliado ?? undefined,
  };
}
