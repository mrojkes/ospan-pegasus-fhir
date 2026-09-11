/* =========================================================
   RUTAS DE LAS FUNCIONALIDADES DEL MVP — /api/app/*
   Autorizaciones, turnos, copagos, reintegros, cartilla, DDJJ,
   comunidad y recordatorios.

   Misma regla que el resto de la app: ninguna ruta acepta un
   id_hub del cliente sin verificar contra el padrón que esa
   mascota es del tutor de la sesión.
   ========================================================= */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { mascotaPerteneceATutor, listarMascotasDeTutor } from "./deps";
import { requiereSesion } from "./auth";
import * as q from "./mvpQueries";
import {
  DDJJ_QUESTIONNAIRE, DDJJ_URL, DDJJ_VERSION,
  construirRespuesta, desdeFormatoPlano, DdjjInvalida,
} from "./ddjjQuestionnaire";

export const mvpRouter = Router();

/** Comprobantes: tope por archivo y por solicitud. */
const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024;
const MAX_ADJUNTOS = 4;

/* ================= cartilla ================= */

mvpRouter.get("/cartilla", requiereSesion, asyncH(async (req, res) => {
  const zona = typeof req.query.zona === "string" ? req.query.zona : null;
  res.json((await q.listarCartilla(zona)).map(prestadorPublico));
}));

mvpRouter.get("/cartilla/:id", requiereSesion, asyncH(async (req, res) => {
  const p = await q.prestadorPorId(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Prestador no encontrado" });
  res.json(prestadorPublico(p));
}));

/** Franjas libres de un prestador para una fecha. */
mvpRouter.get("/cartilla/:id/disponibilidad", requiereSesion, asyncH(async (req, res) => {
  const fecha = String(req.query.fecha || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida" });
  const p = await q.prestadorPorId(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Prestador no encontrado" });
  res.json({ fecha, horas: p.acepta_turnos ? await q.franjasDisponibles(p.id, fecha) : [] });
}));

/* ================= autorizaciones ================= */

mvpRouter.get("/autorizaciones", requiereSesion, asyncH(async (req, res) => {
  res.json((await q.listarAutorizaciones(req.asociado!.relatedPersonId)).map(solicitudPublica));
}));

mvpRouter.post("/autorizaciones", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaDelTutor(req, String(req.body?.idHub || ""));
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  const tipo = texto(req.body?.tipoPrestacion);
  if (!tipo) return res.status(400).json({ error: "Falta el tipo de prestación" });

  const prestador = await prestadorOpcional(req.body?.prestadorId);

  const creada = await q.crearAutorizacion({
    relatedPersonId: req.asociado!.relatedPersonId,
    patientId: mascota.id,
    idHub: mascota.id_hub,
    mascotaNombre: mascota.nombre,
    tipoPrestacion: tipo,
    prestadorId: prestador?.id ?? null,
    prestadorNombre: prestador?.nombre ?? null,
    diagnostico: texto(req.body?.diagnostico) || null,
    diagnosticoCodigo: texto(req.body?.diagnosticoCodigo) || null,
    observaciones: texto(req.body?.observaciones) || null,
  });
  res.status(201).json(solicitudPublica(creada));
}));

/* ================= turnos ================= */

mvpRouter.get("/turnos", requiereSesion, asyncH(async (req, res) => {
  res.json((await q.listarTurnos(req.asociado!.relatedPersonId)).map(turnoPublico));
}));

mvpRouter.post("/turnos", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaDelTutor(req, String(req.body?.idHub || ""));
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  const prestador = await prestadorOpcional(req.body?.prestadorId);
  if (!prestador) return res.status(400).json({ error: "Elegí una veterinaria" });

  const fecha = String(req.body?.fecha || "");
  const hora = String(req.body?.hora || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida" });
  if (!/^\d{2}:\d{2}$/.test(hora)) return res.status(400).json({ error: "Hora inválida" });
  if (fecha < hoy()) return res.status(400).json({ error: "No se puede pedir un turno para una fecha pasada" });

  // La franja pudo ocuparse entre que se mostró y se confirmó.
  const libres = await q.franjasDisponibles(prestador.id, fecha);
  if (!libres.includes(hora)) {
    return res.status(409).json({ error: "Esa franja ya no está disponible. Elegí otra." });
  }

  const creado = await q.crearTurno({
    relatedPersonId: req.asociado!.relatedPersonId,
    patientId: mascota.id,
    idHub: mascota.id_hub,
    mascotaNombre: mascota.nombre,
    prestadorId: prestador.id,
    prestadorNombre: prestador.nombre,
    motivo: texto(req.body?.motivo) || "Consulta general",
    fecha,
    hora,
  });
  res.status(201).json(turnoPublico(creado));
}));

/* ================= copagos ================= */

mvpRouter.get("/copagos", requiereSesion, asyncH(async (req, res) => {
  // El plan (100/200/300/400/410) todavía no es una columna del padrón
  // (ver PENDIENTES), así que se sirve la tabla general ('*'). Cuando se
  // sepa de dónde sale el plan, se pasa acá y los copagos salen por plan.
  const plan: string | null = null;
  const filas = await q.copagosDePlan(plan);
  res.json({
    plan,
    items: filas.map((f: any) => ({
      categoria: f.categoria,
      copago: Number(f.copago),
      cobertura: f.cobertura,
    })),
  });
}));

