/* =========================================================
   RENDER — Mis trámites
   Listado de expedientes del titular. Cada uno tiene número,
   estado y, si ya se resolvió, lo que OSPAN contestó.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  let filtro = "";

  function tarjeta(t) {
    return '<a class="record-item" href="afil-tramite-detalle.html?nro=' + encodeURIComponent(t.nro) + '">' +
      '<div class="record-item-top">' +
        '<p class="record-item-title">' + api.escapeHtml(t.titulo) + "</p>" +
        ui.chipEstado(t.estado) +
      "</div>" +
      '<p class="record-item-meta">' + api.escapeHtml(t.nro) + " &bull; " + api.fmtFecha(t.creadoEn) +
        (t.mascota && t.mascota.nombre ? " &bull; " + api.escapeHtml(t.mascota.nombre) : "") + "</p>" +
      (t.resolucion ? '<p class="resolucion">' + api.escapeHtml(t.resolucion) + "</p>" : "") +
    "</a>";
  }

  async function cargar() {
    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(3);
    try {
      const r = await api.tramites(filtro ? { estado: filtro } : null);
      const tramites = r.tramites || [];
      lista.innerHTML = tramites.length
        ? tramites.map(tarjeta).join("")
        : ui.vacio(filtro === "cerrados"
            ? "Todavía no tenés trámites cerrados."
            : "No tenés trámites en curso. Podés iniciar uno cuando lo necesites.");
    } catch (e) {
      lista.innerHTML = ui.vacio("No pudimos traer tus trámites.");
    }
  }

  function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("perfil");
    ui.montarVistaPreliminar("Vista preliminar — los trámites que inicies acá los está validando OSPAN");

    document.getElementById("filtros").addEventListener("click", function (ev) {
      const b = ev.target.closest("[data-estado]");
      if (!b) return;
      filtro = b.getAttribute("data-estado");
      document.querySelectorAll(".filtro-chip").forEach(function (x) {
        x.classList.toggle("is-active", x === b);
      });
      cargar();
    });

    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
