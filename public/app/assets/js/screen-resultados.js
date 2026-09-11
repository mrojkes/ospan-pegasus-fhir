/* =========================================================
   RENDER — Mis Resultados (lista de órdenes por mascota)
   Datos: GET /api/app/mascotas/:idHub/ordenes (backend local-first
   sobre fhir_repo con fallback en vivo a Pegasus).
   ========================================================= */
(function () {
  const api = window.AppApi;
  const RU = window.ResultadosUtils;
  let afiliado = null;
  let mascotaActual = null;
  let ordenes = [];
  let filtro = "todas";

  const ICON_CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

  function renderPetSelector() {
    const mount = document.getElementById("pet-selector");
    mount.innerHTML = afiliado.mascotas.map(function (m) {
      const key = m.idHub || m.id;
      const active = mascotaActual && (mascotaActual.idHub || mascotaActual.id) === key;
      const avatar = m.foto ? '<img src="' + m.foto + '" alt="">' : api.escapeHtml(m.iniciales || m.nombre.slice(0, 2).toUpperCase());
      return '<button class="pet-chip' + (active ? " is-active" : "") + '" type="button" role="tab" aria-selected="' + active + '" data-key="' + api.escapeHtml(key) + '">' +
        '<span class="pet-chip-avatar">' + avatar + '</span>' + api.escapeHtml(m.nombre) + '</button>';
    }).join("");
    mount.querySelectorAll(".pet-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        const key = b.getAttribute("data-key");
        mascotaActual = api.findMascota(afiliado, key);
        history.replaceState(null, "", "afil-resultados.html?mascota=" + encodeURIComponent(key));
        renderPetSelector();
        cargarOrdenes();
      });
    });
  }

  function aplicarFiltro(list) {
    if (filtro === "todas") return list;
    return list.filter(function (o) { return RU.estado(o.estadoCodigo, o.estadoNombre).grupo === filtro; });
  }

  function renderOrdenes() {
    const list = document.getElementById("ordenes-list");
    const visibles = aplicarFiltro(ordenes).slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    document.getElementById("resultados-title").textContent = "Órdenes de " + mascotaActual.nombre;
    document.getElementById("resultados-count").textContent = visibles.length + (visibles.length === 1 ? " orden" : " órdenes");

    if (!visibles.length) {
      list.innerHTML = '<p class="empty-state">' + (ordenes.length ? "No hay órdenes con ese filtro." : "Todavía no hay estudios cargados para " + api.escapeHtml(mascotaActual.nombre) + ".") + "</p>";
      return;
    }
    list.innerHTML = visibles.map(function (o) {
      const st = RU.estado(o.estadoCodigo, o.estadoNombre);
      const nAdj = (o.adjuntos && o.adjuntos.length) || o.adjuntosCount || 0;
      const tieneInforme = o.tieneInforme != null ? o.tieneInforme : !RU.isEmptyValue(o.resultadoHtml);
      return '<a class="record-item orden-item" href="afil-resultado-detalle.html?orden=' + encodeURIComponent(o.id) + '&mascota=' + encodeURIComponent(mascotaActual.idHub || mascotaActual.id) + '">' +
        '<div class="record-item-top">' +
          '<p class="record-item-title">' + api.escapeHtml(o.servicio || "Orden médica") + "</p>" +
          '<span class="status-chip ' + st.cls + '">' + st.label + "</span>" +
        "</div>" +
        '<p class="record-item-meta">' + api.fmtFecha(o.fecha) + (o.sucursal ? " &bull; " + api.escapeHtml(o.sucursal) : "") + (o.profesional ? "<br>" + api.escapeHtml(o.profesional) : "") + "</p>" +
        '<div class="orden-item-badges">' +
          (tieneInforme ? '<span class="mini-tag">' + ICON_DOC + "Informe</span>" : "") +
          (nAdj ? '<span class="mini-tag">' + ICON_CLIP + nAdj + (nAdj === 1 ? " adjunto" : " adjuntos") + "</span>" : "") +
        "</div>" +
        '<svg class="entity-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      "</a>";
    }).join("");
  }

  async function cargarOrdenes() {
    const list = document.getElementById("ordenes-list");
    list.innerHTML = '<div class="record-item"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div>' +
      '<div class="record-item"><div class="skeleton-line" style="width:70%"></div><div class="skeleton-line" style="width:35%"></div></div>';
    document.getElementById("resultados-count").textContent = "…";
    try {
      const r = await api.ordenesDeMascota(mascotaActual.idHub || mascotaActual.id);
      ordenes = r.ordenes || [];
      renderOrdenes();
    } catch (e) {
      ordenes = [];
      list.innerHTML = '<p class="empty-state">No pudimos traer los estudios' + (e.status ? " (" + e.status + ")" : "") + '. <a href="#" id="retry">Reintentar</a></p>';
      document.getElementById("retry").addEventListener("click", function (ev) { ev.preventDefault(); cargarOrdenes(); });
      document.getElementById("resultados-count").textContent = "—";
    }
  }

  function wireFilters() {
    document.querySelectorAll("#filter-chips .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        filtro = b.getAttribute("data-filter");
        document.querySelectorAll("#filter-chips .filter-chip").forEach(function (x) { x.classList.toggle("is-active", x === b); });
        renderOrdenes();
      });
    });
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("resultados");
    wireFilters();
    try { afiliado = await api.me(); } catch (_) {
      document.getElementById("ordenes-list").innerHTML = '<p class="empty-state">No pudimos cargar tus datos.</p>';
      return;
    }
    const params = new URLSearchParams(window.location.search);
    mascotaActual = api.findMascota(afiliado, params.get("mascota"));
    if (!mascotaActual) {
      document.getElementById("ordenes-list").innerHTML = '<p class="empty-state">No tenés mascotas asociadas.</p>';
      return;
    }
    renderPetSelector();
    cargarOrdenes();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
