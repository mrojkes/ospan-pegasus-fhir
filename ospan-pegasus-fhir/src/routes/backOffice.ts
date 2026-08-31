import { Router } from "express";
import { escapeHtml, estadoBadge, renderPage } from "../views/layout";
import { extraerPartes } from "../views/bundleHelpers";
import { sincronizarPorFecha } from "../services/syncPorFecha";
import {
  historialSyncRuns,
  listHistorialPorOrden,
  reportePorEstado,
  reportePorProfesional,
} from "../persistence/ordenMedicaRepo";
import {
  buscarPacientePorDocumentoTutor,
  buscarPacientePorIdHub,
  buscarPacientesPorNombreMascota,
  PacienteEncontrado,
} from "../services/patientSearch";
import { obtenerEstudiosPaciente } from "../services/estudios";

export const backOfficeRouter = Router();

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
backOfficeRouter.get("/back-office", (_req, res) => {
  res.send(
    renderPage(
      "Inicio",
      `
      <div class="card">
        <h2>Prototipo · Repositorio de Datos Clínicos OSPAN</h2>
        <p class="muted">
          Conecta contra Pegasus (Panda HIS) para órdenes médicas y contra
          el padrón OSPAN/OMINT (Postgres, AWS) para identificar pacientes.
          Todo lo que se muestra queda persistido y versionado por estado.
        </p>
        <div class="grid">
          <div class="card">
            <h3>1. Sincronizar</h3>
            <p>Traer las órdenes de una fecha (o rango corto) y persistirlas.</p>
            <a class="btn" href="/back-office/sync">Ir a sincronizar</a>
          </div>
          <div class="card">
            <h3>2. Buscar paciente</h3>
            <p>Por DNI del tutor, por id_hub o por nombre de la mascota.</p>
            <a class="btn" href="/back-office/pacientes">Ir a buscar</a>
          </div>
          <div class="card">
            <h3>3. Reportes</h3>
            <p>Órdenes por profesional y por estado.</p>
            <a class="btn" href="/back-office/reportes">Ver reportes</a>
          </div>
        </div>
      </div>
      `,
      "/back-office"
    )
  );
});

// ---------------------------------------------------------------------
// Sync por fecha (2.1)
// ---------------------------------------------------------------------
backOfficeRouter.get("/back-office/sync", async (req, res) => {
  await renderSyncPage(req, res);
});

backOfficeRouter.post("/back-office/sync", async (req, res) => {
  const desde = String(req.body?.desde ?? "");
  const hasta = req.body?.hasta ? String(req.body.hasta) : undefined;
  const coberturaRaw = req.body?.cobertura ? String(req.body.cobertura) : "";
  const cobertura = coberturaRaw ? Number(coberturaRaw) : undefined;

  let resultadoHtml = "";
  if (!desde) {
    resultadoHtml = `<div class="error">Elegí al menos la fecha "desde".</div>`;
  } else {
    try {
      const resultado = await sincronizarPorFecha(desde, hasta, cobertura);
      resultadoHtml = `
        <div class="card">
          <h3>Resultado</h3>
          <p>
            Rango <strong>${escapeHtml(resultado.desde)}</strong> a
            <strong>${escapeHtml(resultado.hasta)}</strong>:
            ${resultado.cantidadOrdenesPegasus} órdenes recibidas de Pegasus,
            <strong>${resultado.cantidadVersionesNuevas}</strong> versiones nuevas
            persistidas, ${resultado.cantidadSinCambios} sin cambio de estado.
            ${resultado.truncado ? '<span class="badge warn">truncado por top</span>' : ""}
          </p>
        </div>`;
    } catch (err) {
      resultadoHtml = `<div class="error">Error sincronizando: ${escapeHtml(
        err instanceof Error ? err.message : String(err)
      )}</div>`;
    }
  }

  await renderSyncPage(req, res, resultadoHtml, desde, hasta);
});

