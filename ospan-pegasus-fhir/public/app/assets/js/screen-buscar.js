/* =========================================================
   RENDER — Directorio (Buscar), pantalla completa
   Buscador por zona (no texto libre sobre nombre/rubro) +
   botón para simular "usar mi ubicación". Sin mapa ni filtros
   avanzados todavía: eso queda para una próxima etapa.
   ========================================================= */
(function () {
  const api = window.AppApi;
  let proveedores = [];

  const CATEGORY_META = {
    veterinaria: {
      label: "Veterinaria",
      modifier: "directory-icon--veterinaria",
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>',
    },
    peluqueria: {
      label: "Peluquería",
      modifier: "directory-icon--peluqueria",
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>',
    },
    guarderia: {
      label: "Guardería",
      modifier: "directory-icon--guarderia",
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    },
    adiestrador: {
      label: "Adiestrador",
      modifier: "directory-icon--adiestrador",
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"/><path d="m2.5 21.5 1.4-1.4"/><path d="m20.1 3.9 1.4-1.4"/><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"/><path d="m9.6 14.4 4.8-4.8"/></svg>',
    },
  };

  const ICON_PIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';
  const ICON_PHONE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>';

  function getZonas() {
    return [...new Set(proveedores.map((p) => p.zona))].sort();
  }

  function populateZonaDatalist() {
    const datalist = document.getElementById("zona-datalist");
    datalist.innerHTML = getZonas().map((z) => '<option value="' + z + '"></option>').join("");
  }

  function renderItem(p) {
    const meta = CATEGORY_META[p.categoria];
    const statusClass = p.abierto ? "is-open" : "is-closed";
    const tel = p.telefono.replace(/[^0-9+]/g, "");
    return (
      '<a class="directory-item" href="tel:' + tel + '" aria-label="Llamar a ' + p.nombre + '">' +
        '<span class="directory-icon ' + meta.modifier + '">' + meta.icon + "</span>" +
        '<div class="directory-body">' +
          '<p class="directory-title">' + p.nombre + "</p>" +
          '<p class="directory-meta-row">' + ICON_PIN + "<span>" + p.distancia + " &middot; " + meta.label + "</span></p>" +
          '<p class="directory-status-row ' + statusClass + '"><span class="directory-status-dot"></span>' + p.horarioTexto + "</p>" +
        "</div>" +
        '<span class="directory-action-button" aria-hidden="true">' + ICON_PHONE + "</span>" +
      "</a>"
    );
  }

  function renderList(zonaFiltro) {
    const filtro = (zonaFiltro || "").trim().toLowerCase();
    const resultado = filtro
      ? proveedores.filter((p) => p.zona.toLowerCase().includes(filtro))
      : proveedores;

    document.getElementById("veterinarias-list").innerHTML = resultado.length
      ? resultado.map(renderItem).join("")
      : '<p class="empty-state">No encontramos resultados en esa zona.</p>';

    document.getElementById("results-count").textContent = resultado.length + " resultados";
    document.getElementById("zone-section-title").textContent = filtro ? "En " + zonaFiltro : "Cerca tuyo";
  }

  function wireSearch() {
    const input = document.getElementById("zona-input");
    input.addEventListener("input", function () {
      document.getElementById("locate-button").classList.remove("is-active");
      document.getElementById("locate-status").classList.add("hidden");
      renderList(input.value);
    });
  }

  function wireLocate() {
    const button = document.getElementById("locate-button");
    const input = document.getElementById("zona-input");
    const status = document.getElementById("locate-status");

    button.addEventListener("click", function () {
      // Mock: no pedimos geolocalización real todavía, simulamos
      // que detectamos la zona del afiliado.
      const zonaDetectada = getZonas()[0];
      input.value = zonaDetectada;
      button.classList.add("is-active");
      status.classList.remove("hidden");
      renderList(zonaDetectada);
    });
  }

  async function init() {
    if (!api.requireSession()) return;
    wireSearch();
    wireLocate();
    window.TabBar.render("buscar");
    try { proveedores = await api.directorio(); } catch (_) { proveedores = []; }
    populateZonaDatalist();
    renderList("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
