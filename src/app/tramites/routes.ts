/* =========================================================
   TRÁMITES — endpoints del afiliado
   -----------------------------------------------------------
   Todo bajo /api/app, con la sesión del login (DNI + código).

   Lo que se valida en cada alta, en este orden:
     1. Que el tipo de trámite exista.
     2. Si el trámite es sobre una mascota, que esa mascota SEA DEL
        TITULAR QUE INICIÓ SESIÓN. Se pregunta al padrón en cada
        request; no se confía en el idHub que manda la app.
     3. Que el formulario esté completo y bien tipado según el
        Questionnaire (respuesta.ts).
     4. Las reglas de negocio (reglas.ts).

   Recién entonces se abre el expediente y se le da número.
   ========================================================= */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { mascotaPerteneceATutor, type PadronPacienteConTutor } from "../deps";
import { requiereSesion } from "../auth";
import { catalogoPublico, canonicalDe, tipoTramite, TRAMITE_VERSION } from "./catalogo";
import { construirRespuesta, decodificarAdjuntos, RespuestaInvalida } from "./respuesta";
import { validarReglas, ReglaIncumplida } from "./reglas";
import * as db from "./db";
import { tramiteComoBundle, tramiteComoTask } from "./fhir";

export const tramitesRouter = Router();

/**
 * Cuestionario mínimo para la documentación que el afiliado agrega a un
 * trámite ya abierto (típicamente porque el back office se la pidió).
 */
const DOCUMENTACION_ADICIONAL = {
  resourceType: "Questionnaire" as const,
  status: "active" as const,
  item: [
    {
      linkId: "documentacion-adicional",
      text: "Documentación adicional",
      type: "attachment" as const,
      repeats: true,
    },
  ],
};

/* ---------------------------------------------------------
   Catálogo
   --------------------------------------------------------- */

tramitesRouter.get("/tramites/tipos", requiereSesion, (_req, res) => {
  res.json({ version: TRAMITE_VERSION, tipos: catalogoPublico() });
});

/** El Questionnaire: la app arma la pantalla con esto y nada más. */
tramitesRouter.get("/tramites/tipos/:codigo", requiereSesion, (req, res) => {
  const tipo = tipoTramite(req.params.codigo);
  if (!tipo) return res.status(404).json({ error: "Ese trámite no existe" });
  res.json({
    codigo: tipo.codigo,
    titulo: tipo.titulo,
    resumen: tipo.resumen,
    ambito: tipo.ambito,
    questionnaire: tipo.questionnaire,
  });
});

/* ---------------------------------------------------------
   Listado y alta
   --------------------------------------------------------- */

tramitesRouter.get("/tramites", requiereSesion, asyncH(async (req, res) => {
  const estado = req.query.estado === "abiertos" || req.query.estado === "cerrados"
    ? (req.query.estado as "abiertos" | "cerrados")
    : undefined;
  const filas = await db.listarTramites(req.asociado!.relatedPersonId, {
    estado,
    idHub: req.query.mascota ? String(req.query.mascota) : undefined,
  });
  res.json({ tramites: filas.map(publico) });
}));

tramitesRouter.post("/tramites", requiereSesion, asyncH(async (req, res) => {
  const tipo = tipoTramite(String(req.body?.tipo || ""));
  if (!tipo) return res.status(404).json({ error: "Ese trámite no existe" });

  const relatedPersonId = req.asociado!.relatedPersonId;

  // --- la mascota, contra el padrón, siempre ---
  let mascota: PadronPacienteConTutor | null = null;
  const idHub = String(req.body?.idHub || "").trim();

  if (tipo.ambito === "mascota" || (tipo.ambito === "opcional" && idHub)) {
    if (!idHub) return res.status(400).json({ error: "Elegí la mascota" });
    mascota = await mascotaPerteneceATutor(idHub, relatedPersonId);
    if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });
  }

  // --- el formulario ---
  let adjuntos;
  try {
    adjuntos = decodificarAdjuntos(req.body?.adjuntos, tipo.questionnaire);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  let armado;
  try {
    armado = construirRespuesta({
      questionnaire: tipo.questionnaire,
      items: req.body?.items,
      adjuntos,
      // El id definitivo del adjunto se conoce recién al insertarlo; la
      // URL se reescribe al leer el trámite. Acá queda el orden.
      urlAdjunto: (i) => `#adjunto-${i}`,
      subject: mascota
        ? { reference: `Patient/${mascota.id}` }
        : { reference: `RelatedPerson/${relatedPersonId}` },
      source: { reference: `RelatedPerson/${relatedPersonId}` },
    });
  } catch (e: any) {
    if (e instanceof RespuestaInvalida) {
      return res.status(400).json({ error: e.message, faltantes: e.faltantes });
    }
    throw e;
  }

  // --- las reglas ---
  try {
    validarReglas({
      tipo: tipo.codigo,
      valores: armado.valores,
      mascota,
      abiertosDelMismoTipo: await db.abiertosDelTipo(relatedPersonId, tipo.codigo, mascota?.id_hub ?? null),
    });
  } catch (e: any) {
    if (e instanceof ReglaIncumplida) return res.status(409).json({ error: e.message });
    throw e;
  }

  const creado = await db.crearTramite({
    tipo: tipo.codigo,
    titulo: tipo.titulo,
    questionnaire: canonicalDe(tipo),
    respuesta: armado.respuesta,
    relatedPersonId,
    patientId: mascota ? String(mascota.id) : null,
    idHub: mascota?.id_hub ?? null,
    mascotaNombre: mascota?.nombre ?? null,
    adjuntos,
  });

  res.status(201).json(publico(creado));
}));

/* ---------------------------------------------------------
   Detalle
   --------------------------------------------------------- */

