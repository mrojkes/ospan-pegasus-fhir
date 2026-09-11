/* =========================================================
   RENDER — Detalle de una orden médica (Mis Resultados)
   Datos: GET /api/app/ordenes/:id. Adjuntos por proxy del backend
   (/api/app/ordenes/:id/adjuntos/:n) para no exponer las URLs
   públicas de Pegasus.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const RU = window.ResultadosUtils;

  const ICONS = {
    pdf: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 11h2"/></svg>',
    img: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  };

  function setText(id, v) { document.getElementById(id).textContent = RU.isEmptyValue(v) ? "—" : v; }

  function renderHero(o) {
    const st = RU.estado(o.estadoCodigo, o.estadoNombre);
    document.getElementById("orden-servicio").textContent = o.servicio || "Orden médica";
    const chip = document.getElementById("orden-estado");
    chip.textContent = st.label; chip.className = "status-chip " + st.cls;
    document.getElementById("orden-meta").textContent = "Orden N° " + o.id + " · " + api.fmtFecha(o.fecha);
  }

  function renderDatos(o, mascota) {
    setText("orden-mascota", mascota ? mascota.nombre + (mascota.raza ? " · " + mascota.raza : "") : (o.mascotaNombre || ""));
    setText("orden-fecha", api.fmtFecha(o.fecha));
    setText("orden-profesional", o.profesional);
    setText("orden-sucursal", o.sucursal);
    setText("orden-diagnostico", o.diagnostico);
  }

  function renderResultado(o) {
    const el = document.getElementById("orden-resultado");
    const st = RU.estado(o.estadoCodigo, o.estadoNombre);
    const html = RU.sanitizeHtml(o.resultadoHtml);
    if (html) { el.innerHTML = html; return; }
    const msg = st.grupo === "pendientes"
      ? "El resultado todavía no fue cargado por la veterinaria. Te va a aparecer acá cuando esté disponible."
      : "Esta orden no tiene informe cargado.";
    el.innerHTML = '<p class="empty-state">' + msg + "</p>";
  }

  function renderItems(o) {
    const items = o.items || [];
    if (!items.length) return;
    document.getElementById("seccion-items").classList.remove("hidden");
    document.getElementById("orden-items").innerHTML = items.map(function (it) {
      const vacio = RU.isEmptyValue(it.valor);
      return '<div class="item-row">' +
        '<span class="item-nombre">' + api.escapeHtml(it.nombre || "—") + "</span>" +
        '<span class="item-valor' + (vacio ? " is-empty" : "") + '">' + (vacio ? "sin valor cargado" : api.escapeHtml(it.valor) + (it.unidad ? " " + api.escapeHtml(it.unidad) : "")) + "</span>" +
        (RU.isEmptyValue(it.referencia) ? "" : '<span class="item-ref">Referencia: ' + api.escapeHtml(it.referencia) + "</span>") +
      "</div>";
    }).join("");
  }

  function renderAdjuntos(o) {
    const adj = o.adjuntos || [];
    if (!adj.length) return;
    document.getElementById("seccion-adjuntos").classList.remove("hidden");
    const mount = document.getElementById("orden-adjuntos");
    mount.innerHTML = adj.map(function (a, i) {
      const tipo = RU.tipoAdjunto(a);
      return '<button class="record-item adjunto-item" type="button" data-i="' + i + '">' +
        '<span class="adjunto-icon adjunto-icon--' + tipo + '">' + ICONS[tipo] + "</span>" +
        '<span class="adjunto-body">' +
          '<p class="adjunto-nombre">' + api.escapeHtml(a.nombre || "Adjunto " + (i + 1)) + "</p>" +
          '<p class="adjunto-tipo">' + ({ pdf: "Documento PDF", img: "Imagen", file: "Archivo" })[tipo] + "</p>" +
        "</span>" +
        '<svg class="entity-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      "</button>";
    }).join("");
    mount.querySelectorAll(".adjunto-item").forEach(function (b) {
      b.addEventListener("click", function () { abrirAdjunto(o, adj[Number(b.getAttribute("data-i"))]); });
    });
    // Liberar la memoria del archivo al cerrar el visor.
    document.querySelectorAll('[data-close-modal="modal-adjunto"]').forEach(function (btn) {
      btn.addEventListener("click", limpiarAdjunto);
    });
  }

  let adjuntoUrlActual = null;

  function limpiarAdjunto() {
    api.revocarAdjunto(adjuntoUrlActual);
    adjuntoUrlActual = null;
  }

  async function abrirAdjunto(o, a) {
    const tipo = RU.tipoAdjunto(a);
    const body = document.getElementById("adjunto-body");
    const abrir = document.getElementById("adjunto-abrir");

    limpiarAdjunto();
    document.getElementById("adjunto-titulo").textContent = a.nombre || "Adjunto";
    body.innerHTML = '<p class="empty-state">Abriendo el archivo…</p>';
    abrir.classList.add("hidden");
    window.ModalUtils.openModal("modal-adjunto");

    let descarga = null;
    try {
      descarga = await api.adjuntoBlobUrl(o.id, a.n != null ? a.n : 0);
    } catch (e) {
      body.innerHTML = '<p class="empty-state">No pudimos abrir este archivo' +
        (e.status === 502 ? ": la veterinaria no lo tiene disponible en este momento." : ". Probá de nuevo en un rato.") + "</p>";
      return;
    }
    if (!descarga) {
      body.innerHTML = '<p class="empty-state">Vista previa no disponible en modo demo.</p>';
      return;
    }

    adjuntoUrlActual = descarga.url;
    abrir.classList.remove("hidden");
    abrir.href = descarga.url;
    abrir.setAttribute("download", a.nombre || "adjunto");

    const esImagen = tipo === "img" || (descarga.tipo || "").startsWith("image/");
    const esPdf = tipo === "pdf" || (descarga.tipo || "").includes("pdf");
    if (esImagen) body.innerHTML = '<img src="' + descarga.url + '" alt="' + api.escapeHtml(a.nombre || "") + '">';
    else if (esPdf) body.innerHTML = '<iframe src="' + descarga.url + '#toolbar=0" title="' + api.escapeHtml(a.nombre || "PDF") + '"></iframe>';
    else body.innerHTML = '<p class="empty-state">Este archivo no tiene vista previa. Usá "Abrir / descargar".</p>';
  }

  function renderSolicitud(o) {
    const html = RU.sanitizeHtml(o.solicitudHtml);
    if (!html) { document.getElementById("seccion-solicitud").classList.add("hidden"); return; }
    document.getElementById("orden-solicitud").innerHTML = html;
  }

  function renderOrigen(o) {
    const el = document.getElementById("orden-origen");
    if (o.origen === "vivo") el.textContent = "Información consultada en línea a la veterinaria.";
    else if (o.actualizadoEn) el.textContent = "Última sincronización: " + api.fmtFecha(o.actualizadoEn);
    else el.textContent = "";
  }

  async function init() {
    if (!api.requireSession()) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("orden");
    const mascotaKey = params.get("mascota");
    if (mascotaKey) document.getElementById("back-link").href = "afil-resultados.html?mascota=" + encodeURIComponent(mascotaKey);

    let afiliado = null, o = null;
    try {
      afiliado = await api.me();
      o = await api.orden(id);
    } catch (e) {
      document.getElementById("detalle-loading").textContent = e.status === 404 ? "No encontramos esa orden." : "No pudimos cargar el estudio. Volvé a intentar.";
      return;
    }
    const mascota = afiliado.mascotas.find(function (m) { return m.idHub === (o.idHub || mascotaKey) || m.id === mascotaKey; }) || null;
    renderHero(o);
    renderDatos(o, mascota);
    renderResultado(o);
    renderItems(o);
    renderAdjuntos(o);
    renderSolicitud(o);
    renderOrigen(o);
    document.getElementById("detalle-loading").classList.add("hidden");
    document.getElementById("detalle-content").classList.remove("hidden");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
