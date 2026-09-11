/* =========================================================
   RENDER — Home
   Toda la pantalla se arma a partir de APP_CONFIG y
   MOCK_AFILIADO. Ningún dato de marca ni de negocio está
   escrito en el HTML.
   ========================================================= */
(function () {
  const cfg = window.APP_CONFIG;
  const api = window.AppApi;
  let afiliado = null;

  function renderBrand() {
    document.getElementById("brand-logo").src = cfg.brand.logoIcono;
    document.getElementById("brand-logo").alt = cfg.brand.nombre;
  }

  function renderHeader() {
    document.getElementById("greeting-name").textContent = "Hola, " + afiliado.nombre;

    const pillRow = document.getElementById("status-pill-row");
    pillRow.innerHTML = "";

    const cuentaPill = document.createElement("span");
    cuentaPill.className = "pill pill--success";
    cuentaPill.innerHTML =
      '<span class="pill-dot"></span>' +
      (afiliado.estadoCuenta === "activo" ? "Cuenta Activa" : "Cuenta Suspendida");
    pillRow.appendChild(cuentaPill);

    // Si todas las mascotas comparten el mismo plan, se puede mostrar
    // como pill informativo. Si hay planes distintos, no se muestra
    // ningún pill de plan a nivel cuenta (el plan vive por mascota).
    const planesUnicos = [...new Set(afiliado.mascotas.map((m) => m.plan))];
    if (planesUnicos.length === 1) {
      const planPill = document.createElement("span");
      planPill.className = "pill pill--info";
      planPill.textContent = "Plan " + planesUnicos[0];
      pillRow.appendChild(planPill);
    }
  }

  function renderIdentityCard() {
    document.getElementById("afiliado-numero").textContent = afiliado.numeroAfiliado;
    document.getElementById("afiliado-dni").textContent = afiliado.dni;
  }

  function renderEntityList() {
    document.getElementById("entity-section-title").textContent = cfg.textos.entidadPlural;
    document.getElementById("entity-count-badge").textContent = afiliado.mascotas.length;

    const list = document.getElementById("entity-list");
    list.innerHTML = "";

    afiliado.mascotas.forEach((mascota) => {
      const card = document.createElement("button");
      card.className = "entity-card";
      card.type = "button";
      card.setAttribute("data-entity-id", mascota.id);

      const avatarContent = mascota.foto
        ? '<img src="' + mascota.foto + '" alt="' + mascota.nombre + '">'
        : mascota.iniciales;

      const avatarSexoClass =
        mascota.sexo === "hembra" ? " entity-avatar--hembra" :
        mascota.sexo === "macho" ? " entity-avatar--macho" : "";

      card.innerHTML =
        '<span class="entity-avatar' + avatarSexoClass + '">' + avatarContent + "</span>" +
        '<span class="entity-body">' +
          '<span class="entity-name-row">' +
            '<span class="entity-name">' + mascota.nombre + "</span>" +
            '<span class="status-indicator-dot"></span>' +
          "</span>" +
          '<p class="entity-subtitle">' + mascota.raza + " &bull; " + mascota.especie + "</p>" +
          '<span class="entity-tag-row">' +
            '<span class="tag tag--id">' + mascota.id + "</span>" +
            (mascota.plan ? '<span class="tag tag--plan">Plan ' + mascota.plan + "</span>" : "") +
          "</span>" +
        "</span>" +
        '<svg class="entity-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';

      card.addEventListener("click", function () {
        window.location.href = "afil-credencial.html?mascota=" + encodeURIComponent(mascota.idHub || mascota.id);
      });

      list.appendChild(card);
    });
  }

  function toTelHref(numero) {
    return "tel:" + numero.replace(/[^0-9+]/g, "");
  }

  function renderContacts() {
    document.getElementById("urgency-title").textContent = cfg.ayuda.urgencia.titulo;
    document.getElementById("urgency-contact").href = toTelHref(cfg.ayuda.urgencia.telefono);
    document.getElementById("urgency-contact").textContent = cfg.ayuda.urgencia.ctaLabel;

    document.getElementById("general-title").textContent = cfg.ayuda.general.titulo;
    document.getElementById("general-contact").href = toTelHref(cfg.ayuda.general.telefono);
    document.getElementById("general-contact").textContent = cfg.ayuda.general.ctaLabel;
  }

  function renderResultadosShortcut() {
    const mount = document.getElementById("resultados-shortcut");
    if (!mount) return;
    mount.href = "afil-resultados.html";
  }

  async function init() {
    if (!api.requireSession()) return;
    renderBrand();
    renderContacts();
    window.TabBar.render("inicio");
    try {
      afiliado = await api.me();
    } catch (e) {
      document.getElementById("entity-list").innerHTML =
        '<p class="empty-state">No pudimos cargar tus datos. <a href="afil-home.html">Reintentar</a></p>';
      return;
    }
    renderHeader();
    renderIdentityCard();
    renderEntityList();
    renderResultadosShortcut();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
