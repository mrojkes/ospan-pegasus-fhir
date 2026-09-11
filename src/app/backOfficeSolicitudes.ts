/* =========================================================
   BACK OFFICE — solicitudes de la App Asociado
   Pantalla para que OSPAN resuelva lo que los afiliados piden
   desde la app: autorizaciones, turnos y reintegros.

   Va en su propio router (`/back-office/solicitudes`) y NO toca
   `routes/backOffice.ts`, que ya está probado en producción.

   Sin auth propia todavía, igual que el resto del back office:
   pendiente para antes de exponerlo fuera de una red controlada.
   ========================================================= */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { getPool } from "./deps";

export const backOfficeSolicitudesRouter = Router();

const TABLAS = {
  autorizaciones: {
    tabla: "solicitud_autorizacion",
    titulo: "Autorizaciones",
    estados: ["pendiente", "aprobada", "rechazada", "anulada"],
    resolver: { aprobar: "aprobada", rechazar: "rechazada" },
  },
  turnos: {
    tabla: "turno",
    titulo: "Turnos",
    estados: ["solicitado", "confirmado", "cancelado", "realizado"],
    resolver: { aprobar: "confirmado", rechazar: "cancelado" },
  },
  reintegros: {
    tabla: "reintegro",
    titulo: "Reintegros",
    estados: ["pendiente", "aprobado", "rechazado"],
    resolver: { aprobar: "aprobado", rechazar: "rechazado" },
  },
} as const;

type Seccion = keyof typeof TABLAS;

backOfficeSolicitudesRouter.get("/back-office/solicitudes", asyncH(async (req, res) => {
  const seccion = (String(req.query.tipo || "autorizaciones") as Seccion);
  const cfg = TABLAS[seccion] ?? TABLAS.autorizaciones;
  const soloPendientes = req.query.pendientes !== "0";

  const { rows } = await getPool().query(
    `select * from app_asociado.${cfg.tabla}
      ${soloPendientes ? `where estado in ('pendiente','solicitado')` : ""}
      order by creada_en desc limit 200`
  );

  res.type("html").send(pagina(seccion, cfg.titulo, rows, soloPendientes));
}));

backOfficeSolicitudesRouter.post("/back-office/solicitudes/:tipo/:id", asyncH(async (req, res) => {
  const seccion = req.params.tipo as Seccion;
  const cfg = TABLAS[seccion];
  if (!cfg) return res.status(404).send("Sección desconocida");

  const accion = String(req.body?.accion || "");
  const nuevo = (cfg.resolver as Record<string, string>)[accion];
  if (!nuevo) return res.status(400).send("Acción inválida");

  const motivo = String(req.body?.motivo || "").slice(0, 500) || null;

  if (seccion === "reintegros" && accion === "aprobar") {
    const monto = Number(req.body?.montoAprobado);
    await getPool().query(
      `update app_asociado.reintegro
          set estado = $1, motivo_resolucion = $2, monto_aprobado = coalesce($3, monto),
              resuelta_en = now()
        where id = $4`,
      [nuevo, motivo, Number.isFinite(monto) && monto > 0 ? monto : null, Number(req.params.id)]
    );
  } else {
    await getPool().query(
      `update app_asociado.${cfg.tabla}
          set estado = $1, motivo_resolucion = $2, resuelta_en = now()
        where id = $3`,
      [nuevo, motivo, Number(req.params.id)]
    );
  }

  res.redirect(`/back-office/solicitudes?tipo=${seccion}`);
}));

/* ---------------- vista ---------------- */

