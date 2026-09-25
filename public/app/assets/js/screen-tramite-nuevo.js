/* =========================================================
   RENDER — Iniciar un trámite
   -----------------------------------------------------------
   Esta pantalla NO conoce ningún trámite. Pide el catálogo al
   servidor, y cuando el afiliado elige uno pide su `Questionnaire`
   y lo dibuja con el renderer genérico (el mismo de la DDJJ).

   Agregar, sacar o cambiar un trámite es editar el catálogo en el
   backend: acá no hay nada que tocar.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const FQ = window.FhirQuestionnaire;

  let afiliado = null;
  let tipos = [];
  let tipoActual = null;
  let form = null;

  /* ---------------- paso 1: catálogo ---------------- */

  function pintarTipos() {
    document.getElementById("tipos").innerHTML = tipos.map(function (t) {
      return '<button class="tramite-tipo" type="button" data-codigo="' + api.escapeHtml(t.codigo) + '">' +
        '<span class="tramite-tipo-titulo">' + api.escapeHtml(t.titulo) + "</span>" +
        '<span class="tramite-tipo-resumen">' + api.escapeHtml(t.resumen || "") + "</span>" +
      "</button>";
    }).join("");

    document.querySelectorAll("[data-codigo]").forEach(function (b) {
      b.addEventListener("click", function () { elegir(b.getAttribute("data-codigo")); });
    });
  }

  /* ---------------- paso 2: formulario ---------------- */

  async function elegir(codigo) {
    const contenedor = document.getElementById("preguntas");
    mostrar("paso-form");
    contenedor.innerHTML = ui.cargando(3);
    document.getElementById("form-error").classList.add("hidden");

    try {
      tipoActual = await api.tramiteFormulario(codigo);
    } catch (e) {
      mostrar("paso-tipos");
      return;
    }

    document.getElementById("titulo").textContent = tipoActual.titulo;
    document.getElementById("resumen-tipo").textContent = tipoActual.resumen || "";

    // La mascota solo aparece cuando el trámite es sobre una mascota.
    const grupo = document.getElementById("grupo-mascota");
    const select = document.getElementById("f-mascota");
    const mascotas = (afiliado && afiliado.mascotas) || [];
    if (tipoActual.ambito === "titular" || !mascotas.length) {
      grupo.classList.add("hidden");
    } else {
      grupo.classList.remove("hidden");
      select.innerHTML =
        (tipoActual.ambito === "opcional" ? '<option value="">No es sobre una mascota</option>' : "") +
        ui.opcionesMascota(afiliado);
    }

    form = FQ.montar(contenedor, tipoActual.questionnaire, null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enviar(ev) {
    ev.preventDefault();
    const err = document.getElementById("form-error");
    const btn = document.getElementById("enviar-btn");
    err.classList.add("hidden");

    const grupo = document.getElementById("grupo-mascota");
    const idHub = grupo.classList.contains("hidden") ? "" : document.getElementById("f-mascota").value;
    if (tipoActual.ambito === "mascota" && !idHub) {
      return error("Elegí la mascota del trámite.");
    }

    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      const creado = await api.crearTramite({
        tipo: tipoActual.codigo,
        idHub: idHub,
        items: form.toResponseItems(),
        adjuntos: form.adjuntos(),
      });
      document.getElementById("ok-nro").textContent = creado.nro;
      document.getElementById("ok-ver").href = "afil-tramite-detalle.html?nro=" + encodeURIComponent(creado.nro);
      document.getElementById("titulo").textContent = "Trámite iniciado";
      mostrar("paso-ok");
    } catch (e) {
      // El servidor devuelve qué obligatorios faltan: se marcan en la
      // pantalla en vez de mostrar solo un cartel.
      if (e.payload && e.payload.faltantes && form) form.marcarFaltantes(e.payload.faltantes);
      error(e.message || "No pudimos iniciar el trámite.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Enviar trámite";
    }
  }

  function error(mensaje) {
    const err = document.getElementById("form-error");
    err.textContent = mensaje;
    err.classList.remove("hidden");
    err.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function mostrar(id) {
    ["paso-tipos", "paso-form", "paso-ok"].forEach(function (p) {
      document.getElementById(p).classList.toggle("hidden", p !== id);
    });
    document.getElementById("volver").setAttribute(
      "href",
      id === "paso-tipos" ? "afil-tramites.html" : "#"
    );
  }

  function volverAlCatalogo() {
    tipoActual = null;
    form = null;
    document.getElementById("titulo").textContent = "Iniciar un trámite";
    mostrar("paso-tipos");
  }

  async function init() {
    if (!api.requireSession()) return;
    ui.montarVistaPreliminar("Vista preliminar — los trámites que inicies acá los está validando OSPAN");

    document.getElementById("tramite-form").addEventListener("submit", enviar);
    document.getElementById("cancelar-btn").addEventListener("click", volverAlCatalogo);
    document.getElementById("volver").addEventListener("click", function (ev) {
      if (!document.getElementById("paso-form").classList.contains("hidden")) {
        ev.preventDefault();
        volverAlCatalogo();
      }
    });

    try { afiliado = await api.me(); } catch (_) { return; }

    try {
      const r = await api.tramiteTipos();
      tipos = r.tipos || [];
    } catch (_) {
      document.getElementById("tipos").innerHTML = ui.vacio("No pudimos traer los trámites disponibles.");
      return;
    }
    pintarTipos();

    // Se puede entrar directo a un trámite: afil-tramite-nuevo.html?tipo=CONSULTA
    const pedido = new URLSearchParams(location.search).get("tipo");
    if (pedido && tipos.some(function (t) { return t.codigo === pedido; })) elegir(pedido);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
