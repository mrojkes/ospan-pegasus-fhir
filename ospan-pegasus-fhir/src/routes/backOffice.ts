import { Router } from "express";
import { escapeHtml, estadoBadge, renderPage } from "../views/layout";
import { extraerPartes } from "../views/bundleHelpers";
import { sincronizarPorFecha } from "../services/syncPorFecha";
import {
  historialSyncRuns,
  listHistorialPorOrden,
  reportePorEstado,
  reportePorProfesional,
  listOrdenesPorProfesional,
} from "../persistence/ordenMedicaRepo";
import {
  buscarPacientePorDocumentoTutor,
  buscarPacientePorIdHub,
  buscarPacientesPorNombreMascota,
  PacienteEncontrado,
} from "../services/patientSearch";
import { obtenerEstudiosPaciente } from "../services/estudios";
import type { OrdenMedicaActualRow } from "../persistence/ordenMedicaRepo";

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
              <input type="text" name="id_hub" value="${escapeHtml(idHub)}" placeholder="pet_a1b2c3d4e5f6789" />
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
      ${resultado.ordenes.length > 0 ? renderPacienteHeader(resultado.ordenes[0]) : ""}
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

/**
 * Encabezado de la ficha de estudios: datos de la mascota y del tutor,
 * tomados del `raw_pegasus` de la primera orden (todas las órdenes de una
 * misma búsqueda son de la misma mascota, así que alcanza con la primera).
 * No viene de una tabla propia -- es el mismo JSON de Pegasus que ya se
 * persiste con cada orden.
 */
