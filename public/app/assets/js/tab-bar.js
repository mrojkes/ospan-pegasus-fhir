/* =========================================================
   BARRA DE NAVEGACIÓN INFERIOR (genérica, reutilizable)
   Sólo se monta en pantallas de primer nivel (no en detalle
   de credencial, login, onboarding, etc). El activo muestra
   ícono + label; los inactivos muestran sólo ícono.
   Cambiar la cantidad/orden de items acá alcanza para
   reconfigurar toda la barra — ningún HTML la hardcodea.
   ========================================================= */
window.TabBar = (function () {
  const ITEMS = [
    {
      id: "inicio",
      label: "Inicio",
      href: "afil-home.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    },
    {
      id: "cartilla",
      label: "Cartilla",
      href: "afil-cartilla.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
    },
    {
      id: "salud",
      label: "Salud",
      href: "afil-clinica.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    },
    {
      id: "comunidad",
      label: "Comunidad",
      href: "afil-comunidad.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
      id: "perfil",
      label: "Perfil",
      href: "afil-perfil.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    },
  ];

  function render(activeId) {
    const mount = document.getElementById("tab-bar-mount");
    if (!mount) return;

    mount.innerHTML = ITEMS.map(function (item) {
      const isActive = item.id === activeId;
      return (
        '<a class="tab-bar-item' + (isActive ? " is-active" : "") + '" href="' + item.href + '">' +
          '<span class="tab-bar-icon">' + item.icon + "</span>" +
          '<span class="tab-bar-label">' + item.label + "</span>" +
        "</a>"
      );
    }).join("");

    document.body.classList.add("has-tab-bar");
  }

  return { render: render };
})();