tramitesRouter.get("/tramites/:nro", requiereSesion, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro, req.asociado!.relatedPersonId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });

  const [adjuntos, eventos] = await Promise.all([db.adjuntosDe(t.id), db.eventosDe(t.id)]);
  const tipo = tipoTramite(t.tipo);

  res.json({
    ...publico(t),
    // La respuesta guardada trae el texto de cada pregunta, así que el
    // detalle se dibuja con ella y no con el cuestionario actual: un
    // trámite de hace seis meses se sigue leyendo como se respondió.
    questionnaireResponse: conUrlsDeAdjuntos(t, adjuntos),
    // Solo para saber si el formulario cambió desde entonces.
    versionActual: tipo ? canonicalDe(tipo) : null,
    adjuntos: adjuntos.map((a) => ({
      id: a.id,
      linkId: a.link_id,
      etiqueta: a.etiqueta,
      nombre: a.nombre,
      contentType: a.content_type,
      bytes: a.bytes,
      origen: a.origen,
      url: `/api/app/tramites/${t.nro}/adjuntos/${a.id}`,
    })),
    eventos: eventos.map((e) => ({
      estado: e.estado,
      detalle: e.detalle,
      autor: e.autor,
      fecha: e.creado_en,
    })),
  });
}));

/** El trámite como recursos FHIR (Task + QuestionnaireResponse + adjuntos). */
tramitesRouter.get("/tramites/:nro/fhir", requiereSesion, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro, req.asociado!.relatedPersonId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  const [adjuntos, eventos] = await Promise.all([db.adjuntosDe(t.id), db.eventosDe(t.id)]);
  res.json(tramiteComoBundle({ ...t, respuesta: conUrlsDeAdjuntos(t, adjuntos) }, eventos, adjuntos));
}));

/* ---------------------------------------------------------
   Documentación
   --------------------------------------------------------- */

tramitesRouter.get("/tramites/:nro/adjuntos/:id", requiereSesion, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro, req.asociado!.relatedPersonId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });

  const a = await db.contenidoAdjunto(Number(req.params.id), req.asociado!.relatedPersonId);
  if (!a) return res.status(404).json({ error: "Archivo no encontrado" });

  res.setHeader("Content-Type", a.content_type || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", "inline");
  res.send(a.contenido);
}));

/** Agregar documentación a un trámite abierto (lo que pide el back office). */
tramitesRouter.post("/tramites/:nro/adjuntos", requiereSesion, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro, req.asociado!.relatedPersonId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  if (!db.ESTADOS_ABIERTOS.includes(t.estado)) {
    return res.status(409).json({ error: "Este trámite ya está cerrado" });
  }

  let adjuntos;
  try {
    // La documentación que se agrega después no corresponde a un ítem
    // del formulario original: entra con su propio linkId, contra un
    // cuestionario mínimo que solo declara ese adjunto.
    adjuntos = decodificarAdjuntos(req.body?.adjuntos, DOCUMENTACION_ADICIONAL);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
  if (!adjuntos.length) return res.status(400).json({ error: "Elegí al menos un archivo" });

  await db.agregarAdjuntos(t.id, adjuntos, String(req.body?.nota || "").slice(0, 500) || null);
  res.status(201).json({ ok: true });
}));

/** El afiliado da de baja su propio trámite mientras siga abierto. */
tramitesRouter.post("/tramites/:nro/anular", requiereSesion, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro, req.asociado!.relatedPersonId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  if (!db.ESTADOS_ABIERTOS.includes(t.estado)) {
    return res.status(409).json({ error: "Este trámite ya está cerrado" });
  }
  const actualizado = await db.cambiarEstado({
    nro: t.nro,
    estado: "anulado",
    autor: "afiliado",
    detalle: String(req.body?.motivo || "").slice(0, 500) || "Anulado por el afiliado",
    resolucion: "Anulado por el afiliado",
  });
  res.json(publico(actualizado!));
}));

/* ---------------------------------------------------------
   Presentación
   --------------------------------------------------------- */

const TEXTO_ESTADO: Record<db.EstadoTramite, string> = {
  abierto: "Ingresado",
  en_proceso: "En análisis",
  falta_documentacion: "Falta documentación",
  resuelto: "Resuelto",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

function publico(t: db.TramiteRow) {
  return {
    nro: t.nro,
    tipo: t.tipo,
    titulo: t.titulo,
    estado: t.estado,
    estadoTexto: TEXTO_ESTADO[t.estado] ?? t.estado,
    abierto: db.ESTADOS_ABIERTOS.includes(t.estado),
    mascota: t.id_hub ? { idHub: t.id_hub, nombre: t.mascota_nombre } : null,
    resolucion: t.resolucion,
    resueltoEn: t.resuelto_en,
    creadoEn: t.creado_en,
    actualizadoEn: t.actualizado_en,
    fhirStatus: tramiteComoTask(t).status,
  };
}

/**
 * Al guardar no se conocían los ids de los adjuntos (se insertan
 * después, en la misma transacción), así que el recurso quedó con un
 * marcador `#adjunto-N`. Acá se reemplaza por la URL real, en el
 * mismo orden en que se guardaron.
 */
function conUrlsDeAdjuntos(t: db.TramiteRow, adjuntos: db.AdjuntoRow[]) {
  const porOrden = adjuntos.filter((a) => a.origen === "afiliado");
  const json = JSON.stringify(t.respuesta).replace(/"#adjunto-(\d+)"/g, (_m, i) => {
    const a = porOrden[Number(i)];
    return JSON.stringify(a ? `/api/app/tramites/${t.nro}/adjuntos/${a.id}` : "");
  });
  return JSON.parse(json);
}

function asyncH(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