function renderPacienteHeader(primera: OrdenMedicaActualRow): string {
  const raw = primera.raw_pegasus;
  const fechaNac = raw.PacienteFechaNac
    ? new Date(raw.PacienteFechaNac).toLocaleDateString("es-AR")
    : "-";
  const especieRaza = [raw.EspecieNombre, raw.RazaNombre]
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="card paciente-header">
      <h2>${escapeHtml(raw.PacienteNombre ?? "(sin nombre)")}${especieRaza ? ` <span class="especie">${escapeHtml(especieRaza)}</span>` : ""}</h2>
      <p class="muted">
        Nacimiento: ${escapeHtml(fechaNac)}
        · Tutor: ${escapeHtml(raw.TutorNombre ?? "-")}
        · Documento: ${escapeHtml(raw.TutorDocumento != null ? String(raw.TutorDocumento) : "-")}
      </p>
    </div>
  `;
}

async function renderOrdenCard(o: OrdenMedicaActualRow): Promise<string> {
  const partes = extraerPartes(o.fhir_bundle);
  const historial = await listHistorialPorOrden(o.id_orden_medica);
  const raw = o.raw_pegasus;

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

  // Diagnostico/EvoOrdenMedica/EvoOrdenMedicaResultados no se mapearon a
  // FHIR (ver README) -- se muestran directo desde el raw_pegasus
  // persistido. Diagnostico es texto plano (se escapa). EvoOrdenMedica y
  // EvoOrdenMedicaResultados vienen de Pegasus YA como HTML de
  // presentación (con <br>, <p>, <h4>, <strong> -- así lo define su propia
  // API, ver pegasusTypes.ts), así que se insertan tal cual, sin escapar,
  // para que se vean formateados como los arma Pegasus. Se confía en el
  // HTML de este sistema de origen; no es contenido tipeado por un usuario
  // de este back office.
  const diagnostico =
    raw.Diagnostico && raw.Diagnostico.trim() && raw.Diagnostico !== "-"
      ? `<p><strong>Diagnóstico:</strong> ${escapeHtml(raw.Diagnostico)}</p>`
      : "";
  // Se muestran en un <dialog> (modal nativo del navegador, sin JS de
  // terceros) en vez de siempre visibles en la tarjeta: son bloques de
  // HTML que pueden ser largos (informes, listas de adjuntos) y con
  // varias órdenes en pantalla ensuciaban la ficha.
  const dialogId = `detalle-${o.id_orden_medica}`;
  const evoSolicitud = raw.EvoOrdenMedica
    ? `<div class="field-label">Solicitud médica</div><div class="evo-block">${raw.EvoOrdenMedica}</div>`
    : "";
  const evoResultados = raw.EvoOrdenMedicaResultados
    ? `<div class="field-label">Resultados</div><div class="evo-block">${raw.EvoOrdenMedicaResultados}</div>`
    : "";
  const tieneDetalle = Boolean(evoSolicitud || evoResultados);
  const botonDetalle = tieneDetalle
    ? `<button type="button" class="btn secondary" style="margin-top:10px;" onclick="document.getElementById('${dialogId}').showModal()">Ver solicitud y resultado</button>
       <dialog id="${dialogId}" class="detalle-dialog">
         <div class="dialog-inner">
           <form method="dialog"><button type="submit" class="dialog-close" aria-label="Cerrar">&times;</button></form>
           <h3 style="margin-top:0;">Orden #${o.id_orden_medica}</h3>
           ${evoSolicitud}
           ${evoResultados}
         </div>
       </dialog>`
    : "";

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
      ${diagnostico}
      ${itemsHtml ? `<table><thead><tr><th>Práctica</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ""}
      ${botonDetalle}
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

  // Link "Ver" de cada fila del reporte por profesional -- medico_nombre
  // puede ser null (fila "(sin solicitante)"), se manda como "" y del otro
  // lado (/reportes/profesional) una cadena vacía se interpreta como null.
  const linkVerProfesional = (nombre: string | null) => {
    const params = new URLSearchParams({ medico: nombre ?? "" });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    return `/back-office/reportes/profesional?${params.toString()}`;
  };

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
          <thead><tr><th>Profesional</th><th>Órdenes</th><th>Realizadas</th><th></th></tr></thead>
          <tbody>
            ${porProfesional
              .map(
                (r: any) =>
                  `<tr><td>${escapeHtml(r.medico_nombre ?? "(sin solicitante)")}</td><td>${r.cantidad_ordenes}</td><td>${r.cantidad_realizadas}</td><td><a class="btn secondary" href="${linkVerProfesional(r.medico_nombre)}">Ver</a></td></tr>`
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

/**
 * Detalle ("Ver") de las órdenes de un profesional solicitante, disparado
 * desde la fila del reporte "Por profesional solicitante". Solo
 * encabezado por orden (tutor, mascota, fecha, servicio, estado) -- para
 * el detalle completo de una orden puntual hay que ir a la ficha de
 * estudios de esa mascota.
 */
backOfficeRouter.get("/back-office/reportes/profesional", async (req, res) => {
  const medicoParam = req.query.medico;
  // "" (o ausente) == sin solicitante -- ver nota en listOrdenesPorProfesional.
  const medico =
    medicoParam !== undefined && String(medicoParam) !== ""
      ? String(medicoParam)
      : null;
  const desde = req.query.desde ? String(req.query.desde) : undefined;
  const hasta = req.query.hasta ? String(req.query.hasta) : undefined;

  const volverParams = new URLSearchParams();
  if (desde) volverParams.set("desde", desde);
  if (hasta) volverParams.set("hasta", hasta);
  const volverHref = `/back-office/reportes${volverParams.toString() ? `?${volverParams.toString()}` : ""}`;

  let bodyHtml = "";
  try {
    const ordenes = await listOrdenesPorProfesional(medico, desde, hasta);
    bodyHtml =
      ordenes.length === 0
        ? `<div class="card"><p class="muted">No hay órdenes para este profesional en el rango elegido.</p></div>`
        : `
      <div class="card">
        <table>
          <thead><tr><th>Tutor</th><th>Mascota</th><th>Fecha</th><th>Servicio</th><th>Estado</th></tr></thead>
          <tbody>
            ${ordenes
              .map(
                (o) => `<tr>
                  <td>${escapeHtml(o.tutor_nombre ?? "-")}${o.tutor_documento ? ` <span class="muted">(${escapeHtml(o.tutor_documento)})</span>` : ""}</td>
                  <td>${escapeHtml(o.paciente_nombre ?? "-")}</td>
                  <td>${escapeHtml(o.fecha_orden ? new Date(o.fecha_orden).toLocaleString("es-AR") : "-")}</td>
                  <td>${escapeHtml(o.servicio_nombre ?? "-")}</td>
                  <td>${estadoBadge(o.id_estado, o.estado_nombre)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    bodyHtml = `<div class="error">Error obteniendo las órdenes: ${escapeHtml(
      err instanceof Error ? err.message : String(err)
    )}</div>`;
  }

  res.send(
    renderPage(
      "Órdenes por profesional",
      `
      <div class="card">
        <h2>${escapeHtml(medico ?? "(sin solicitante)")}</h2>
        <p class="muted">
          ${desde || hasta ? `Rango: ${escapeHtml(desde ?? "(sin desde)")} a ${escapeHtml(hasta ?? desde ?? "")}` : "Todas las fechas"}
          · <a href="${volverHref}">volver a reportes</a>
        </p>
      </div>
      ${bodyHtml}
      `,
      "/back-office/reportes"
    )
  );
});