async function renderSyncPage(
  req: import("express").Request,
  res: import("express").Response,
  resultadoHtml = "",
  desdeValor?: string,
  hastaValor?: string
) {
  let historialHtml = "";
  try {
    const runs = await historialSyncRuns(15);
    historialHtml = `
      <table>
        <thead><tr><th>Fecha corrida</th><th>Tipo</th><th>Parámetros</th><th>Pegasus</th><th>Nuevas versiones</th><th>Estado</th></tr></thead>
        <tbody>
          ${runs
            .map(
              (r: any) => `
            <tr>
              <td>${escapeHtml(new Date(r.iniciado_at).toLocaleString("es-AR"))}</td>
              <td>${escapeHtml(r.tipo)}</td>
              <td class="muted">${escapeHtml(JSON.stringify(r.parametros))}</td>
              <td>${r.cantidad_ordenes_pegasus ?? "-"}</td>
              <td>${r.cantidad_versiones_nuevas ?? "-"}</td>
              <td>${
                r.estado === "ok"
                  ? '<span class="badge ok">ok</span>'
                  : r.estado === "error"
                    ? `<span class="badge danger" title="${escapeHtml(r.error ?? "")}">error</span>`
                    : '<span class="badge warn">corriendo</span>'
              }</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  } catch (err) {
    historialHtml = `<div class="error">No se pudo leer el historial de syncs (¿está configurada la base? ver .env): ${escapeHtml(
      err instanceof Error ? err.message : String(err)
    )}</div>`;
  }

  res.send(
    renderPage(
      "Sincronizar por fecha",
      `
      <div class="card">
        <h2>Sincronizar órdenes por fecha</h2>
        <p class="muted">
          Usa <code>GET /api/ordenesmedicas/porfecha</code> (trae todas las
          coberturas, no solo OSPAN) y persiste una versión nueva por cada
          orden cuyo estado cambió desde la última sync.
        </p>
        <form method="post" action="/back-office/sync">
          <label>Desde</label>
          <input type="date" name="desde" value="${escapeHtml(desdeValor ?? hoyISO())}" required />
          <label>Hasta (opcional, máximo 31 días desde "desde")</label>
          <input type="date" name="hasta" value="${escapeHtml(hastaValor ?? "")}" />
          <label>Cobertura (opcional, código numérico -- vacío = todas)</label>
          <input type="text" name="cobertura" placeholder="1 = OSPAN" />
          <button type="submit">Sincronizar</button>
        </form>
      </div>
      ${resultadoHtml}
      <div class="card">
        <h3>Últimas corridas</h3>
        ${historialHtml}
      </div>
      `,
      "/back-office/sync"
    )
  );
}

// ---------------------------------------------------------------------
// Búsqueda de paciente (2.2)
// ---------------------------------------------------------------------
backOfficeRouter.get("/back-office/pacientes", async (req, res) => {
  const documento = req.query.documento ? String(req.query.documento) : "";
  const idHub = req.query.id_hub ? String(req.query.id_hub) : "";
  const nombre = req.query.nombre ? String(req.query.nombre) : "";

  let resultados: PacienteEncontrado[] = [];
  let avisos: string[] = [];
  let errorHtml = "";

  try {
    if (documento) {
      const r = await buscarPacientePorDocumentoTutor(documento);
      resultados = r.resultados;
      avisos = r.avisos;
    } else if (idHub) {
      const r = await buscarPacientePorIdHub(idHub);
      resultados = r ? [r] : [];
    } else if (nombre) {
      resultados = await buscarPacientesPorNombreMascota(nombre);
    }
  } catch (err) {
    errorHtml = `<div class="error">Error buscando: ${escapeHtml(
      err instanceof Error ? err.message : String(err)
    )}</div>`;
  }

  const resultadosHtml = resultados.length
    ? `<table>
        <thead><tr><th>Mascota</th><th>Tutor</th><th>Origen</th><th>id_hub</th><th>IdPaciente (Pegasus)</th><th></th></tr></thead>
        <tbody>
        ${resultados
          .map((p) => {
            const nombreMascota =
              p.padron?.nombre ?? p.pegasus?.PacienteNombre ?? "(sin nombre)";
            const tutor =
              p.padron?.tutor?.nombre || p.padron?.tutor?.apellido
                ? `${p.padron.tutor?.nombre ?? ""} ${p.padron.tutor?.apellido ?? ""}`.trim()
                : (p.pegasus?.TutorNombre ?? "-");
            const origen = [
              p.enPadron ? '<span class="badge ok">padrón</span>' : "",
              p.enPegasus ? '<span class="badge neutral">pegasus</span>' : "",
            ]
              .filter(Boolean)
              .join(" ");
            const params = new URLSearchParams();
            if (p.idHub) params.set("id_hub", p.idHub);
            if (p.idPaciente) params.set("id_paciente", String(p.idPaciente));
            return `<tr>
              <td>${escapeHtml(nombreMascota)}</td>
              <td>${escapeHtml(tutor)}</td>
              <td>${origen}</td>
              <td class="muted">${escapeHtml(p.idHub ?? "-")}</td>
              <td class="muted">${escapeHtml(p.idPaciente ?? "-")}</td>
              <td><a class="btn secondary" href="/back-office/estudios?${params.toString()}">Ver estudios</a></td>
            </tr>`;
          })
          .join("")}
        </tbody>
      </table>`
    : documento || idHub || nombre
      ? `<p class="muted">Sin resultados.</p>`
      : "";

  res.send(
    renderPage(
      "Buscar paciente",
      `
      <div class="card">
        <h2>Buscar paciente</h2>
        <p class="muted">
          Puede estar en el padrón OSPAN/OMINT, en Pegasus (aunque no sea
          afiliado), en ambos, o en ninguno todavía.
        </p>
        <form method="get" action="/back-office/pacientes">
          <div class="grid">
            <div>
              <label>DNI del tutor</label>
              <input type="text" name="documento" value="${escapeHtml(documento)}" placeholder="Ej: 29317482" />
            </div>
            <div>
              <label>id_hub (OSPAN)</label>
              <input type="text" name="id_hub" value="${escapeHtml(idHub)}" placeholder="pet_a1b2c3" />
            </div>
            <div>
              <label>Nombre de la mascota</label>
              <input type="text" name="nombre" value="${escapeHtml(nombre)}" placeholder="Bamba" />
            </div>
          </div>
          <button type="submit">Buscar</button>
        </form>
      </div>
      ${errorHtml}
      ${avisos.map((a) => `<div class="aviso">${escapeHtml(a)}</div>`).join("")}
      ${resultados.length || documento || idHub || nombre ? `<div class="card">${resultadosHtml}</div>` : ""}
      `,
      "/back-office/pacientes"
    )
  );
});

