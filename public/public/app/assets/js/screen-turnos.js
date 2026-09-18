/* =========================================================
   RENDER — Turnos
   Lista lo pedido. Reservar arranca desde la cartilla, porque el
   turno es con una veterinaria puntual.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;

  function renderLista(items) {
    const lista = document.getElementById("lista");
    document.getElementById("conteo").textContent =
      items.length + (items.length === 1 ? " turno" : " turnos");

    if (!items.length) {
      lista.innerHTML = ui.vacio("No tenés turnos pedidos. Reservá uno desde la cartilla.");
      return;
    }
    lista.innerHTML = items.map(function (t) {
      return '<div class="record-item">' +
        '<div class="record-item-top">' +
          '<p class="record-item-title">' + api.escapeHtml(t.motivo) + "</p>" +
          ui.chipEstado(t.estado) +
        "</div>" +
        '<p class="record-item-meta">' + api.escapeHtml(t.prestador || "") +
          "<br>" + api.escapeHtml(t.mascota || "") + " &bull; " + api.escapeHtml(t.codigo) + "</p>" +
        '<span class="turno-cuando">' + api.fmtFecha(t.fecha) + " &bull; " + api.escapeHtml(t.hora) + " hs</span>" +
        (t.motivoResolucion ? '<p class="resolucion">' + api.escapeHtml(t.motivoResolucion) + "</p>" : "") +
      "</div>";
    }).join("");
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("inicio");
    ui.montarVistaPreliminar("Vista preliminar — las veterinarias todavía no confirman en línea");

    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(2);
    try {
      renderLista(await api.turnos());
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar tus turnos.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
