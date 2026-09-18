/* =========================================================
   RENDER — Salud (historia clínica)
   Los registros salen de las órdenes médicas de Pegasus: son
   hechos clínicos reales, no un resumen inventado. Lo que no
   tenemos (vacunas, peso, controles) no se muestra en vez de
   rellenarse con datos de ejemplo.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const RU = window.ResultadosUtils;
  let afiliado = null;
  let mascota = null;

  function renderHero() {
    document.getElementById("health-hero").innerHTML =
      '<div class="orden-hero">' +
        '<div class="orden-hero-top">' +
          '<p class="orden-hero-servicio">' + api.escapeHtml(mascota.nombre) + "</p>" +
          '<span class="status-chip status-chip--realizada">' + api.escapeHtml(mascota.estado || "activo") + "</span>" +
        "</div>" +
        '<p class="orden-hero-meta">' +
          [mascota.raza, mascota.especie].filter(Boolean).map(api.escapeHtml).join(" &bull; ") +
          (mascota.fechaNacimiento ? "<br>Nacimiento: " + api.fmtFecha(mascota.fechaNacimiento) : "") +
          (mascota.alta ? "<br>Alta en OSPAN: " + api.fmtFecha(mascota.alta) : "") +
        "</p>" +
      "</div>";

    const key = encodeURIComponent(mascota.idHub || mascota.id);
    document.getElementById("link-resultados").href = "afil-resultados.html?mascota=" + key;
    document.getElementById("link-ddjj").href = "afil-ddjj.html?mascota=" + key;
  }

  async function cargarRegistros() {
    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(2);
    document.getElementById("conteo").textContent = "…";
    try {
      const r = await api.ordenesDeMascota(mascota.idHub || mascota.id);
      const ordenes = (r.ordenes || []).slice().sort(function (a, b) {
        return new Date(b.fecha) - new Date(a.fecha);
      });
      document.getElementById("conteo").textContent =
        ordenes.length + (ordenes.length === 1 ? " registro" : " registros");

      if (!ordenes.length) {
        lista.innerHTML = ui.vacio("Todavía no hay registros clínicos de " + api.escapeHtml(mascota.nombre) + ".");
        return;
      }
      lista.innerHTML = ordenes.map(function (o) {
        const st = RU.estado(o.estadoCodigo, o.estadoNombre);
        return '<a class="record-item orden-item" href="afil-resultado-detalle.html?orden=' +
               encodeURIComponent(o.id) + "&mascota=" + encodeURIComponent(mascota.idHub || mascota.id) + '">' +
          '<div class="record-item-top">' +
            '<p class="record-item-title">' + api.escapeHtml(o.servicio || "Orden médica") + "</p>" +
            '<span class="status-chip ' + st.cls + '">' + st.label + "</span>" +
          "</div>" +
          '<p class="record-item-meta">' + api.fmtFecha(o.fecha) +
            (o.profesional ? " &bull; " + api.escapeHtml(o.profesional) : "") +
            (o.sucursal ? "<br>" + api.escapeHtml(o.sucursal) : "") + "</p>" +
          (o.diagnostico ? '<p class="record-item-meta">Diagnóstico: ' + api.escapeHtml(o.diagnostico) + "</p>" : "") +
          '<svg class="entity-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
        "</a>";
      }).join("");
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar la historia clínica.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("salud");

    try { afiliado = await api.me(); } catch (_) {
      document.getElementById("lista").innerHTML = ui.vacio("No pudimos cargar tus datos.");
      return;
    }
    const params = new URLSearchParams(location.search);
    mascota = api.findMascota(afiliado, params.get("mascota"));
    if (!mascota) {
      document.getElementById("lista").innerHTML = ui.vacio("No tenés mascotas asociadas.");
      return;
    }

    ui.montarSelectorMascota(document.getElementById("pet-selector"), afiliado, mascota, function (m) {
      mascota = m;
      history.replaceState(null, "", "afil-clinica.html?mascota=" + encodeURIComponent(m.idHub || m.id));
      renderHero();
      cargarRegistros();
    });

    renderHero();
    cargarRegistros();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
