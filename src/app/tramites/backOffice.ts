/* =========================================================
   BACK OFFICE — trámites de la App Asociado
   Pantalla para que OSPAN trabaje los expedientes: tomarlos,
   pedir documentación y resolverlos. Lo que se hace acá es lo que
   el afiliado ve en el seguimiento de su celular.

   Router propio, en la misma línea que `backOfficeSolicitudes.ts`:
   sin auth todavía (pendiente antes de exponerlo fuera de una red
   controlada), HTML server-side y sin dependencias.
   ========================================================= */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import * as db from "./db";
import { TIPOS_TRAMITE, tipoTramite } from "./catalogo";
import { tramiteComoBundle } from "./fhir";
import type { QuestionnaireResponseItem } from "../../fhir/types/questionnaire";

export const backOfficeTramitesRouter = Router();

const BASE = "/back-office/tramites";

backOfficeTramitesRouter.get(BASE, asyncH(async (req, res) => {
  const estado = String(req.query.estado || "abiertos");
  const tipo = String(req.query.tipo || "");
  const filas = await db.listarParaBackOffice({ estado, tipo: tipo || undefined });
  res.type("html").send(listado(filas, estado, tipo));
}));

backOfficeTramitesRouter.get(`${BASE}/:nro`, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro);
  if (!t) return res.status(404).send("Trámite no encontrado");
  const [adjuntos, eventos] = await Promise.all([db.adjuntosDe(t.id), db.eventosDe(t.id, false)]);
  res.type("html").send(detalle(t, adjuntos, eventos));
}));

/** El expediente completo como FHIR, para auditoría o integración. */
backOfficeTramitesRouter.get(`${BASE}/:nro/fhir`, asyncH(async (req, res) => {
  const t = await db.obtenerTramite(req.params.nro);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  const [adjuntos, eventos] = await Promise.all([db.adjuntosDe(t.id), db.eventosDe(t.id, false)]);
  res.json(tramiteComoBundle(t, eventos, adjuntos));
}));

backOfficeTramitesRouter.get(`${BASE}/:nro/adjuntos/:id`, asyncH(async (req, res) => {
  const a = await db.contenidoAdjunto(Number(req.params.id));
  if (!a) return res.status(404).send("Archivo no encontrado");
  res.setHeader("Content-Type", a.content_type || "application/octet-stream");
  res.setHeader("Content-Disposition", "inline");
  res.send(a.contenido);
}));

const ACCIONES: Record<string, db.EstadoTramite> = {
  tomar: "en_proceso",
  documentacion: "falta_documentacion",
  resolver: "resuelto",
  rechazar: "rechazado",
};

backOfficeTramitesRouter.post(`${BASE}/:nro`, asyncH(async (req, res) => {
  const estado = ACCIONES[String(req.body?.accion || "")];
  if (!estado) return res.status(400).send("Acción inválida");

  const nota = String(req.body?.nota || "").slice(0, 1000) || null;
  if ((estado === "resuelto" || estado === "rechazado" || estado === "falta_documentacion") && !nota) {
    return res.status(400).send("Escribí qué le contestamos al afiliado");
  }

  const actualizado = await db.cambiarEstado({
    nro: req.params.nro,
    estado,
    detalle: nota,
    resolucion: estado === "en_proceso" ? null : nota,
    resueltoPor: String(req.body?.operador || "").slice(0, 120) || "back office",
    autor: "ospan",
  });
  if (!actualizado) return res.status(404).send("Trámite no encontrado");

  res.redirect(`${BASE}/${encodeURIComponent(req.params.nro)}`);
}));

/* ---------------------------------------------------------
   Vistas
   --------------------------------------------------------- */

