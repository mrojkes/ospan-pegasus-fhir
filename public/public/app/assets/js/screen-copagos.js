/* =========================================================
   RENDER — Copagos
   Tabla de cuánto paga el afiliado por categoría y qué porcentaje
   cubre el plan.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("inicio");
    ui.montarVistaPreliminar("Vista preliminar — valores de referencia, pendientes de confirmar con OSPAN");

    const lista = document.getElementById("lista");
    try {
      const r = await api.copagos();
      if (!r.items.length) {
        lista.innerHTML = ui.vacio("Todavía no hay copagos cargados.");
        return;
      }
      lista.innerHTML = r.items.map(function (c) {
        return '<div class="item-row">' +
          '<span class="item-nombre">' + api.escapeHtml(c.categoria) + "</span>" +
          '<span class="item-valor">' + api.fmtPesos(c.copago) + "</span>" +
          '<span class="item-ref">Cobertura del plan: ' + c.cobertura + "%</span>" +
        "</div>";
      }).join("");
      document.getElementById("vigencia").textContent =
        r.plan ? "Valores del plan " + r.plan + "." : "Valores generales de la cobertura.";
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar los copagos.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
