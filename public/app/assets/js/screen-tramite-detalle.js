/* =========================================================
   RENDER — Detalle y seguimiento de un trámite
   -----------------------------------------------------------
   Lo respondido se dibuja a partir del `QuestionnaireResponse`
   guardado, no del cuestionario actual: el recurso trae el texto de
   cada pregunta, así que un trámite de hace meses se sigue leyendo
   como el afiliado lo respondió aunque el formulario haya cambiado.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const FQ = window.FhirQuestionnaire;

  const nro = new URLSearchParams(location.search).get("nro") || "";
  let tramite = null;
  let archivos = [];

  /* ---------------- pintar ---------------- */

  function pintar() {
    document.getElementById("t-titulo").textContent = tramite.titulo;
    document.getElementById("t-estado").innerHTML = ui.chipEstado(tramite.estado);
    document.getElementById("t-meta").innerHTML =
      api.escapeHtml(tramite.nro) + " &bull; " + api.fmtFecha(tramite.creadoEn) +
      (tramite.mascota && tramite.mascota.nombre ? " &bull; " + api.escapeHtml(tramite.mascota.nombre) : "");

    if (tramite.resolucion) {
      document.getElementById("t-resolucion").textContent = tramite.resolucion;
      document.getElementById("panel-resolucion").classList.remove("hidden");
    }

    document.getElementById("t-eventos").innerHTML = (tramite.eventos || []).map(function (e) {
      return '<li class="timeline-item">' +
        '<span class="timeline-dot"></span>' +
        '<div><p class="timeline-titulo">' + api.escapeHtml(etiquetaEvento(e)) + "</p>" +
        '<p class="timeline-fecha">' + api.fmtFecha(e.fecha) + "</p>" +
        (e.detalle ? '<p class="timeline-detalle">' + api.escapeHtml(e.detalle) + "</p>" : "") +
        "</div></li>";
    }).join("");

    document.getElementById("t-respuesta").innerHTML = FQ.resumen(tramite.questionnaireResponse);

    const adj = tramite.adjuntos || [];
    document.getElementById("t-adjuntos").innerHTML = adj.length
      ? adj.map(function (a) {
          return '<button class="comprobante-chip" type="button" data-url="' + api.escapeHtml(a.url) + '">' +
            api.escapeHtml(a.nombre) + "</button>";
        }).join("")
      : ui.vacio("No adjuntaste documentación.");

    document.querySelectorAll("[data-url], [data-adjunto-url]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        abrir(b.getAttribute("data-url") || b.getAttribute("data-adjunto-url"));
      });
    });

    document.getElementById("acciones").classList.toggle("hidden", !tramite.abierto);
    document.getElementById("cargando").classList.add("hidden");
    document.getElementById("contenido").classList.remove("hidden");
  }

  const ETIQUETAS = {
    abierto: "Trámite ingresado",
    en_proceso: "En análisis",
    falta_documentacion: "Nos falta documentación",
    documentacion: "Agregaste documentación",
    resuelto: "Resuelto",
    rechazado: "Rechazado",
    anulado: "Anulado",
  };

  function etiquetaEvento(e) {
    return ETIQUETAS[e.estado] || e.estado;
  }

  /** El archivo se pide con el token en el header, nunca en la URL. */
  async function abrir(url) {
    try {
      const r = await api.archivoBlobUrl(url);
      if (r) window.open(r.url, "_blank");
    } catch (e) {
      mostrarError(e.message || "No pudimos abrir el archivo.");
    }
  }

  /* ---------------- documentación ---------------- */

  function pintarArchivos() {
    document.getElementById("doc-lista").innerHTML = archivos.map(function (a, i) {
      return '<div class="archivo-item"><span>' + api.escapeHtml(a.nombre) + "</span>" +
        '<button type="button" class="archivo-quitar" data-quitar="' + i + '" aria-label="Quitar">&times;</button></div>';
    }).join("");
    document.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.addEventListener("click", function () {
        archivos.splice(Number(b.getAttribute("data-quitar")), 1);
        pintarArchivos();
      });
    });
    document.getElementById("btn-enviar-doc").classList.toggle("hidden", !archivos.length);
  }

  async function enviarDocumentacion() {
    const btn = document.getElementById("btn-enviar-doc");
    btn.disabled = true;
    try {
      // Se manda con el linkId genérico de "envío de documentación":
      // el back office ve a qué trámite corresponde por el expediente.
      await api.agregarDocumentacion(
        nro,
        archivos.map(function (a) { return { linkId: "documentacion-adicional", nombre: a.nombre, contenido: a.contenido }; }),
        null
      );
      archivos = [];
      pintarArchivos();
      mostrarOk("Recibimos la documentación.");
      await cargar();
    } catch (e) {
      mostrarError(e.message || "No pudimos enviar la documentación.");
    } finally {
      btn.disabled = false;
    }
  }

  async function anular() {
    if (!window.confirm("¿Querés anular este trámite? No se puede deshacer.")) return;
    try {
      await api.anularTramite(nro, "Anulado por el afiliado desde la app");
      await cargar();
    } catch (e) {
      mostrarError(e.message || "No pudimos anular el trámite.");
    }
  }

  function mostrarError(m) {
    const el = document.getElementById("msg-error");
    el.textContent = m;
    el.classList.remove("hidden");
    document.getElementById("msg-ok").classList.add("hidden");
  }

  function mostrarOk(m) {
    const el = document.getElementById("msg-ok");
    el.textContent = m;
    el.classList.remove("hidden");
    document.getElementById("msg-error").classList.add("hidden");
  }

  /* ---------------- init ---------------- */

  async function cargar() {
    try {
      tramite = await api.tramite(nro);
      pintar();
    } catch (e) {
      document.getElementById("cargando").innerHTML = ui.vacio(
        e.status === 404 ? "No encontramos ese trámite." : "No pudimos traer el trámite."
      );
    }
  }

  function init() {
    if (!api.requireSession()) return;
    if (!nro) { window.location.replace("afil-tramites.html"); return; }

    document.getElementById("cargando").innerHTML = ui.cargando(3);
    ui.montarVistaPreliminar("Vista preliminar — los trámites que inicies acá los está validando OSPAN");

    document.getElementById("btn-doc").addEventListener("click", function () {
      document.getElementById("f-doc").click();
    });
    document.getElementById("f-doc").addEventListener("change", async function (ev) {
      for (const file of Array.prototype.slice.call(ev.target.files || [])) {
        try { archivos.push(await ui.leerArchivo(file)); } catch (_) {}
      }
      ev.target.value = "";
      pintarArchivos();
    });
    document.getElementById("btn-enviar-doc").addEventListener("click", enviarDocumentacion);
    document.getElementById("btn-anular").addEventListener("click", anular);

    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