function layout(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} — App Asociado</title>
<style>
 body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;background:#f8fafc;color:#0f172a}
 .wrap{max-width:900px;margin:0 auto;padding:24px 16px 60px}
 h1{font-size:22px;margin:0 0 4px}
 h2{font-size:15px;margin:24px 0 8px;color:#334155}
 .sub{color:#64748b;font-size:14px;margin:0 0 20px}
 .tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
 .tab{padding:8px 14px;border-radius:999px;background:#fff;border:1px solid #e2e8f0;text-decoration:none;color:#334155;font-size:14px;font-weight:600}
 .tab.on{background:#001753;border-color:#001753;color:#fff}
 .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:12px}
 .top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
 .tit{font-weight:700;margin:0}
 .tit a{color:inherit;text-decoration:none}
 .meta{color:#64748b;font-size:13px;margin:4px 0 0}
 .chip{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap}
 .abierto{background:#eff6ff;color:#1d4ed8}
 .en_proceso{background:#fffbeb;color:#b45309}
 .falta_documentacion{background:#fff7ed;color:#c2410c}
 .resuelto{background:#ecfdf5;color:#047857}
 .rechazado,.anulado{background:#fef2f2;color:#b91c1c}
 table{width:100%;border-collapse:collapse;font-size:14px}
 td{padding:6px 0;vertical-align:top;border-bottom:1px solid #f1f5f9}
 td.k{color:#64748b;width:45%;padding-right:12px}
 ul{margin:8px 0;padding-left:18px;font-size:14px}
 form{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 input[type=text]{padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:13px;flex:1;min-width:220px}
 button{padding:8px 16px;border:0;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:#e2e8f0;color:#0f172a}
 button.ok{background:#047857;color:#fff}
 button.no{background:#fff;color:#b91c1c;border:1px solid #fecaca}
 .vacio{color:#64748b;text-align:center;padding:40px 0}
 a.volver{font-size:13px;color:#64748b}
 .hist{font-size:13px;color:#334155;line-height:1.6}
 .hist b{color:#0f172a}
</style></head><body><div class="wrap">${cuerpo}</div></body></html>`;
}

function listado(filas: db.TramiteRow[], estado: string, tipo: string): string {
  const filtros = [
    ["abiertos", "Abiertos"],
    ["falta_documentacion", "Falta documentación"],
    ["resuelto", "Resueltos"],
    ["rechazado", "Rechazados"],
    ["", "Todos"],
  ]
    .map(([v, t]) => `<a class="tab ${estado === v ? "on" : ""}" href="${BASE}?estado=${v}${tipo ? `&tipo=${encodeURIComponent(tipo)}` : ""}">${t}</a>`)
    .join("");

  const porTipo =
    `<form method="get" action="${BASE}">
       <input type="hidden" name="estado" value="${esc(estado)}">
       <select name="tipo" onchange="this.form.submit()" style="padding:8px;border-radius:8px;border:1px solid #cbd5e1;font:inherit">
         <option value="">Todos los tipos</option>
         ${TIPOS_TRAMITE.map((t) => `<option value="${esc(t.codigo)}" ${t.codigo === tipo ? "selected" : ""}>${esc(t.titulo)}</option>`).join("")}
       </select>
     </form>`;

  const cuerpo = filas.length
    ? filas.map(tarjeta).join("")
    : `<p class="vacio">No hay trámites con ese filtro.</p>`;

  return layout(
    "Trámites",
    `<a class="volver" href="/back-office">← Back office</a>
     <h1>Trámites de la App Asociado</h1>
     <p class="sub">Expedientes que abren los afiliados. Cada cambio de estado se le muestra en el celular.</p>
     <div class="tabs">${filtros}</div>
     ${porTipo}
     ${cuerpo}`
  );
}

function tarjeta(t: db.TramiteRow): string {
  return `<div class="card">
    <div class="top">
      <div>
        <p class="tit"><a href="${BASE}/${encodeURIComponent(t.nro)}">${esc(t.titulo)}</a></p>
        <p class="meta">${esc(t.nro)} · ${fecha(t.creado_en)}${t.mascota_nombre ? ` · ${esc(t.mascota_nombre)}` : ""}</p>
      </div>
      <span class="chip ${esc(t.estado)}">${esc(t.estado.replace(/_/g, " "))}</span>
    </div>
  </div>`;
}

function detalle(t: db.TramiteRow, adjuntos: db.AdjuntoRow[], eventos: db.EventoRow[]): string {
  const tipo = tipoTramite(t.tipo);
  const cambioVersion = tipo && t.questionnaire !== `${tipo.questionnaire.url}|${tipo.questionnaire.version}`;

  const respuestas = filas(t.respuesta?.item ?? [])
    .map((f) => `<tr><td class="k">${esc(f.pregunta)}</td><td>${esc(f.valor)}</td></tr>`)
    .join("");

  const docs = adjuntos.length
    ? `<ul>${adjuntos
        .map(
          (a) =>
            `<li><a href="${BASE}/${encodeURIComponent(t.nro)}/adjuntos/${a.id}" target="_blank">${esc(a.nombre)}</a>` +
            ` <span class="meta">${esc(a.etiqueta ?? a.link_id)} · ${Math.round(a.bytes / 1024)} KB · ${esc(a.origen)}</span></li>`
        )
        .join("")}</ul>`
    : `<p class="meta">Sin documentación adjunta.</p>`;

  const historial = eventos
    .map(
      (e) =>
        `<p class="hist"><b>${esc(e.estado.replace(/_/g, " "))}</b> · ${fecha(e.creado_en)} · ${esc(e.autor)}<br>${esc(e.detalle ?? "")}</p>`
    )
    .join("");

  const abierto = db.ESTADOS_ABIERTOS.includes(t.estado);
  const acciones = abierto
    ? `<form method="post" action="${BASE}/${encodeURIComponent(t.nro)}">
         <input type="text" name="nota" placeholder="Qué le contestamos al afiliado">
         <input type="text" name="operador" placeholder="Tu nombre" style="max-width:160px">
         <button name="accion" value="tomar">Tomar</button>
         <button name="accion" value="documentacion">Pedir documentación</button>
         <button class="ok" name="accion" value="resolver">Resolver</button>
         <button class="no" name="accion" value="rechazar">Rechazar</button>
       </form>`
    : `<p class="meta">Cerrado el ${fecha(t.resuelto_en)}${t.resuelto_por ? ` por ${esc(t.resuelto_por)}` : ""}.</p>`;

  return layout(
    t.nro,
    `<a class="volver" href="${BASE}">← Trámites</a>
     <h1>${esc(t.titulo)}</h1>
     <p class="sub">${esc(t.nro)} · ${fecha(t.creado_en)}${t.mascota_nombre ? ` · ${esc(t.mascota_nombre)}` : ""}
       · <span class="chip ${esc(t.estado)}">${esc(t.estado.replace(/_/g, " "))}</span></p>
     ${cambioVersion ? `<p class="meta">Respondido con ${esc(t.questionnaire)}; el formulario ya tiene una versión más nueva.</p>` : ""}
     <div class="card"><h2 style="margin-top:0">Lo que completó el afiliado</h2>
       <table>${respuestas || `<tr><td class="meta">Sin respuestas.</td></tr>`}</table></div>
     <div class="card"><h2 style="margin-top:0">Documentación</h2>${docs}</div>
     <div class="card"><h2 style="margin-top:0">Seguimiento</h2>${historial}${acciones}</div>
     <p class="meta"><a href="${BASE}/${encodeURIComponent(t.nro)}/fhir" target="_blank">Ver el expediente como FHIR (Task + QuestionnaireResponse + DocumentReference)</a></p>`
  );
}

/** Aplana el QuestionnaireResponse a pares pregunta/respuesta. */
function filas(items: QuestionnaireResponseItem[]): Array<{ pregunta: string; valor: string }> {
  const salida: Array<{ pregunta: string; valor: string }> = [];
  for (const it of items) {
    const a = it.answer?.[0];
    if (a) {
      salida.push({ pregunta: it.text ?? it.linkId, valor: valorTexto(it) });
      if (a.item) salida.push(...filas(a.item));
    } else if (it.item) {
      salida.push(...filas(it.item));
    }
  }
  return salida;
}

function valorTexto(it: QuestionnaireResponseItem): string {
  return (it.answer ?? [])
    .map((a) => {
      if (a.valueBoolean !== undefined) return a.valueBoolean ? "Sí" : "No";
      if (a.valueAttachment) return a.valueAttachment.title ?? "archivo";
      if (a.valueDecimal !== undefined) return String(a.valueDecimal);
      if (a.valueInteger !== undefined) return String(a.valueInteger);
      if (a.valueDate !== undefined) return a.valueDate;
      if (a.valueCoding) return a.valueCoding.display ?? a.valueCoding.code ?? "";
      return a.valueString ?? "";
    })
    .filter(Boolean)
    .join(" · ");
}

function fecha(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-AR");
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function asyncH(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
