/* =========================================================
   RENDER — Onboarding
   La imagen y el texto del botón salen de APP_CONFIG.onboarding.
   ========================================================= */
(function () {
  const cfg = window.APP_CONFIG;

  function init() {
    if (window.AppApi && window.AppApi.isLoggedIn()) { window.location.replace("afil-home.html"); return; }
    document.getElementById("onboarding-image").src = cfg.onboarding.imagen;
    document.getElementById("onboarding-image").alt = cfg.brand.nombre;
    document.getElementById("onboarding-cta").textContent = cfg.onboarding.ctaLabel;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
