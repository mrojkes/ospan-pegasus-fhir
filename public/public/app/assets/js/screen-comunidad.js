/* =========================================================
   RENDER — Comunidad
   Servicios para mascotas (paseadores, peluquerías, guarderías…).
   "Contactar" abre WhatsApp si hay número, si no el teléfono.
   ========================================================= */
(function () {
  const api = window.AppApi;
  const ui = window.AppShell;
  const TIPOS = ["Todos", "Paseador", "Peluquería", "Guardería", "Pet Shop", "Nutricionista"];
  let filtro = "Todos";

  function renderFiltros() {
    const mount = document.getElementById("filtros");
    mount.innerHTML = TIPOS.map(function (t) {
      return '<button class="filter-chip' + (t === filtro ? " is-active" : "") +
        '" type="button" data-tipo="' + api.escapeHtml(t) + '">' + api.escapeHtml(t) + "</button>";
    }).join("");
    mount.querySelectorAll("[data-tipo]").forEach(function (b) {
      b.addEventListener("click", function () {
        filtro = b.getAttribute("data-tipo");
        renderFiltros();
        cargar();
      });
    });
  }

  function contactoHref(c) {
    if (c.whatsapp) {
      return "https://wa.me/" + String(c.whatsapp).replace(/\D/g, "") +
        "?text=" + encodeURIComponent("Hola, te contacto desde la app de OSPAN.");
    }
    if (c.telefono) return "tel:" + String(c.telefono).replace(/[^0-9+]/g, "");
    return null;
  }

  function render(items) {
    const lista = document.getElementById("lista");
    document.getElementById("titulo-lista").textContent = filtro;
    document.getElementById("conteo").textContent =
      items.length + (items.length === 1 ? " servicio" : " servicios");

    if (!items.length) {
      lista.innerHTML = ui.vacio("No hay servicios de esa categoría todavía.");
      return;
    }
    lista.innerHTML = items.map(function (c) {
      const href = contactoHref(c);
      return '<div class="record-item comunidad-item">' +
        '<div class="comunidad-top">' +
          '<span class="comunidad-emoji">' + api.escapeHtml(c.emoji || "🐾") + "</span>" +
          '<div class="comunidad-body">' +
            '<p class="record-item-title">' + api.escapeHtml(c.nombre) +
              (c.verificado ? ' <span class="verificado" title="Verificado por OSPAN">✓</span>' : "") + "</p>" +
            '<span class="mini-tag">' + api.escapeHtml(c.tipo) + "</span>" +
            '<p class="record-item-meta">' + ui.estrellas(c.puntaje, c.opiniones) +
              (c.zona ? " &bull; " + api.escapeHtml(c.zona) : "") + "</p>" +
          "</div>" +
          (c.precio ? '<span class="comunidad-precio">' + api.escapeHtml(c.precio) + "</span>" : "") +
        "</div>" +
        (href
          ? '<a class="cta-button cta-button--light mt-3" href="' + api.escapeHtml(href) +
            '" target="_blank" rel="noopener">Contactar</a>'
          : "") +
      "</div>";
    }).join("");
  }

  async function cargar() {
    const lista = document.getElementById("lista");
    lista.innerHTML = ui.cargando(2);
    try {
      render(await api.comunidad(filtro));
    } catch (_) {
      lista.innerHTML = ui.vacio("No pudimos cargar los servicios.");
      document.getElementById("conteo").textContent = "—";
    }
  }

  async function init() {
    if (!api.requireSession()) return;
    window.TabBar.render("comunidad");
    ui.montarVistaPreliminar("Vista preliminar — la red de servicios está en armado");
    renderFiltros();
    cargar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
