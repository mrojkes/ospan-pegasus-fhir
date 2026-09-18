/* =========================================================
   RENDER — Reintegros
   Carga de una solicitud con comprobantes (foto o PDF) y estado
   de las anteriores. Los comprobantes viajan dentro del JSON como
   data URL y los guarda el backend en la base.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const MAX_ARCHIVOS = 4;
  const MAX_BYTES = 5 * 1024 * 1024;
  let archivos = [];
  let blobAbierto = null;

  /* ---------------- listado ---------------- */

  function renderLista(items) {
    const lista = document.getElementById("lista");
    document.getElementById("conteo").textContent =
      items.length + (items.length === 1 ? " solicitud" : " solicitudes");

    if (!items.length) {
      lista.innerHTML = ui.vacio("Todavía no cargaste ningún reintegro.");
      return;
    }
    lista.innerHTML = items.map(function (r) {
      const adj = (r.adjuntos || []).map(function (a) {
        return '<button class="comprobante-chip" type="button" data-adjunto="' + a.id + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' +
          api.escapeHtml(a.nombre) + "</button>";
      }).join("");

      return '<div class="record-item">' +
        '<div class="record-item-top">' +
          '<p class="record-item-title">' + api.escapeHtml(r.descripcion || r.tipoPrestacion) + "</p>" +
          ui.chipEstado(r.estado) +
        "</div>" +
        '<p class="record-item-meta">' + api.escapeHtml(r.mascota || "") + " &bull; " +
          api.escapeHtml(r.codigo) + "<br>Prestación del " + api.fmtFecha(r.fechaPrestacion) + "</p>" +
        '<span class="record-item-value">' + api.fmtPesos(r.monto) +
          (r.montoAprobado != null && r.montoAprobado !== r.monto
            ? ' <span class="monto-aprobado">reconocido: ' + api.fmtPesos(r.montoAprobado) + "</span>"
            : "") + "</span>" +
        (adj ? '<div class="comprobante-row">' + adj + "</div>" : "") +
        (r.motivoResolucion ? '<p class="resolucion">' + api.escapeHtml(r.motivoResolucion) + "</p>" : "") +
      "</div>";
    }).join("");

    lista.querySelectorAll("[data-adjunto]").forEach(function (b) {
      b.addEventListener("click", function () { abrirComprobante(b.getAttribute("data-adjunto")); });
    });
  }

  async function abrirComprobante(id) {
    try {
      if (blobAbierto) URL.revokeObjectURL(blobAbierto);
      const r = await api.comprobanteBlobUrl(id);
      if (!r) return;
      blobAbierto = r.url;
      window.open(r.url, "_blank", "noopener");
    } catch (_) {
      alertaSuave("No pudimos abrir el comprobante.");
    }
  }

  function alertaSuave(msg) {
    const err = document.getElementById("form-error");
    err.textContent = msg;
    err.classList.remove("hidden");
  }

  async function cargar() {
    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(2);
    try {
      renderLista(await api.reintegros());
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar tus reintegros.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  /* ---------------- adjuntos ---------------- */

  function renderArchivos() {
    document.getElementById("archivo-list").innerHTML = archivos.map(function (a, i) {
      return '<div class="archivo-item"><span>' + api.escapeHtml(a.nombre) + "</span>" +
        '<button type="button" data-quitar="' + i + '" aria-label="Quitar">&times;</button></div>';
    }).join("");
    document.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.addEventListener("click", function () {
        archivos.splice(Number(b.getAttribute("data-quitar")), 1);
        renderArchivos();
      });
    });
  }

  async function agregarArchivos(fileList) {
    const err = document.getElementById("form-error");
    err.classList.add("hidden");
    for (const file of Array.from(fileList)) {
      if (archivos.length >= MAX_ARCHIVOS) { alertaSuave("Podés adjuntar hasta " + MAX_ARCHIVOS + " archivos."); break; }
      if (file.size > MAX_BYTES) { alertaSuave(file.name + " pesa más de 5 MB."); continue; }
      try { archivos.push(await ui.leerArchivo(file)); }
      catch (e) { alertaSuave(e.message); }
    }
    renderArchivos();
  }

  /* ---------------- formulario ---------------- */

  function toggleForm(abrir) {
    document.getElementById("form-panel").classList.toggle("hidden", !abrir);
    document.getElementById("nueva-btn").classList.toggle("hidden", abrir);
    document.getElementById("form-error").classList.add("hidden");
    if (!abrir) { archivos = []; renderArchivos(); }
  }

  async function enviar(ev) {
    ev.preventDefault();
    const err = document.getElementById("form-error");
    const btn = document.getElementById("enviar-btn");
    err.classList.add("hidden");

    if (!archivos.length) { alertaSuave("Adjuntá al menos un comprobante."); return; }

    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      await api.crearReintegro({
        idHub: document.getElementById("f-mascota").value,
        tipoPrestacion: document.getElementById("f-tipo").value,
        descripcion: document.getElementById("f-desc").value,
        monto: Number(document.getElementById("f-monto").value),
        fechaPrestacion: document.getElementById("f-fecha").value,
        adjuntos: archivos,
      });
      document.getElementById("form-panel").reset();
      toggleForm(false);
      await cargar();
    } catch (e) {
      alertaSuave(e.message || "No pudimos enviar la solicitud.");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("inicio");
    ui.montarVistaPreliminar("Vista preliminar — el circuito de liquidación está en validación con OSPAN");

    document.getElementById("f-fecha").max = ui.hoyISO();
    document.getElementById("nueva-btn").addEventListener("click", function () { toggleForm(true); });
    document.getElementById("cancelar-btn").addEventListener("click", function () { toggleForm(false); });
    document.getElementById("form-panel").addEventListener("submit", enviar);
    document.getElementById("f-archivos").addEventListener("change", function (e) {
      agregarArchivos(e.target.files);
      e.target.value = "";
    });

    try {
      const afiliado = await api.me();
      document.getElementById("f-mascota").innerHTML = ui.opcionesMascota(afiliado);
    } catch (_) {}

    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