// ---------------------------------------------------------------------
// Ficha de estudios (2.3, 2.4, 2.5)
// ---------------------------------------------------------------------
backOfficeRouter.get("/back-office/estudios", async (req, res) => {
  const idHub = req.query.id_hub ? String(req.query.id_hub) : undefined;
  const idPaciente = req.query.id_paciente
    ? String(req.query.id_paciente)
    : undefined;
  const tutorDocumento = req.query.tutor_documento
    ? String(req.query.tutor_documento)
    : undefined;
  const fresh = req.query.fresh === "1";

  if (!idHub && !idPaciente && !tutorDocumento) {
    res.send(
      renderPage(
        "Estudios",
        `<div class="card"><p>Elegí un paciente desde <a href="/back-office/pacientes">Buscar paciente</a>.</p></div>`,
        "/back-office/pacientes"
      )
    );
    return;
  }

  let bodyHtml = "";
  try {
    const resultado = await obtenerEstudiosPaciente({
      idHub,
      idPaciente,
      tutorDocumento,
      fresh,
    });

    const refreshParams = new URLSearchParams(
      req.query as Record<string, string>
    );
    refreshParams.set("fresh", "1");

    bodyHtml = `
      <div class="card">
        <h2>Estudios ${idHub ? `· id_hub ${escapeHtml(idHub)}` : idPaciente ? `· IdPaciente ${escapeHtml(idPaciente)}` : ""}</h2>
        <p class="muted">
          Fuente: <strong>${resultado.fuente === "local" ? "base FHIR local (ya sincronizada)" : "consulta en vivo a Pegasus, recién persistida"}</strong>
          ${resultado.nuevasVersiones ? ` · ${resultado.nuevasVersiones} versión(es) nueva(s) guardada(s) recién` : ""}
          · <a href="/back-office/estudios?${refreshParams.toString()}">forzar traer en vivo de Pegasus</a>
        </p>
      </div>
      ${resultado.ordenes.length === 0 ? '<div class="card"><p class="muted">No hay órdenes para este paciente.</p></div>' : ""}
      ${(
        await Promise.all(resultado.ordenes.map((o) => renderOrdenCard(o)))
      ).join("")}
    `;
  } catch (err) {
    bodyHtml = `<div class="error">Error obteniendo estudios: ${escapeHtml(
      err instanceof Error ? err.message : String(err)
    )}</div>`;
  }

  res.send(renderPage("Estudios", bodyHtml, "/back-office/pacientes"));
});

