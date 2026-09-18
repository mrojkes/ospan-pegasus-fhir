/* =========================================================
   RENDER — Autorizaciones
   El afiliado pide una autorización y sigue su estado. Quien la
   resuelve es OSPAN, desde /back-office/solicitudes.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  let afiliado = null;

  function renderLista(items) {
    const lista = document.getElementById("lista");
    document.getElementById("conteo").textContent =
      items.length + (items.length === 1 ? " solicitud" : " solicitudes");

    if (!items.length) {
      lista.innerHTML = ui.vacio("Todavía no pediste ninguna autorización.");
      return;
    }
    lista.innerHTML = items.map(function (a) {
      return '<div class="record-item">' +
        '<div class="record-item-top">' +
          '<p class="record-item-title">' + api.escapeHtml(a.tipoPrestacion) + "</p>" +
          ui.chipEstado(a.estado) +
        "</div>" +
        '<p class="record-item-meta">' + api.escapeHtml(a.mascota || "") +
          (a.prestador ? " &bull; " + api.escapeHtml(a.prestador) : "") +
          "<br>" + api.escapeHtml(a.codigo) + " &bull; " + api.fmtFecha(a.fecha) + "</p>" +
        (a.diagnostico ? '<p class="record-item-meta">Diagnóstico: ' + api.escapeHtml(a.diagnostico) +
          (a.diagnosticoCodigo ? " (" + api.escapeHtml(a.diagnosticoCodigo) + ")" : "") + "</p>" : "") +
        (a.motivoResolucion ? '<p class="resolucion">' + api.escapeHtml(a.motivoResolucion) + "</p>" : "") +
      "</div>";
    }).join("");
  }

  async function cargar() {
    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(2);
    try {
      renderLista(await api.autorizaciones());
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar tus autorizaciones.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  function toggleForm(abrir) {
    document.getElementById("form-panel").classList.toggle("hidden", !abrir);
    document.getElementById("nueva-btn").classList.toggle("hidden", abrir);
    document.getElementById("form-error").classList.add("hidden");
    if (abrir) document.getElementById("f-mascota").focus();
  }

  async function enviar(ev) {
    ev.preventDefault();
    const err = document.getElementById("form-error");
    const btn = document.getElementById("enviar-btn");
    err.classList.add("hidden");
    btn.disabled = true;
    try {
      await api.crearAutorizacion({
        idHub: document.getElementById("f-mascota").value,
        tipoPrestacion: document.getElementById("f-tipo").value,
        prestadorId: document.getElementById("f-prestador").value || null,
        diagnostico: document.getElementById("f-diag").value,
        diagnosticoCodigo: document.getElementById("f-cie").value,
        observaciones: document.getElementById("f-obs").value,
      });
      document.getElementById("form-panel").reset();
      toggleForm(false);
      await cargar();
    } catch (e) {
      err.textContent = e.message || "No pudimos enviar la solicitud.";
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("inicio");
    ui.montarVistaPreliminar("Vista preliminar — el circuito de aprobación está en validación con OSPAN");

    document.getElementById("nueva-btn").addEventListener("click", function () { toggleForm(true); });
    document.getElementById("cancelar-btn").addEventListener("click", function () { toggleForm(false); });
    document.getElementById("form-panel").addEventListener("submit", enviar);

    try {
      afiliado = await api.me();
      document.getElementById("f-mascota").innerHTML = ui.opcionesMascota(afiliado);
    } catch (_) {}

    try {
      const cartilla = await api.cartilla();
      document.getElementById("f-prestador").innerHTML =
        '<option value="">Sin preferencia</option>' +
        cartilla.map(function (p) {
          return '<option value="' + p.id + '">' + api.escapeHtml(p.nombre) + "</option>";
        }).join("");
    } catch (_) {}

    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
