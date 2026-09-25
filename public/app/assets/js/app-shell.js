/* =========================================================
   PIEZAS COMPARTIDAS POR LAS PANTALLAS NUEVAS
   - Cartel de "vista preliminar" (se apaga con un Secret).
   - Selector de mascota, que repiten varias pantallas.
   - Chips de estado de solicitudes.
   - Helpers de formulario y de listas vacías.
   ========================================================= */
window.AppShell = (function () {
  const api = window.AppApi;

  /* ---------------- vista preliminar ---------------- */

  /**
   * Franja que aclara que la pantalla todavía no trabaja con datos de
   * producción. Se muestra solo si el backend lo pide (Secret
   * APP_VISTA_PRELIMINAR), así en la demo con el cliente queda claro qué
   * está vivo y qué no, y se apaga sin tocar el código.
   */
  async function montarVistaPreliminar(texto) {
    let cfg;
    try { cfg = await api.config(); } catch (_) { return; }
    if (!cfg || !cfg.vistaPreliminar) return;

    const main = document.querySelector(".page-body") || document.body;
    const franja = document.createElement("div");
    franja.className = "preview-banner";
    franja.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>' +
      "<span>" + api.escapeHtml(texto || "Vista preliminar — funcionalidad en validación") + "</span>";
    main.insertBefore(franja, main.firstChild);
  }

  /* ---------------- selector de mascota ---------------- */

  /**
   * Chips horizontales con las mascotas del tutor. Devuelve la elegida y
   * avisa por onCambio. Si hay una sola, igual se muestra (le da contexto
   * al afiliado de a cuál se refiere la pantalla).
   */
  function montarSelectorMascota(mount, afiliado, seleccionada, onCambio) {
    if (!mount || !afiliado) return null;
    let actual = seleccionada || afiliado.mascotas[0];
    if (!actual) return null;

    function pintar() {
      mount.innerHTML = afiliado.mascotas.map(function (m) {
        const key = m.idHub || m.id;
        const activa = (actual.idHub || actual.id) === key;
        const avatar = m.foto
          ? '<img src="' + api.escapeHtml(m.foto) + '" alt="">'
          : api.escapeHtml(m.iniciales || (m.nombre || "??").slice(0, 2).toUpperCase());
        return '<button class="pet-chip' + (activa ? " is-active" : "") + '" type="button" data-key="' +
          api.escapeHtml(key) + '"><span class="pet-chip-avatar">' + avatar + "</span>" +
          api.escapeHtml(m.nombre) + "</button>";
      }).join("");
      mount.querySelectorAll(".pet-chip").forEach(function (b) {
        b.addEventListener("click", function () {
          actual = api.findMascota(afiliado, b.getAttribute("data-key"));
          pintar();
          if (onCambio) onCambio(actual);
        });
      });
    }
    pintar();
    return actual;
  }

  /** <option> con las mascotas, para los formularios. */
  function opcionesMascota(afiliado) {
    return afiliado.mascotas.map(function (m) {
      return '<option value="' + api.escapeHtml(m.idHub || m.id) + '">' +
        api.escapeHtml(m.nombre) + (m.raza ? " · " + api.escapeHtml(m.raza) : "") + "</option>";
    }).join("");
  }

  /* ---------------- estados ---------------- */

  const ESTADOS = {
    pendiente:  { label: "Pendiente",  cls: "status-chip--pendiente" },
    solicitado: { label: "Solicitado", cls: "status-chip--pendiente" },
    aprobada:   { label: "Aprobada",   cls: "status-chip--realizada" },
    aprobado:   { label: "Aprobado",   cls: "status-chip--realizada" },
    confirmado: { label: "Confirmado", cls: "status-chip--realizada" },
    realizado:  { label: "Realizado",  cls: "status-chip--realizada" },
    rechazada:  { label: "Rechazada",  cls: "status-chip--cancelada" },
    rechazado:  { label: "Rechazado",  cls: "status-chip--cancelada" },
    cancelado:  { label: "Cancelado",  cls: "status-chip--cancelada" },
    anulada:    { label: "Anulada",    cls: "status-chip--cancelada" },
    // Estados de los trámites (FHIR Task: requested / in-progress /
    // on-hold / completed / rejected / cancelled).
    abierto:             { label: "Ingresado",            cls: "status-chip--pendiente" },
    en_proceso:          { label: "En análisis",          cls: "status-chip--pendiente" },
    falta_documentacion: { label: "Falta documentación",  cls: "status-chip--otro" },
    resuelto:            { label: "Resuelto",             cls: "status-chip--realizada" },
    anulado:             { label: "Anulado",              cls: "status-chip--cancelada" },
  };

  function chipEstado(estado) {
    const e = ESTADOS[estado] || { label: estado || "—", cls: "status-chip--otro" };
    return '<span class="status-chip ' + e.cls + '">' + api.escapeHtml(e.label) + "</span>";
  }

  /* ---------------- utilidades de pantalla ---------------- */

  function vacio(mensaje) {
    return '<p class="empty-state">' + api.escapeHtml(mensaje) + "</p>";
  }

  function cargando(n) {
    let html = "";
    for (let i = 0; i < (n || 2); i++) {
      html += '<div class="record-item"><div class="skeleton-line" style="width:65%"></div>' +
              '<div class="skeleton-line" style="width:40%"></div></div>';
    }
    return html;
  }

  function estrellas(puntaje, opiniones) {
    if (puntaje == null) return "";
    return '<span class="rating">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
      "<b>" + Number(puntaje).toFixed(1) + "</b>" +
      (opiniones ? '<span class="rating-count">(' + opiniones + ")</span>" : "") +
      "</span>";
  }

  /** Hoy en formato AAAA-MM-DD, en hora local (no UTC). */
  function hoyISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /** Los próximos N días hábiles+sábado, para el selector de turno. */
  function proximosDias(n) {
    const dias = [];
    const d = new Date();
    while (dias.length < n) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) continue; // domingo no
      dias.push({
        iso: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
        label: d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" }).replace(".", ""),
      });
    }
    return dias;
  }

  /** Lee un archivo del input como data URL, para mandarlo en el JSON. */
  function leerArchivo(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve({ nombre: file.name, contenido: r.result }); };
      r.onerror = function () { reject(new Error("No pudimos leer " + file.name)); };
      r.readAsDataURL(file);
    });
  }

  return {
    montarVistaPreliminar, montarSelectorMascota, opcionesMascota,
    chipEstado, vacio, cargando, estrellas, hoyISO, proximosDias, leerArchivo,
  };
})();
