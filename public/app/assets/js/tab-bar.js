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
      id: "buscar",
      label: "Buscar",
      href: "afil-buscar.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
    },
    {
      id: "resultados",
      label: "Resultados",
      href: "afil-resultados.html",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
    },
    {
      id: "perfil",
      label: "Más",
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
