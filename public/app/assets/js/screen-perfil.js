/* =========================================================
   RENDER — Perfil del tutor
   ========================================================= */
(function () {
  const api = window.AppApi;
  const cfg = window.APP_CONFIG;
  let afiliado = null;

  function iniciales() {
    return (afiliado.nombre[0] || "") + (afiliado.apellido ? afiliado.apellido[0] : "");
  }

  function toTelHref(numero) {
    return "tel:" + numero.replace(/[^0-9+]/g, "");
  }

  function toWhatsappHref(numero, mensaje) {
    return "https://wa.me/" + numero + "?text=" + encodeURIComponent(mensaje || "");
  }

  function render() {
    document.getElementById("profile-avatar").textContent = iniciales();
    document.getElementById("profile-name").textContent = afiliado.nombre + " " + afiliado.apellido;
    document.getElementById("profile-subtitle").textContent = "Titular de la cuenta";
    document.getElementById("profile-numero").textContent = afiliado.numeroAfiliado;
    document.getElementById("profile-dni").textContent = afiliado.dni;
    document.getElementById("profile-estado").textContent =
      afiliado.estadoCuenta === "activo" ? "Activa" : "Suspendida";
    document.getElementById("profile-mascotas-count").textContent = afiliado.mascotas.length;
  }

  function renderContact() {
    document.getElementById("perfil-general-title").textContent = cfg.ayuda.general.titulo;
    document.getElementById("perfil-general-contact").href = toTelHref(cfg.ayuda.general.telefono);
    document.getElementById("perfil-general-contact").textContent =
      cfg.ayuda.general.ctaLabel + " · " + cfg.ayuda.general.telefono;

    document.getElementById("whatsapp-link").href = toWhatsappHref(
      cfg.ayuda.whatsapp.numero,
      cfg.ayuda.whatsapp.mensaje
    );
  }

  function wireLogout() {
    document.getElementById("logout-button").addEventListener("click", function () {
      api.logout();
      window.location.replace("afil-login.html");
    });
  }

  async function init() {
    if (!api.requireSession()) return;
    renderContact();
    wireLogout();
    window.TabBar.render("perfil");
    try { afiliado = await api.me(); render(); } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();