/* ================= reintegros ================= */

mvpRouter.get("/reintegros", requiereSesion, asyncH(async (req, res) => {
  res.json((await q.listarReintegros(req.asociado!.relatedPersonId)).map(reintegroPublico));
}));

mvpRouter.post("/reintegros", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaDelTutor(req, String(req.body?.idHub || ""));
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  const tipo = texto(req.body?.tipoPrestacion);
  if (!tipo) return res.status(400).json({ error: "Falta el tipo de prestación" });

  const monto = Number(req.body?.monto);
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "Monto inválido" });

  const fecha = String(req.body?.fechaPrestacion || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha inválida" });
  if (fecha > hoy()) return res.status(400).json({ error: "La fecha no puede ser futura" });

  let adjuntos;
  try {
    adjuntos = decodificarAdjuntos(req.body?.adjuntos);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
  if (!adjuntos.length) return res.status(400).json({ error: "Adjuntá al menos un comprobante" });

  const creado = await q.crearReintegro({
    relatedPersonId: req.asociado!.relatedPersonId,
    patientId: mascota.id,
    idHub: mascota.id_hub,
    mascotaNombre: mascota.nombre,
    tipoPrestacion: tipo,
    descripcion: texto(req.body?.descripcion) || null,
    monto,
    fechaPrestacion: fecha,
    adjuntos,
  });
  res.status(201).json(reintegroPublico({ ...creado, adjuntos: [] }));
}));

/** Descarga de un comprobante propio. */
mvpRouter.get("/reintegros/adjuntos/:id", requiereSesion, asyncH(async (req, res) => {
  const a = await q.adjuntoDeReintegro(Number(req.params.id), req.asociado!.relatedPersonId);
  if (!a) return res.status(404).json({ error: "Comprobante no encontrado" });
  res.setHeader("Content-Type", a.content_type || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", "inline");
  res.send(a.contenido);
}));

/* ================= DDJJ (FHIR Questionnaire) ================= */

/**
 * El cuestionario, para que la app se arme sola. Es un recurso FHIR
 * `Questionnaire`: la pantalla no tiene ninguna pregunta cableada.
 */
mvpRouter.get("/ddjj/questionnaire", requiereSesion, (_req, res) => {
  res.json(DDJJ_QUESTIONNAIRE);
});

mvpRouter.get("/mascotas/:idHub/ddjj", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaDelTutor(req, req.params.idHub);
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  const guardada = await q.ddjjActual(mascota.id_hub);

  let respuesta = guardada?.questionnaire_response ?? null;
  let origen: "app" | "padron" | "vacia" = guardada ? "app" : "vacia";

  // Si el tutor nunca respondió desde la app, se ofrece como punto de
  // partida lo que figura en su ficha de afiliación. El padrón NO se
  // modifica nunca: esto es solo el valor precargado en pantalla.
  if (!respuesta && mascota.has_preexisting_conditions != null) {
    respuesta = desdeFormatoPlano(
      {
        preexistentes: {
          respuesta: mascota.has_preexisting_conditions ? "si" : "no",
          detalle: mascota.preexisting_details || "",
        },
      },
      { patientId: mascota.id, relatedPersonId: req.asociado!.relatedPersonId }
    );
    origen = "padron";
  }

  res.json({
    questionnaire: DDJJ_QUESTIONNAIRE,
    questionnaireResponse: respuesta,
    actualizadaEn: guardada?.creada_en ?? null,
    // Con qué versión se respondió: si no coincide con la actual, la app
    // sabe que el cuestionario cambió desde entonces.
    versionRespondida: guardada?.questionnaire_version ?? null,
    versionActual: DDJJ_VERSION,
    origen,
    declaracionPadron: mascota.health_declaration || null,
  });
}));

mvpRouter.post("/mascotas/:idHub/ddjj", requiereSesion, asyncH(async (req, res) => {
  const mascota = await mascotaDelTutor(req, req.params.idHub);
  if (!mascota) return res.status(404).json({ error: "Mascota no encontrada" });

  // El QuestionnaireResponse se construye en el servidor a partir de los
  // items que mandó la app: se descarta lo que no esté en el cuestionario
  // y se verifica el tipo de cada respuesta. No se guarda un recurso
  // armado por el cliente.
  let qr;
  try {
    qr = construirRespuesta({
      items: req.body?.item ?? req.body?.items,
      patientId: mascota.id,
      relatedPersonId: req.asociado!.relatedPersonId,
    });
  } catch (e) {
    if (e instanceof DdjjInvalida) return res.status(400).json({ error: e.message });
    throw e;
  }

  const guardada = await q.guardarDdjj({
    relatedPersonId: req.asociado!.relatedPersonId,
    patientId: mascota.id,
    idHub: mascota.id_hub,
    questionnaireResponse: qr,
    questionnaireUrl: DDJJ_URL,
    questionnaireVersion: DDJJ_VERSION,
  });

  res.json({ ok: true, actualizadaEn: guardada.creada_en, questionnaireResponse: qr });
}));