async function renderOrdenCard(o: any): Promise<string> {
  const partes = extraerPartes(o.fhir_bundle);
  const historial = await listHistorialPorOrden(o.id_orden_medica);

  const itemsHtml = partes.observations
    .map((obs) => {
      const valor = obs.valueQuantity
        ? `${obs.valueQuantity.value ?? ""} ${obs.valueQuantity.unit ?? ""}`
        : (obs.valueString ?? "(sin valor cargado)");
      return `<tr>
        <td>${escapeHtml(obs.code.text)}</td>
        <td>${escapeHtml(obs.status)}</td>
        <td>${escapeHtml(valor)}</td>
      </tr>`;
    })
    .join("");

  const adjuntosHtml = partes.documentRefs
    .map((d) => {
      const url = d.content[0]?.attachment.url ?? "#";
      const esImagen = (d.content[0]?.attachment.contentType ?? "").startsWith(
        "image/"
      );
      return esImagen
        ? `<a class="adjunto-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">
             <img src="${escapeHtml(url)}" alt="adjunto" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #e2e5ea;display:block;" />
           </a>`
        : `<a class="adjunto-link btn secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ver PDF</a>`;
    })
    .join("");

  const historialHtml =
    historial.length > 1
      ? `<details>
          <summary>Historial de estados (${historial.length} versión(es))</summary>
          <table>
            <thead><tr><th>Versión</th><th>Estado</th><th>Sincronizado</th></tr></thead>
            <tbody>
              ${historial
                .map(
                  (h: any) => `<tr>
                    <td>${h.version}</td>
                    <td>${estadoBadge(h.id_estado, h.estado_nombre)}</td>
                    <td class="muted">${escapeHtml(new Date(h.synced_at).toLocaleString("es-AR"))}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </details>`
      : "";

  return `
    <div class="card">
      <h3>Orden #${o.id_orden_medica} ${estadoBadge(o.id_estado, o.estado_nombre)}</h3>
      <p class="muted">
        ${escapeHtml(o.fecha_orden ? new Date(o.fecha_orden).toLocaleString("es-AR") : "")}
        · Servicio: ${escapeHtml(o.servicio_nombre ?? "-")}
        · Solicitó: ${escapeHtml(o.medico_nombre ?? "-")}
        · Cobertura: ${escapeHtml(o.cobertura_nombre ?? "-")}
      </p>
      ${itemsHtml ? `<table><thead><tr><th>Práctica</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ""}
      ${adjuntosHtml ? `<div style="margin-top:10px;">${adjuntosHtml}</div>` : ""}
      ${historialHtml}
    </div>
  `;
}

// ---------------------------------------------------------------------
// Reportes (2.6)
// ---------------------------------------------------------------------
backOfficeRouter.get("/back-office/reportes", async (req, res) => {
  const desde = req.query.desde ? String(req.query.desde) : undefined;
  const hasta = req.query.hasta ? String(req.query.hasta) : undefined;

  let bodyHtml = "";
  try {
    const [porEstado, porProfesional] = await Promise.all([
      reportePorEstado(desde, hasta),
      reportePorProfesional(desde, hasta),
    ]);

    bodyHtml = `
      <div class="card">
        <h3>Por estado</h3>
        <table>
          <thead><tr><th>Estado</th><th>Cantidad</th></tr></thead>
          <tbody>
            ${porEstado
              .map(
                (r: any) =>
                  `<tr><td>${estadoBadge(r.id_estado, r.estado_nombre)}</td><td>${r.cantidad}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>Por profesional solicitante</h3>
        <table>
          <thead><tr><th>Profesional</th><th>Órdenes</th><th>Realizadas</th></tr></thead>
          <tbody>
            ${porProfesional
              .map(
                (r: any) =>
                  `<tr><td>${escapeHtml(r.medico_nombre)}</td><td>${r.cantidad_ordenes}</td><td>${r.cantidad_realizadas}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    bodyHtml = `<div class="error">Error generando reportes: ${escapeHtml(
      err instanceof Error ? err.message : String(err)
    )}</div>`;
  }

  res.send(
    renderPage(
      "Reportes",
      `
      <div class="card">
        <h2>Reportes</h2>
        <p class="muted">Sobre el estado ACTUAL de cada orden (última versión), no sobre el historial completo.</p>
        <form method="get" action="/back-office/reportes">
          <div class="grid">
            <div><label>Desde</label><input type="date" name="desde" value="${escapeHtml(desde ?? "")}" /></div>
            <div><label>Hasta</label><input type="date" name="hasta" value="${escapeHtml(hasta ?? "")}" /></div>
          </div>
          <button type="submit">Filtrar</button>
        </form>
      </div>
      ${bodyHtml}
      `,
      "/back-office/reportes"
    )
  );
});
