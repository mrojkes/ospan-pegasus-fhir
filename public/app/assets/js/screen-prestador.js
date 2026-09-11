/* =========================================================
   RENDER — Ficha de la veterinaria + pedido de turno
   Las franjas salen del backend, que ya descuenta las que están
   pedidas o confirmadas para ese día.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  let prestador = null;
  let afiliado = null;
  let diaElegido = null;
  let horaElegida = null;

  function render() {
    const esp = (prestador.especialidades || []).map(function (e) {
      return '<span class="mini-tag">' + api.escapeHtml(e) + "</span>";
    }).join("");

    document.querySelector(".page-title").textContent = prestador.nombre;

    document.getElementById("detalle").innerHTML =
      '<div class="orden-hero">' +
        '<div class="orden-hero-top">' +
          '<p class="orden-hero-servicio">' + api.escapeHtml(prestador.nombre) + "</p>" +
          (prestador.copago != null
            ? '<span class="hero-copago"><b>' + api.fmtPesos(prestador.copago) + "</b><small>copago</small></span>"
            : "") +
        "</div>" +
        '<p class="orden-hero-meta">' + api.escapeHtml(prestador.direccion || prestador.zona || "") + "</p>" +
        '<p class="orden-hero-meta">' + ui.estrellas(prestador.puntaje, prestador.opiniones) + "</p>" +
      "</div>" +

      (esp ? '<p class="menu-group-title">Especialidades</p><div class="orden-item-badges mb-6">' + esp + "</div>" : "") +

      '<p class="menu-group-title">Datos</p>' +
      '<div class="field-card mb-6">' +
        '<div class="field-row"><span class="field-label">Zona</span><span class="field-value">' + api.escapeHtml(prestador.zona || "—") + "</span></div>" +
        '<div class="field-row"><span class="field-label">Horario</span><span class="field-value">' + api.escapeHtml(prestador.horarioTexto || "—") + "</span></div>" +
        '<div class="field-row"><span class="field-label">Teléfono</span><span class="field-value">' + api.escapeHtml(prestador.telefono || "—") + "</span></div>" +
      "</div>" +

      (prestador.telefono
        ? '<a class="cta-button cta-button--light cta-button--icon mb-6" href="tel:' +
          api.escapeHtml(prestador.telefono.replace(/[^0-9+]/g, "")) + '">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>' +
          "Llamar</a>"
        : "") +

      (prestador.aceptaTurnos ? bloqueTurno() : '<p class="empty-state">Esta veterinaria todavía no toma turnos desde la app.</p>');

    if (prestador.aceptaTurnos) wireTurno();
  }

  function bloqueTurno() {
    return '<p class="menu-group-title">Reservar turno</p>' +
      '<div class="form-panel">' +
        '<div class="form-group">' +
          '<label class="form-label" for="t-mascota">Mascota</label>' +
          '<select class="form-input" id="t-mascota">' + ui.opcionesMascota(afiliado) + "</select>" +
        "</div>" +
        '<div class="form-group">' +
          '<label class="form-label" for="t-motivo">Motivo</label>' +
          '<select class="form-input" id="t-motivo">' +
            "<option>Consulta general</option><option>Control</option><option>Vacunación</option>" +
            "<option>Estudios</option><option>Urgencia</option>" +
          "</select>" +
        "</div>" +
        '<label class="form-label">Día</label>' +
        '<div class="filter-chips" id="dias"></div>' +
        '<label class="form-label">Horario</label>' +
        '<div class="hora-grid" id="horas"><p class="empty-state">Elegí un día.</p></div>' +
        '<p class="form-security-note text-red hidden" id="turno-error"></p>' +
        '<p class="form-security-note text-green hidden" id="turno-ok"></p>' +
        '<button class="cta-button cta-button--primary mt-4" type="button" id="confirmar" disabled>Confirmar turno</button>' +
      "</div>";
  }

  function wireTurno() {
    const dias = ui.proximosDias(6);
    const mount = document.getElementById("dias");
    mount.innerHTML = dias.map(function (d) {
      return '<button class="filter-chip" type="button" data-dia="' + d.iso + '">' + api.escapeHtml(d.label) + "</button>";
    }).join("");
    mount.querySelectorAll("[data-dia]").forEach(function (b) {
      b.addEventListener("click", function () {
        mount.querySelectorAll(".filter-chip").forEach(function (x) { x.classList.toggle("is-active", x === b); });
        elegirDia(b.getAttribute("data-dia"));
      });
    });
    document.getElementById("confirmar").addEventListener("click", confirmar);
  }

  async function elegirDia(iso) {
    diaElegido = iso;
    horaElegida = null;
    actualizarBoton();
    const mount = document.getElementById("horas");
    mount.innerHTML = '<p class="empty-state">Buscando horarios…</p>';
    try {
      const r = await api.disponibilidad(prestador.id, iso);
      if (!r.horas.length) {
        mount.innerHTML = '<p class="empty-state">No quedan horarios ese día.</p>';
        return;
      }
      mount.innerHTML = r.horas.map(function (h) {
        return '<button class="hora-chip" type="button" data-hora="' + h + '">' + h + "</button>";
      }).join("");
      mount.querySelectorAll("[data-hora]").forEach(function (b) {
        b.addEventListener("click", function () {
          mount.querySelectorAll(".hora-chip").forEach(function (x) { x.classList.toggle("is-active", x === b); });
          horaElegida = b.getAttribute("data-hora");
          actualizarBoton();
        });
      });
    } catch (_) {
      mount.innerHTML = '<p class="empty-state">No pudimos ver la disponibilidad.</p>';
    }
  }

  function actualizarBoton() {
    document.getElementById("confirmar").disabled = !(diaElegido && horaElegida);
  }

  async function confirmar() {
    const err = document.getElementById("turno-error");
    const ok = document.getElementById("turno-ok");
    const btn = document.getElementById("confirmar");
    err.classList.add("hidden");
    ok.classList.add("hidden");
    btn.disabled = true;
    try {
      const t = await api.crearTurno({
        idHub: document.getElementById("t-mascota").value,
        prestadorId: prestador.id,
        motivo: document.getElementById("t-motivo").value,
        fecha: diaElegido,
        hora: horaElegida,
      });
      ok.textContent = "Turno pedido (" + t.codigo + "). Te avisamos cuando la veterinaria lo confirme.";
      ok.classList.remove("hidden");
      setTimeout(function () { window.location.href = "afil-turnos.html"; }, 1600);
    } catch (e) {
      err.textContent = e.message || "No pudimos pedir el turno.";
      err.classList.remove("hidden");
      btn.disabled = false;
      // Si la franja se ocupó mientras tanto, refrescamos las opciones.
      if (e.status === 409 && diaElegido) elegirDia(diaElegido);
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    ui.montarVistaPreliminar("Vista preliminar — las veterinarias todavía no confirman en línea");

    const id = new URLSearchParams(location.search).get("id");
    try {
      const r = await Promise.all([api.prestador(id), api.me()]);
      prestador = r[0];
      afiliado = r[1];
    } catch (e) {
      document.getElementById("detalle").innerHTML = ui.vacio("No encontramos esa veterinaria.");
      return;
    }
    if (!prestador) {
      document.getElementById("detalle").innerHTML = ui.vacio("No encontramos esa veterinaria.");
      return;
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