/* ================= comunidad ================= */

mvpRouter.get("/comunidad", requiereSesion, asyncH(async (req, res) => {
  const tipo = typeof req.query.tipo === "string" && req.query.tipo !== "Todos" ? req.query.tipo : null;
  const filas = await q.listarComunidad(tipo);
  res.json(filas.map((c: any) => ({
    id: c.id, tipo: c.tipo, nombre: c.nombre, zona: c.zona, precio: c.precio,
    telefono: c.telefono, whatsapp: c.whatsapp,
    puntaje: c.puntaje != null ? Number(c.puntaje) : null,
    opiniones: c.opiniones, verificado: c.verificado, emoji: c.emoji,
  })));
}));

/* ================= recordatorios ================= */

mvpRouter.get("/recordatorios", requiereSesion, asyncH(async (req, res) => {
  const mascotas = await listarMascotasDeTutor(req.asociado!.documento, req.asociado!.relatedPersonId);
  const filas = await q.recordatoriosDeMascotas(mascotas.map((m) => m.id_hub));
  const porHub = new Map(mascotas.map((m) => [m.id_hub, m.nombre]));
  res.json(filas.map((r: any) => ({
    idHub: r.id_hub,
    mascota: porHub.get(r.id_hub) ?? "",
    titulo: r.titulo,
    detalle: r.detalle,
    fecha: fecha(r.fecha),
    tipo: r.tipo,
  })));
}));

/* ================= helpers ================= */

async function mascotaDelTutor(req: Request, idHub: string) {
  if (!idHub) return null;
  return mascotaPerteneceATutor(idHub, req.asociado!.relatedPersonId);
}

async function prestadorOpcional(id: unknown) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  return q.prestadorPorId(n);
}

function prestadorPublico(p: any) {
  return {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    zona: p.zona,
    direccion: p.direccion,
    telefono: p.telefono,
    horarioTexto: p.horario_texto,
    abierto: p.abierto,
    especialidades: p.especialidades ?? [],
    copago: p.copago != null ? Number(p.copago) : null,
    puntaje: p.puntaje != null ? Number(p.puntaje) : null,
    opiniones: p.opiniones ?? 0,
    aceptaTurnos: p.acepta_turnos ?? false,
  };
}

function solicitudPublica(a: any) {
  return {
    id: a.id, codigo: a.codigo, idHub: a.id_hub, mascota: a.mascota_nombre,
    tipoPrestacion: a.tipo_prestacion, prestador: a.prestador_nombre,
    diagnostico: a.diagnostico, diagnosticoCodigo: a.diagnostico_codigo,
    observaciones: a.observaciones, estado: a.estado,
    motivoResolucion: a.motivo_resolucion,
    fecha: fecha(a.creada_en), resueltaEn: fecha(a.resuelta_en),
  };
}

function turnoPublico(t: any) {
  return {
    id: t.id, codigo: t.codigo, idHub: t.id_hub, mascota: t.mascota_nombre,
    prestador: t.prestador_nombre, motivo: t.motivo,
    fecha: fecha(t.fecha), hora: String(t.hora).slice(0, 5),
    estado: t.estado, motivoResolucion: t.motivo_resolucion,
  };
}

function reintegroPublico(r: any) {
  return {
    id: r.id, codigo: r.codigo, idHub: r.id_hub, mascota: r.mascota_nombre,
    tipoPrestacion: r.tipo_prestacion, descripcion: r.descripcion,
    monto: Number(r.monto),
    montoAprobado: r.monto_aprobado != null ? Number(r.monto_aprobado) : null,
    fechaPrestacion: fecha(r.fecha_prestacion), estado: r.estado,
    motivoResolucion: r.motivo_resolucion,
    fecha: fecha(r.creada_en),
    adjuntos: r.adjuntos ?? [],
  };
}

/**
 * Los comprobantes llegan como data URL (la app los lee con FileReader).
 * Evita sumar multer al proyecto por una sola pantalla, y el tamaño se
 * controla igual.
 */
function decodificarAdjuntos(entrada: unknown) {
  if (!Array.isArray(entrada)) return [];
  if (entrada.length > MAX_ADJUNTOS) throw new Error(`Máximo ${MAX_ADJUNTOS} comprobantes`);
  return entrada.map((a: any) => {
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(a?.contenido || ""));
    if (!m) throw new Error("Comprobante con formato inválido");
    const contentType = m[1];
    if (!/^(image\/|application\/pdf)/.test(contentType)) {
      throw new Error("Solo se aceptan imágenes o PDF");
    }
    const contenido = Buffer.from(m[2], "base64");
    if (contenido.length > MAX_ADJUNTO_BYTES) throw new Error("Cada archivo puede pesar hasta 5 MB");
    return { nombre: String(a?.nombre || "comprobante").slice(0, 200), contentType, contenido };
  });
}

function texto(v: unknown): string {
  return String(v ?? "").trim().slice(0, 1000);
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function fecha(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function asyncH(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