function pagina(seccion: Seccion, titulo: string, filas: any[], soloPendientes: boolean): string {
  const tabs = (Object.keys(TABLAS) as Seccion[])
    .map((s) => `<a class="tab ${s === seccion ? "on" : ""}" href="/back-office/solicitudes?tipo=${s}">${TABLAS[s].titulo}</a>`)
    .join("");

  const cuerpo = filas.length
    ? filas.map((f) => tarjeta(seccion, f)).join("")
    : `<p class="vacio">No hay solicitudes ${soloPendientes ? "pendientes" : ""} en esta sección.</p>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${titulo} — App Asociado</title>
<style>
 body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;background:#f8fafc;color:#0f172a}
 .wrap{max-width:900px;margin:0 auto;padding:24px 16px 60px}
 h1{font-size:22px;margin:0 0 4px}
 .sub{color:#64748b;font-size:14px;margin:0 0 20px}
 .tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
 .tab{padding:8px 14px;border-radius:999px;background:#fff;border:1px solid #e2e8f0;text-decoration:none;color:#334155;font-size:14px;font-weight:600}
 .tab.on{background:#001753;border-color:#001753;color:#fff}
 .filtro{font-size:13px;color:#64748b;margin-bottom:16px;display:block}
 .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:12px}
 .top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
 .tit{font-weight:700;margin:0}
 .meta{color:#64748b;font-size:13px;margin:4px 0 0}
 .chip{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap}
 .pendiente,.solicitado{background:#fffbeb;color:#b45309}
 .aprobada,.aprobado,.confirmado,.realizado{background:#ecfdf5;color:#047857}
 .rechazada,.rechazado,.cancelado,.anulada{background:#fef2f2;color:#b91c1c}
 form{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 input[type=text],input[type=number]{padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:13px;flex:1;min-width:180px}
 button{padding:8px 16px;border:0;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
 .ok{background:#047857;color:#fff}
 .no{background:#fff;color:#b91c1c;border:1px solid #fecaca}
 .vacio{color:#64748b;text-align:center;padding:40px 0}
 .det{font-size:13px;color:#334155;margin:8px 0 0;line-height:1.5}
 a.volver{font-size:13px;color:#64748b}
</style></head><body><div class="wrap">
 <a class="volver" href="/back-office">← Back office</a>
 <h1>Solicitudes de la App Asociado</h1>
 <p class="sub">Lo que los afiliados piden desde la app. Resolver acá cambia lo que ven en su celular.</p>
 <div class="tabs">${tabs}</div>
 <a class="filtro" href="/back-office/solicitudes?tipo=${seccion}&pendientes=${soloPendientes ? "0" : "1"}">
   ${soloPendientes ? "Ver todas (incluye resueltas)" : "Ver solo pendientes"}
 </a>
 ${cuerpo}
</div></body></html>`;
}

function tarjeta(seccion: Seccion, f: any): string {
  const pendiente = f.estado === "pendiente" || f.estado === "solicitado";

  const titulo =
    seccion === "autorizaciones" ? f.tipo_prestacion
    : seccion === "turnos" ? `${f.motivo} · ${fecha(f.fecha)} ${String(f.hora).slice(0, 5)}`
    : `${f.tipo_prestacion} · ${pesos(f.monto)}`;

  const detalles: string[] = [];
  if (seccion === "autorizaciones") {
    if (f.diagnostico) detalles.push(`Diagnóstico: ${esc(f.diagnostico)}${f.diagnostico_codigo ? ` (${esc(f.diagnostico_codigo)})` : ""}`);
    if (f.observaciones) detalles.push(esc(f.observaciones));
  }
  if (seccion === "reintegros") {
    if (f.descripcion) detalles.push(esc(f.descripcion));
    detalles.push(`Prestación del ${fecha(f.fecha_prestacion)}`);
    if (f.monto_aprobado) detalles.push(`Aprobado: ${pesos(f.monto_aprobado)}`);
  }
  if (f.motivo_resolucion) detalles.push(`Resolución: ${esc(f.motivo_resolucion)}`);

  const acciones = pendiente
    ? `<form method="post" action="/back-office/solicitudes/${seccion}/${f.id}">
         ${seccion === "reintegros" ? `<input type="number" name="montoAprobado" step="0.01" min="0" placeholder="Monto a reconocer (opcional)">` : ""}
         <input type="text" name="motivo" placeholder="Motivo o nota (opcional)">
         <button class="ok" name="accion" value="aprobar">${seccion === "turnos" ? "Confirmar" : "Aprobar"}</button>
         <button class="no" name="accion" value="rechazar">${seccion === "turnos" ? "Cancelar" : "Rechazar"}</button>
       </form>`
    : "";

  return `<div class="card">
    <div class="top">
      <div>
        <p class="tit">${esc(titulo)}</p>
        <p class="meta">${esc(f.mascota_nombre || "—")}${f.prestador_nombre ? ` · ${esc(f.prestador_nombre)}` : ""}</p>
        <p class="meta">${esc(f.codigo)} · ${fecha(f.creada_en)}</p>
      </div>
      <span class="chip ${esc(f.estado)}">${esc(f.estado)}</span>
    </div>
    ${detalles.length ? `<p class="det">${detalles.join("<br>")}</p>` : ""}
    ${acciones}
  </div>`;
}

function pesos(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "—";
}

function fecha(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-AR");
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
