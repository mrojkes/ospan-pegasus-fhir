import { Router } from "express";
import {
  fetchOrdenesMedicas,
  fetchOrdenMedicaById,
  fetchOrdenesPorFecha,
  fetchPacientesPorDocumentoTutor,
  fetchOrdenesPorPaciente,
  PegasusApiError,
} from "../adapters/pegasus/pegasusClient";
import type {
  PegasusEstadoCodigo,
  PegasusOrdenesMedicasQuery,
} from "../adapters/pegasus/pegasusTypes";
import { mapOrdenToBundle, mapOrdenesToBundle } from "../fhir/mappers/bundle";

export const ordenesMedicasRouter = Router();

function parseListQuery(q: Record<string, unknown>): PegasusOrdenesMedicasQuery {
  return {
    id_hub: String(q.id_hub ?? ""),
    desde: q.desde ? String(q.desde) : undefined,
    hasta: q.hasta ? String(q.hasta) : undefined,
    estado: q.estado
      ? (Number(q.estado) as PegasusEstadoCodigo)
      : undefined,
    top: q.top ? Number(q.top) : undefined,
  };
}

function handlePegasusError(err: unknown, res: import("express").Response) {
  if (err instanceof PegasusApiError) {
    // Preserva el semantica documentada: 404 puede significar "no existe" o
    // "existe pero fuera de alcance (cobertura distinta de OSPAN)" -- Pegasus
    // los deja indistinguibles a proposito, asi que este backend tampoco
    // inventa una distincion que la fuente no da.
    res.status(err.status).json({
      error: err.message,
      pegasusStatus: err.status,
      pegasusBody: err.body,
    });
    return;
  }
  res.status(502).json({
    error: "Error inesperado consultando Pegasus",
    detail: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Proxy crudo: devuelve exactamente el JSON de Pegasus, sin transformar.
 * Util para comparar contra la version FHIR y para debug.
 */
ordenesMedicasRouter.get("/api/pegasus/ordenesmedicas", async (req, res) => {
  try {
    const data = await fetchOrdenesMedicas(parseListQuery(req.query));
    res.json(data);
  } catch (err) {
    handlePegasusError(err, res);
  }
});

// -----------------------------------------------------------------------
// Endpoints nuevos de Pegasus (doc actualizada 2026-08-31): por fecha
// (todas las coberturas) y por documento del tutor / IdPaciente (unica via
// para mascotas que no son de OSPAN). Proxy crudo, sin persistir -- el
// sync real vive en /back-office/sync (ver services/syncPorFecha.ts).
//
// OJO DE ORDEN DE RUTAS: estas van ANTES de "/api/pegasus/ordenesmedicas/:id"
// a proposito -- si no, Express matchea "porfecha"/"pacientes" como si
// fueran un :id.
// -----------------------------------------------------------------------

ordenesMedicasRouter.get("/api/pegasus/ordenesmedicas/porfecha", async (req, res) => {
  try {
    const data = await fetchOrdenesPorFecha({
      desde: String(req.query.desde ?? ""),
      hasta: req.query.hasta ? String(req.query.hasta) : undefined,
      cobertura: req.query.cobertura ? Number(req.query.cobertura) : undefined,
      top: req.query.top ? Number(req.query.top) : undefined,
    });
    res.json(data);
  } catch (err) {
    handlePegasusError(err, res);
  }
});

ordenesMedicasRouter.get("/api/pegasus/ordenesmedicas/pacientes", async (req, res) => {
  try {
    const data = await fetchPacientesPorDocumentoTutor({
      documento_tutor: String(req.query.documento_tutor ?? ""),
      top: req.query.top ? Number(req.query.top) : undefined,
    });
    res.json(data);
  } catch (err) {
    handlePegasusError(err, res);
  }
});

ordenesMedicasRouter.get(
  "/api/pegasus/ordenesmedicas/pacientes/:idPaciente/ordenes",
  async (req, res) => {
    try {
      const data = await fetchOrdenesPorPaciente({
        idPaciente: req.params.idPaciente,
        desde: req.query.desde ? String(req.query.desde) : undefined,
        hasta: req.query.hasta ? String(req.query.hasta) : undefined,
        top: req.query.top ? Number(req.query.top) : undefined,
      });
      res.json(data);
    } catch (err) {
      handlePegasusError(err, res);
    }
  }
);

ordenesMedicasRouter.get("/api/pegasus/ordenesmedicas/:id", async (req, res) => {
  try {
    const idHub = req.query.id_hub ? String(req.query.id_hub) : undefined;
    const data = await fetchOrdenMedicaById(req.params.id, idHub);
    res.json(data);
  } catch (err) {
    handlePegasusError(err, res);
  }
});

/**
 * Version FHIR: llama a Pegasus y devuelve un Bundle con los recursos
 * derivados (Patient, RelatedPerson, Practitioner, Organization, Coverage,
 * ServiceRequest, Observation, DiagnosticReport, DocumentReference).
 * Transformacion en memoria; el sync que persiste de verdad vive en
 * /back-office/sync.
 */
ordenesMedicasRouter.get("/api/fhir/ordenesmedicas", async (req, res) => {
  try {
    const data = await fetchOrdenesMedicas(parseListQuery(req.query));
    const bundle = mapOrdenesToBundle(data.ordenes);
    res.json(bundle);
  } catch (err) {
    handlePegasusError(err, res);
  }
});

ordenesMedicasRouter.get("/api/fhir/ordenesmedicas/:id", async (req, res) => {
  try {
    const idHub = req.query.id_hub ? String(req.query.id_hub) : undefined;
    const orden = await fetchOrdenMedicaById(req.params.id, idHub);
    const bundle = mapOrdenToBundle(orden);
    res.json(bundle);
  } catch (err) {
    handlePegasusError(err, res);
  }
});
